import fs from 'fs/promises'
import path from 'path'

export const SQLITE_ROW_COLLECTIONS = new Set([
  'users',
  'chats',
  'stats',
  'sticker',
  'settings',
  'menfess',
])

const ROW_SEPARATOR = '\u0000'

const isObject = (value) => value !== null && typeof value === 'object'
const isPlainObject = (value) => isObject(value) && !Array.isArray(value)
const hasOwn = (target, key) => Object.prototype.hasOwnProperty.call(target || {}, key)

export function createDefaultDatabaseData() {
  return {
    users: {},
    chats: {},
    stats: {},
    sticker: {},
    settings: {},
    menfess: {},
    jidAliases: {},
    schedule: [],
    hostedBots: [],
  }
}

export function normalizeDatabaseData(data = {}) {
  return {
    ...createDefaultDatabaseData(),
    ...(data || {}),
  }
}

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback

  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function rowKey(collection, key) {
  return `${collection}${ROW_SEPARATOR}${key}`
}

function splitRowKey(key) {
  const index = key.indexOf(ROW_SEPARATOR)
  return [key.slice(0, index), key.slice(index + ROW_SEPARATOR.length)]
}

function getSqlite3Driver(module) {
  const sqlite3 = module?.default || module
  if (!sqlite3?.Database) {
    throw new Error('sqlite3 driver tidak valid.')
  }
  return sqlite3.Database
}

export class SqliteLowDbAdapter {
  constructor(filename) {
    if (!filename) throw new Error('SQLite filename is required.')

    this.filename = filename
    this.db = null
    this.backend = ''
    this.trackedData = null
    this.proxyCache = new WeakMap()
    this.collectionProxyCache = new Map()
    this.dirtyRows = new Set()
    this.deletedRows = new Set()
    this.dirtyCollections = new Set()
    this.dirtyMeta = new Set()
  }

  async open() {
    if (this.db) return

    await fs.mkdir(path.dirname(this.filename), { recursive: true })

    try {
      const [{ open }, sqlite3Module] = await Promise.all([
        import('sqlite'),
        import('sqlite3'),
      ])

      this.db = await open({
        filename: this.filename,
        driver: getSqlite3Driver(sqlite3Module),
      })
      this.backend = 'sqlite'
    } catch (error) {
      try {
        const { DatabaseSync } = await import('node:sqlite')
        this.db = new DatabaseSync(this.filename)
        this.backend = 'node:sqlite'
      } catch {
        throw new Error(
          `Gagal membuka SQLite. Install dependency dulu: npm install sqlite sqlite3\nDetail: ${error?.message || error}`
        )
      }
    }

    await this.exec(`
      PRAGMA busy_timeout = 5000;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA temp_store = MEMORY;
      CREATE TABLE IF NOT EXISTS kv_store (
        collection TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (collection, key)
      );
      CREATE TABLE IF NOT EXISTS meta_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `)
  }

  async close() {
    if (!this.db) return

    if (this.backend === 'sqlite') {
      await this.db.close()
    } else {
      this.db.close()
    }

    this.db = null
  }

  async exec(sql) {
    await this.open()
    return this.db.exec(sql)
  }

  async all(sql, ...params) {
    await this.open()

    if (this.backend === 'sqlite') {
      return this.db.all(sql, ...params)
    }

    return this.db.prepare(sql).all(...params)
  }

  async run(sql, ...params) {
    await this.open()

    if (this.backend === 'sqlite') {
      return this.db.run(sql, ...params)
    }

    return this.db.prepare(sql).run(...params)
  }

  async checkpoint(mode = 'PASSIVE') {
    const normalizedMode = String(mode || 'PASSIVE').toUpperCase()
    const pragmaMode = ['PASSIVE', 'FULL', 'RESTART', 'TRUNCATE'].includes(normalizedMode)
      ? normalizedMode
      : 'PASSIVE'

    await this.exec(`PRAGMA wal_checkpoint(${pragmaMode})`)
  }

  async transaction(work) {
    await this.exec('BEGIN IMMEDIATE TRANSACTION')
    try {
      const result = await work()
      await this.exec('COMMIT')
      return result
    } catch (error) {
      await this.exec('ROLLBACK').catch(() => {})
      throw error
    }
  }

  async read() {
    await this.open()

    const data = createDefaultDatabaseData()
    const rows = await this.all('SELECT collection, key, value FROM kv_store')

    for (const row of rows) {
      if (!data[row.collection] || !isPlainObject(data[row.collection])) {
        data[row.collection] = {}
      }
      data[row.collection][row.key] = parseJson(row.value, null)
    }

    const metaRows = await this.all('SELECT key, value FROM meta_store')
    for (const row of metaRows) {
      data[row.key] = parseJson(row.value, null)
    }

    return data
  }

  wrapData(data) {
    if (!isObject(data)) return data
    if (data === this.trackedData) return data

    this.proxyCache = new WeakMap()
    this.collectionProxyCache = new Map()

    const target = data
    const proxy = new Proxy(target, {
      get: (object, property, receiver) => {
        if (typeof property === 'symbol') {
          return Reflect.get(object, property, receiver)
        }

        const key = String(property)
        const value = Reflect.get(object, property, receiver)

        if (SQLITE_ROW_COLLECTIONS.has(key) && isPlainObject(value)) {
          return this.wrapCollection(key, value)
        }

        return this.wrapMutable(value, () => this.markMetaDirty(key))
      },
      set: (object, property, value, receiver) => {
        const key = String(property)
        const ok = Reflect.set(object, property, value, receiver)

        if (SQLITE_ROW_COLLECTIONS.has(key)) {
          this.markCollectionDirty(key)
          this.collectionProxyCache.delete(key)
        } else {
          this.markMetaDirty(key)
        }

        return ok
      },
      deleteProperty: (object, property) => {
        const key = String(property)
        const existed = hasOwn(object, key)
        const ok = Reflect.deleteProperty(object, property)

        if (existed) {
          if (SQLITE_ROW_COLLECTIONS.has(key)) {
            this.markCollectionDirty(key)
            this.collectionProxyCache.delete(key)
          } else {
            this.markMetaDirty(key)
          }
        }

        return ok
      },
    })

    this.trackedData = proxy
    return proxy
  }

  wrapCollection(collection, value) {
    if (this.collectionProxyCache.has(collection)) {
      return this.collectionProxyCache.get(collection)
    }

    const proxy = new Proxy(value, {
      get: (object, property, receiver) => {
        if (typeof property === 'symbol') {
          return Reflect.get(object, property, receiver)
        }

        const key = String(property)
        const current = Reflect.get(object, property, receiver)
        return this.wrapMutable(current, () => this.markRowDirty(collection, key))
      },
      set: (object, property, newValue, receiver) => {
        const key = String(property)
        const ok = Reflect.set(object, property, newValue, receiver)
        this.markRowDirty(collection, key)
        return ok
      },
      deleteProperty: (object, property) => {
        const key = String(property)
        const existed = hasOwn(object, key)
        const ok = Reflect.deleteProperty(object, property)

        if (existed) {
          this.markRowDeleted(collection, key)
        }

        return ok
      },
    })

    this.collectionProxyCache.set(collection, proxy)
    return proxy
  }

  wrapMutable(value, markDirty) {
    if (!isObject(value)) return value

    const cached = this.proxyCache.get(value)
    if (cached) return cached

    const proxy = new Proxy(value, {
      get: (object, property, receiver) => {
        const current = Reflect.get(object, property, receiver)
        return this.wrapMutable(current, markDirty)
      },
      set: (object, property, newValue, receiver) => {
        const ok = Reflect.set(object, property, newValue, receiver)
        markDirty()
        return ok
      },
      deleteProperty: (object, property) => {
        const existed = hasOwn(object, property)
        const ok = Reflect.deleteProperty(object, property)
        if (existed) markDirty()
        return ok
      },
    })

    this.proxyCache.set(value, proxy)
    return proxy
  }

  markRowDirty(collection, key) {
    const id = rowKey(collection, key)
    this.dirtyRows.add(id)
    this.deletedRows.delete(id)
    this.markGlobalDirty()
  }

  markRowDeleted(collection, key) {
    const id = rowKey(collection, key)
    this.deletedRows.add(id)
    this.dirtyRows.delete(id)
    this.markGlobalDirty()
  }

  markCollectionDirty(collection) {
    this.dirtyCollections.add(collection)
    this.markGlobalDirty()
  }

  markMetaDirty(key) {
    this.dirtyMeta.add(key)
    this.markGlobalDirty()
  }

  markGlobalDirty() {
    if (typeof globalThis.markDbDirty === 'function') {
      globalThis.markDbDirty()
    }
  }

  hasTrackedChanges() {
    return (
      this.dirtyRows.size > 0 ||
      this.deletedRows.size > 0 ||
      this.dirtyCollections.size > 0 ||
      this.dirtyMeta.size > 0
    )
  }

  async write(data) {
    await this.open()

    if (data !== this.trackedData) {
      await this.writeFull(data)
      return
    }

    if (!this.hasTrackedChanges()) return

    await this.writeTracked(data)
  }

  async writeFull(data = {}) {
    const now = Date.now()

    this.clearDirty()

    const collectionsToReplace = []
    const metaToUpsert = []
    for (const [collection, entries] of Object.entries(data || {})) {
      if (SQLITE_ROW_COLLECTIONS.has(collection) && isPlainObject(entries)) {
        const serializedEntries = []
        for (const [key, value] of Object.entries(entries || {})) {
          serializedEntries.push({
            key,
            serializedValue: JSON.stringify(value ?? null)
          })
        }
        collectionsToReplace.push({ collection, serializedEntries })
      } else {
        metaToUpsert.push({
          key: collection,
          serializedValue: JSON.stringify(entries ?? null)
        })
      }
    }

    await this.transaction(async () => {
      await this.run('DELETE FROM kv_store')
      await this.run('DELETE FROM meta_store')

      for (const { collection, serializedEntries } of collectionsToReplace) {
        for (const { key, serializedValue } of serializedEntries) {
          await this.upsertSerializedRow(collection, key, serializedValue, now)
        }
      }

      for (const { key, serializedValue } of metaToUpsert) {
        await this.upsertSerializedMeta(key, serializedValue, now)
      }
    })
  }

  async writeTracked(data = {}) {
    const now = Date.now()

    const dirtyCollections = [...this.dirtyCollections]
    const dirtyRows = [...this.dirtyRows]
    const deletedRows = [...this.deletedRows]
    const dirtyMeta = [...this.dirtyMeta]

    this.dirtyCollections.clear()
    this.dirtyRows.clear()
    this.deletedRows.clear()
    this.dirtyMeta.clear()

    const collectionsToReplace = []
    for (const collection of dirtyCollections) {
      const entries = data?.[collection] || {}
      const serializedEntries = []
      for (const [key, value] of Object.entries(entries)) {
        serializedEntries.push({
          key,
          serializedValue: JSON.stringify(value ?? null)
        })
      }
      collectionsToReplace.push({ collection, serializedEntries })
    }

    const rowsToUpsert = []
    for (const id of dirtyRows) {
      const [collection, key] = splitRowKey(id)
      if (dirtyCollections.includes(collection)) continue

      if (!hasOwn(data?.[collection], key)) {
        deletedRows.push(id)
        continue
      }

      const value = data[collection][key]
      rowsToUpsert.push({
        collection,
        key,
        serializedValue: JSON.stringify(value ?? null)
      })
    }

    const rowsToDelete = []
    for (const id of deletedRows) {
      const [collection, key] = splitRowKey(id)
      if (dirtyCollections.includes(collection)) continue
      rowsToDelete.push({ collection, key })
    }

    const metaToUpsert = []
    const metaToDelete = []
    for (const key of dirtyMeta) {
      if (SQLITE_ROW_COLLECTIONS.has(key)) continue

      if (!hasOwn(data, key)) {
        metaToDelete.push(key)
        continue
      }

      const value = data[key]
      metaToUpsert.push({
        key,
        serializedValue: JSON.stringify(value ?? null)
      })
    }

    await this.transaction(async () => {
      for (const { collection, serializedEntries } of collectionsToReplace) {
        await this.run('DELETE FROM kv_store WHERE collection = ?', collection)
        for (const { key, serializedValue } of serializedEntries) {
          await this.upsertSerializedRow(collection, key, serializedValue, now)
        }
      }

      for (const { collection, key } of rowsToDelete) {
        await this.run(
          'DELETE FROM kv_store WHERE collection = ? AND key = ?',
          collection,
          key
        )
      }

      for (const { collection, key, serializedValue } of rowsToUpsert) {
        await this.upsertSerializedRow(collection, key, serializedValue, now)
      }

      for (const key of metaToDelete) {
        await this.run('DELETE FROM meta_store WHERE key = ?', key)
      }

      for (const { key, serializedValue } of metaToUpsert) {
        await this.upsertSerializedMeta(key, serializedValue, now)
      }
    })
  }

  async replaceCollection(collection, entries = {}, now = Date.now(), deleteExisting = true) {
    if (deleteExisting) {
      await this.run('DELETE FROM kv_store WHERE collection = ?', collection)
    }

    for (const [key, value] of Object.entries(entries || {})) {
      await this.upsertRow(collection, key, value, now)
    }
  }

  async upsertRow(collection, key, value, now = Date.now()) {
    await this.upsertSerializedRow(collection, key, JSON.stringify(value ?? null), now)
  }

  async upsertSerializedRow(collection, key, serializedValue, now = Date.now()) {
    await this.run(
      `
      INSERT INTO kv_store (collection, key, value, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(collection, key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
      `,
      collection,
      key,
      serializedValue,
      now
    )
  }

  async upsertMeta(key, value, now = Date.now()) {
    await this.upsertSerializedMeta(key, JSON.stringify(value ?? null), now)
  }

  async upsertSerializedMeta(key, serializedValue, now = Date.now()) {
    await this.run(
      `
      INSERT INTO meta_store (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
      `,
      key,
      serializedValue,
      now
    )
  }

  clearDirty() {
    this.dirtyRows.clear()
    this.deletedRows.clear()
    this.dirtyCollections.clear()
    this.dirtyMeta.clear()
  }
}

export async function createSqliteAdapter(filename) {
  const adapter = new SqliteLowDbAdapter(filename)
  await adapter.open()
  return adapter
}
