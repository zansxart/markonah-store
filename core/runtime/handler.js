/**
 * @credit zansxart
 * tiktok: https://tiktok.com/zansxart
 * Instagram: https://instagram.com/zansxart
 */

import { format } from 'util'
import { fileURLToPath } from 'url'
import path, { join } from 'path'
import { unwatchFile, watchFile } from 'fs'
import chalk from 'chalk'
import { smsg } from '../services/runtime/simple.js'
import { applyGroupParticipantAction } from '../services/runtime/user-target.js'
import { getFilename, getDirname, getRequire } from '../services/runtime/utils.js'
import DATA from '../services/database/DB_LOCAL.js'
import { failed } from '../services/system/failed.js'
import { protect } from '../services/system/protector.js'
import * as Func from '../services/system/function.js'
// [PERF] Lazy cached import — print.js pakai global.__filename di top-level,
// jadi gak bisa di-import sebelum main.js set global.__filename.
// Import sekali saat pertama kali dipanggil, bukan setiap pesan.
let _printLogModule = null
async function getPrintLog() {
  if (_printLogModule) return _printLogModule
  const mod = await import('../services/runtime/print.js')
  _printLogModule = mod.default || mod
  return _printLogModule
}

// [PERF] Coba static import storeLidPnMapping, fallback ke null kalau gagal
let _storeLidPnMapping = null
try {
  const baileysModule = await import('@zansxart/baileys')
  _storeLidPnMapping = baileysModule.storeLidPnMapping || baileysModule.default?.storeLidPnMapping || null
} catch {}

const isNumber = (x) => typeof x === 'number' && !isNaN(x)
const Regex2 = (str) => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
const GROUP_METADATA_CACHE_TTL = 24 * 60 * 60 * 1000
// [PERF] In-flight dedup — hindari thundering herd saat spam di group baru
const pendingGroupFetches = new Map()
const SUBBOT_OWNER_DISABLED_MESSAGE = 'Perintah owner dan rowner dinonaktifkan di subbot.'

// [PERF] Concurrency limiter — batasi max pesan yang diproses paralel
// Tanpa ini, 50 pesan spam = 50 proses bersamaan yang masing-masing
// menjalankan DB_LOCAL.js + plugin, menyumbat event loop
const MAX_CONCURRENT_MESSAGES = 10
let _activeMessages = 0
const _messageQueue = []

async function _withConcurrencyLimit(fn) {
    if (_activeMessages >= MAX_CONCURRENT_MESSAGES) {
        await new Promise(resolve => _messageQueue.push(resolve))
    }
    _activeMessages++
    try {
        return await fn()
    } finally {
        _activeMessages--
        if (_messageQueue.length > 0) {
            const next = _messageQueue.shift()
            next()
        }
    }
}

// [PERF] Cleanup cooldowns tiap 60 detik — hapus entry yang sudah expired
// Tanpa ini, conn.cooldowns terus membengkak tanpa batas
const COOLDOWN_CLEANUP_INTERVAL_MS = 60 * 1000
const COOLDOWN_EXPIRY_MS = 60 * 1000 // hapus entry > 1 menit
let _lastCooldownCleanup = Date.now()

function _cleanupCooldowns(conn) {
    const now = Date.now()
    if (now - _lastCooldownCleanup < COOLDOWN_CLEANUP_INTERVAL_MS) return
    _lastCooldownCleanup = now
    if (!conn.cooldowns) return
    for (const [id, time] of Object.entries(conn.cooldowns)) {
        if (now - time > COOLDOWN_EXPIRY_MS) {
            delete conn.cooldowns[id]
        }
    }
}

// [PERF] Max jidAliases — cegah pertumbuhan tanpa batas
const MAX_JID_ALIASES = 3000

function getOwnerNumber() {
  const ownerSource = Array.isArray(global.owner) ? global.owner[0] : global.owner
  const ownerValue = Array.isArray(ownerSource) ? ownerSource[0] : ownerSource
  return String(ownerValue || '').replace(/\D/g, '')
}

function matchesPrefixSource(source, text = '') {
  if (!text) return false

  if (source instanceof RegExp) {
    source.lastIndex = 0
    const matched = source.test(text)
    source.lastIndex = 0
    return matched
  }

  if (Array.isArray(source)) {
    return source.some((entry) => matchesPrefixSource(entry, text))
  }

  if (typeof source === 'string') {
    return new RegExp(Regex2(source)).test(text)
  }

  return false
}

function resolvePrefixMatch(source, text = '') {
  if (source instanceof RegExp) {
    source.lastIndex = 0
    const exec = source.exec(text)
    source.lastIndex = 0
    return [exec, source]
  }

  if (Array.isArray(source)) {
    const pairs = source.map((entry) => {
      const re = entry instanceof RegExp ? entry : new RegExp(Regex2(entry))
      re.lastIndex = 0
      const exec = re.exec(text)
      re.lastIndex = 0
      return [exec, re]
    })

    return pairs.find(([exec]) => exec !== null) || pairs[0] || [null, new RegExp()]
  }

  if (typeof source === 'string') {
    const re = new RegExp(Regex2(source))
    return [re.exec(text), re]
  }

  return [null, new RegExp()]
}

function getMatchedText(match) {
  const execMatch = Array.isArray(match) ? match[0] : null
  return Array.isArray(execMatch) ? String(execMatch[0] || '') : ''
}

function normalizeCommandLabel(value = '') {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''

  const stripped = trimmed.replace(/^[^a-zA-Z0-9]+/, '').trim()
  return String(stripped || trimmed).toLowerCase()
}

function createCommandContext(text = '', match) {
  const result = getMatchedText(match)
  const usedPrefix = result || ''
  const noPrefix = result ? text.slice(result.length).trim() : text.trim()
  const [rawCommand = '', ...args] = noPrefix ? noPrefix.split(/\s+/) : ['']
  const command = rawCommand.toLowerCase()

  return {
    match,
    result,
    usedPrefix,
    noPrefix,
    command,
    args,
    text: args.join(' '),
    isAccessible: Boolean(match && match[0] !== null),
  }
}

function createCustomPrefixContext(text = '', match) {
  const result = getMatchedText(match)
  const usedPrefix = result || ''
  const noPrefix = result ? text.slice(result.length).trim() : text.trim()
  const args = noPrefix ? noPrefix.split(/\s+/) : []
  const command = normalizeCommandLabel(result) || (args[0] || '').toLowerCase()

  return {
    match,
    result,
    usedPrefix,
    noPrefix,
    command,
    args,
    text: noPrefix,
    isAccessible: Boolean(match && match[0] !== null),
  }
}

function matchesCommandPattern(pattern, command = '', text = '') {
  if (pattern instanceof RegExp) {
    pattern.lastIndex = 0
    const matched = pattern.test(command) || pattern.test(text)
    pattern.lastIndex = 0
    return matched
  }

  if (Array.isArray(pattern)) {
    return pattern.some((value) => matchesCommandPattern(value, command, text))
  }

  if (typeof pattern === 'string') {
    return pattern.toLowerCase() === command
  }

  return false
}

// [PERF] Cache pluginRuntime — rebuild hanya saat plugin berubah
let _cachedPluginRuntime = null
let _cachedPluginVersion = 0

export function invalidatePluginRuntime() {
  _cachedPluginRuntime = null
  _cachedPluginVersion++
}

function buildPluginRuntime() {
  const entries = Object.entries(global.plugins || {}).map(([name, plugin]) => ({
    name,
    plugin,
    normalizedPluginName: String(name).replace(/\\/g, '/'),
    hasAll: typeof plugin?.all === 'function',
    hasBefore: typeof plugin?.before === 'function',
    isRunnable: typeof plugin === 'function' || typeof plugin?.run === 'function',
    groupOnly: Boolean(plugin?.group),
    privateOnly: Boolean(plugin?.private),
    customPrefix: plugin?.customPrefix || null,
    stringCommands: new Set(),
    regexCommands: [],
  }))
  return {
    orderedEntries: entries,
    customPrefixEntries: entries.filter((entry) => entry.customPrefix),
  }
}

function getPluginRuntime() {
  if (global.pluginRuntime) return global.pluginRuntime
  if (_cachedPluginRuntime) return _cachedPluginRuntime
  _cachedPluginRuntime = buildPluginRuntime()
  return _cachedPluginRuntime
}

function scoreUserRecord(record = {}) {
  if (!record || typeof record !== 'object') return 0

  let score = 0
  if (record.registered) score += 1000
  if (record.owner) score += 400
  if (record.premium) score += 200
  if (record.banned) score += 100
  if (Number(record.level) > 0) score += 20
  if (Number(record.exp) > 0) score += 10
  if (Number(record.money) > 0) score += 5
  if (typeof record.name === 'string' && record.name.trim()) score += 5
  return score
}

function createMinimalUserRecord() {
  return {
    premium: false,
    owner: false,
    registered: false,
    banned: false,
    level: 0,
    limit: 0,
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function selectBestUserKey(dbUser, candidateKeys = [], fallbackKey = '') {
  const uniqueKeys = [...new Set(
    (Array.isArray(candidateKeys) ? candidateKeys : [])
      .filter((key) => typeof key === 'string' && key)
  )]

  let bestKey = fallbackKey
  let bestScore = scoreUserRecord(dbUser?.[fallbackKey])

  for (const candidate of uniqueKeys) {
    const score = scoreUserRecord(dbUser?.[candidate])
    if (score > bestScore) {
      bestKey = candidate
      bestScore = score
    }
  }

  return bestKey || uniqueKeys[0] || fallbackKey
}

function isPotentialCommandText(conn, text = '', botSettings = {}) {
  if (!text) return false
  if (botSettings?.noprefix) return true

  if (matchesPrefixSource(conn?.prefix || global.prefix, text)) return true

  return (getPluginRuntime().customPrefixEntries || []).some((entry) => {
    const plugin = entry?.plugin
    if (!plugin || plugin.disabled || !entry.customPrefix) return false
    return matchesPrefixSource(entry.customPrefix, text)
  })
}

function formatRuntimeError(error) {
  if (typeof error === 'string') return error.trim()
  if (error == null) return 'Terjadi kesalahan tanpa detail.'

  if (typeof error === 'object') {
    const message = typeof error.message === 'string' ? error.message.trim() : ''
    if (message) return message.replace(/^(error|typeerror|referenceerror|syntaxerror):\s*/i, '')

    const formatted = format(error).trim()
    if (formatted) return formatted
  }

  return String(error).trim() || 'Terjadi kesalahan tanpa detail.'
}

function getGroupMetadataCache(conn) {
  if (!conn.groupMetadataCache) {
    conn.groupMetadataCache = new Map()
  }

  return conn.groupMetadataCache
}

async function getCachedGroupMetadata(conn, chatId) {
  const cache = getGroupMetadataCache(conn)
  const now = Date.now()
  const cached = cache.get(chatId)

  if (cached && cached.expiresAt > now) {
    return cached.value
  }

  if (cached) {
    cache.delete(chatId)
  }

  const chatStoreMetadata = conn.chats?.[chatId]?.metadata
  const hasStoreMetadata = Boolean(
    chatStoreMetadata &&
    (
      chatStoreMetadata.subject ||
      chatStoreMetadata.desc ||
      chatStoreMetadata.participants?.length
    )
  )

  if (hasStoreMetadata) {
    cache.set(chatId, {
      value: chatStoreMetadata,
      expiresAt: now + GROUP_METADATA_CACHE_TTL,
    })

    return chatStoreMetadata
  }

  // [PERF] In-flight dedup — kalau sudah ada fetch yang sedang jalan untuk chatId ini,
  // tunggu result-nya daripada bikin request baru (hindari thundering herd saat spam)
  if (pendingGroupFetches.has(chatId)) {
    return pendingGroupFetches.get(chatId)
  }

  const fetchPromise = (async () => {
    let metadata = null
    try {
      metadata = await conn.groupMetadata(chatId)
    } catch (error) {
      throw error
    } finally {
      pendingGroupFetches.delete(chatId)
    }

    if (!metadata) return {}

    cache.set(chatId, {
      value: metadata,
      expiresAt: now + GROUP_METADATA_CACHE_TTL,
    })

    if (conn.chats?.[chatId]) {
      conn.chats[chatId].metadata = metadata
    }

    return metadata
  })()

  pendingGroupFetches.set(chatId, fetchPromise)
  return fetchPromise
}

/**
 * [PERF] Synchronous cache-only lookup — returns cached metadata immediately or null
 * No network fetch, no await. Used as fast path in handler to avoid blocking.
 */
function getCachedGroupMetadataSync(conn, chatId) {
  const cache = getGroupMetadataCache(conn)
  const now = Date.now()
  const cached = cache.get(chatId)

  if (cached && cached.expiresAt > now) {
    return cached.value
  }

  // Also check conn.chats store
  const chatStoreMetadata = conn.chats?.[chatId]?.metadata
  if (chatStoreMetadata && (chatStoreMetadata.subject || chatStoreMetadata.participants?.length)) {
    // Write back to cache for next time
    cache.set(chatId, {
      value: chatStoreMetadata,
      expiresAt: now + GROUP_METADATA_CACHE_TTL,
    })
    return chatStoreMetadata
  }

  return null
}

/**
 * Main Message Handler
 * @param {import('@whiskeysockets/baileys').BaileysEventMap['messages.upsert']} chatUpdate 
 */
export async function handler(chatUpdate) {
  if (!chatUpdate?.messages?.length) return

  const conn = this
  const messages = chatUpdate.messages

  // [PERF] pushMessage fire-and-forget — jangan block handler sama sekali
  conn.pushMessage(messages).catch(console.error)

  // [PERF] Cleanup cooldowns secara berkala
  _cleanupCooldowns(conn)

  // Proses setiap pesan secara concurrent (paralel penuh)
  await Promise.all(messages.map(rawMsg => 
    processOneMessage.call(conn, rawMsg, chatUpdate).catch(e => {
      console.error('[HANDLER] Error processing message:', e)
    })
  ))
}

/**
 * Process a single message — dipecah dari handler supaya bisa dijalankan concurrent
 */
async function processOneMessage(rawMsg, chatUpdate) {
  let m = rawMsg
  if (!m) return

  // pushMessage sudah dipanggil di handler() untuk seluruh batch

  // Update activity timestamp untuk health monitor
  if (typeof global.lastActivityAt !== 'undefined') {
    global.lastActivityAt = Date.now()
  }

  try {
    try {
      m = smsg(this, m) || m
    } catch (e) {
      console.error('[HANDLER] Message parsing failed:', e)
      return
    }

    if (!m) return

    m.exp = 0
    m.limit = false

    const conn = this
    const areJidsSameUser = (jid1, jid2) => conn.decodeJid(jid1) === conn.decodeJid(jid2)
    const senderJid = m.sender ? conn.decodeJid(m.sender) : null

    let groupMetadata = {}
    let participants = []

    if (m.isGroup) {
      try {
        // [PERF] Non-blocking group metadata — pakai cache dulu, fetch di background kalau miss
        groupMetadata = getCachedGroupMetadataSync(conn, m.chat)
        if (!groupMetadata) {
          // Cache miss — fetch async tapi jangan block handler
          // Pakai await tapi dengan timeout pendek supaya gak stuck
          groupMetadata = await Promise.race([
            getCachedGroupMetadata(conn, m.chat),
            new Promise(resolve => setTimeout(() => resolve({}), 3000))
          ])
        }
      } catch (e) {
        groupMetadata = {}
      }
      participants = groupMetadata.participants || []
    }

    const { users: dbUser, chats: dbChat, settings: dbBot } = global.db.data
    const dbJidAliases = isPlainObject(global.db.data.jidAliases)
      ? global.db.data.jidAliases
      : (global.db.data.jidAliases = {})

    // Auto-register bot's own LID-to-PN alias if available
    const myLid = conn.authState?.creds?.me?.lid
    const myPhoneJid = conn.user?.id ? (conn.decodeJid ? conn.decodeJid(conn.user.id) : conn.user.id) : null
    if (myLid && myPhoneJid) {
      dbJidAliases[myLid] = myPhoneJid
      dbJidAliases[myLid.split('@')[0]] = myPhoneJid
    }

    const botJidNormalized = conn.user?.jid || myPhoneJid || conn.user?.id || ''
    const botSettings = dbBot[botJidNormalized] || {}

    const buildJidCandidates = (jid, extraValues = []) => {
      const candidates = new Set()

      const pushCandidate = (value) => {
        if (!value || typeof value !== 'string') return

        const trimmed = value.trim()
        if (!trimmed) return

        candidates.add(trimmed)

        const decoded = conn.decodeJid ? conn.decodeJid(trimmed) : trimmed
        if (decoded) candidates.add(decoded)

        const bareDigits = String(decoded || trimmed).replace(/\D/g, '')
        if (bareDigits) {
          candidates.add(`${bareDigits}@s.whatsapp.net`)
          candidates.add(`${bareDigits}@lid`)
        }
      }

      pushCandidate(jid)
      for (const value of extraValues) pushCandidate(value)

      return candidates
    }

    const hasIdentityMatch = (sourceCandidates, values = []) => {
      if (!(sourceCandidates instanceof Set) || !sourceCandidates.size) return false

      for (const value of values) {
        const targetCandidates = buildJidCandidates(value)
        for (const candidate of sourceCandidates) {
          if (targetCandidates.has(candidate)) return true
        }
      }

      return false
    }

    const registerJidAlias = (canonicalJid, values = []) => {
      if (!canonicalJid || typeof canonicalJid !== 'string') return canonicalJid

      const aliasCandidates = new Set()
      for (const value of values) {
        const candidates = buildJidCandidates(value)
        for (const candidate of candidates) aliasCandidates.add(candidate)
      }

      let changed = false
      for (const alias of aliasCandidates) {
        if (!alias || alias.endsWith('@g.us') || alias === canonicalJid) continue
        if (dbJidAliases[alias] === canonicalJid) continue
        dbJidAliases[alias] = canonicalJid
        changed = true
      }

      if (changed) {
        global.markDbDirty?.()
        // [PERF] Sync alias ke Baileys pakai static import (bukan dynamic import tiap kali)
        if (typeof _storeLidPnMapping === 'function') {
          for (const alias of aliasCandidates) {
            if (alias && alias.endsWith('@lid') && canonicalJid.endsWith('@s.whatsapp.net')) {
              _storeLidPnMapping(alias, canonicalJid)
            } else if (alias && alias.endsWith('@s.whatsapp.net') && canonicalJid.endsWith('@lid')) {
              _storeLidPnMapping(canonicalJid, alias)
            }
          }
        }

        // [PERF] Pruning jidAliases kalau sudah melewati batas
        // Tanpa ini, jidAliases terus membengkak (sekarang sudah 5000+)
        const aliasKeys = Object.keys(dbJidAliases)
        if (aliasKeys.length > MAX_JID_ALIASES) {
          // Hapus setengah entry terlama (yang pertama ditambahkan)
          const toRemove = aliasKeys.slice(0, Math.floor(aliasKeys.length / 2))
          for (const key of toRemove) {
            delete dbJidAliases[key]
          }
          console.log(`[PERF] Pruned ${toRemove.length} old jidAliases (was ${aliasKeys.length})`)
        }
      }
      return canonicalJid
    }

    const findGroupParticipant = (jid, extraValues = []) => {
      if (!m.isGroup) return null

      const senderCandidates = buildJidCandidates(jid, extraValues)
      if (!senderCandidates.size) return null

      return participants.find((participant) => {
        const participantCandidates = buildJidCandidates(participant?.id || participant?.jid || participant?.lid, [
          participant?.id,
          participant?.jid,
          participant?.lid,
          participant?.phoneNumber,
          participant?.pn,
        ])

        for (const candidate of senderCandidates) {
          if (participantCandidates.has(candidate)) return true
        }

        return false
      }) || null
    }

    const normalizeSender = (jid) => {
      if (!jid) return jid

      try {
        const decoded = conn.decodeJid ? conn.decodeJid(jid) : jid
        const aliasCandidates = buildJidCandidates(jid, [decoded])

        for (const alias of aliasCandidates) {
          const canonical = dbJidAliases[alias]
          if (typeof canonical === 'string' && canonical) {
            return canonical
          }
        }

        const bareDigits = String(decoded || '').replace(/\D/g, '')

        if (bareDigits && !String(decoded).includes('@')) {
          return `${bareDigits}@s.whatsapp.net`
        }

        if (m.isGroup) {
          const part = findGroupParticipant(jid, [decoded])

          if (part?.phoneNumber) {
            const digits = String(part.phoneNumber).replace(/\D/g, '')
            if (digits) {
              return registerJidAlias(`${digits}@s.whatsapp.net`, [
                jid,
                decoded,
                part?.id,
                part?.jid,
                part?.lid,
                part?.phoneNumber,
                part?.pn,
              ])
            }
          }

          if (part?.pn) {
            const digits = String(part.pn).replace(/\D/g, '')
            if (digits) {
              return registerJidAlias(`${digits}@s.whatsapp.net`, [
                jid,
                decoded,
                part?.id,
                part?.jid,
                part?.lid,
                part?.phoneNumber,
                part?.pn,
              ])
            }
          }

          const participantId = part?.id || part?.jid || part?.lid
          if (participantId) {
            const participantJid = conn.decodeJid ? conn.decodeJid(participantId) : participantId
            // Hanya register alias jika hasil resolusi bukan @lid (sudah @s.whatsapp.net)
            if (participantJid && !String(participantJid).endsWith('@lid')) {
              return registerJidAlias(participantJid, [
                jid,
                decoded,
                part?.id,
                part?.jid,
                part?.lid,
                part?.phoneNumber,
                part?.pn,
              ])
            }
          }
        }

        // Fallback: jika decoded masih @lid, coba reverse-lookup di dbJidAliases
        // [PERF] Optimasi: langsung cek key spesifik, bukan scan seluruh Object.entries
        if (decoded && String(decoded).endsWith('@lid')) {
          const strippedLid = String(decoded).replace(/@lid$/, '')
          // Cek langsung key yang kemungkinan cocok (O(1) lookup, bukan O(n) scan)
          const directLookup = dbJidAliases[decoded] || dbJidAliases[strippedLid] || dbJidAliases[jid]
          if (typeof directLookup === 'string' && directLookup.endsWith('@s.whatsapp.net')) {
            return directLookup
          }
        }

        return decoded
      } catch (e) {
        return jid
      }
    }

    const normalizeMentionedJids = (jids = []) => [...new Set(
      (Array.isArray(jids) ? jids : [])
        .map((jid) => normalizeSender(jid))
        .filter(Boolean)
    )]

    const rawSender = m.rawSender || m.sender
    const rawMentionedJid = Array.isArray(m.rawMentionedJid)
      ? [...m.rawMentionedJid]
      : (Array.isArray(m.mentionedJid) ? [...m.mentionedJid] : [])
    const senderId = normalizeSender(m.sender) || m.sender
    m.realSender = senderId
    registerJidAlias(senderId, [
      rawSender,
      m.sender,
      senderJid,
      m.key?.participant,
      conn.decodeJid?.(m.key?.participant),
    ])

    const legacySenderKeys = [...new Set([
      m.sender,
      conn.decodeJid?.(m.sender),
      m.key?.participant,
      conn.decodeJid?.(m.key?.participant),
    ].filter((jid) => typeof jid === 'string' && jid && !jid.endsWith('@g.us') && jid !== senderId))]

    Object.defineProperty(m, 'sender', {
      get() {
        return (
          m.realSender ||
          m.key?.participant ||
          (m.key?.fromMe && conn.user?.jid) ||
          undefined
        )
      }
    })

    try {
      DATA(m, this)
    } catch (e) {
      console.error('[HANDLER] Database initialization failed:', e)
    }

    const normalizedMentionedJid = normalizeMentionedJids(rawMentionedJid)
    Object.defineProperty(m, 'mentionedJid', {
      value: normalizedMentionedJid,
      enumerable: true,
      configurable: true,
      writable: true,
    })
    m.mentionedJidNormalized = normalizedMentionedJid

    if (m.quoted) {
      const rawQuotedSender = m.quoted.rawSender || m.quoted.sender
      const rawQuotedMentionedJid = Array.isArray(m.quoted.rawMentionedJid)
        ? [...m.quoted.rawMentionedJid]
        : (Array.isArray(m.quoted.mentionedJid) ? [...m.quoted.mentionedJid] : [])
      const quotedSender = normalizeSender(rawQuotedSender) || rawQuotedSender
      const quotedMentionedJid = normalizeMentionedJids(rawQuotedMentionedJid)

      // Pre-compute quoted fromMe using normalized sender & direct identity comparisons (handles LID ↔ phone JID mismatch)
      const botLid = conn.authState?.creds?.me?.lid
      const botPhoneJid = conn.user?.id ? (conn.decodeJid ? conn.decodeJid(conn.user.id) : conn.user.id) : null
      const botPhoneId = conn.user?.id
      const botJid = conn.user?.jid

      const quotedFromMe = Boolean(
        quotedSender && (
          (botPhoneId && areJidsSameUser(quotedSender, botPhoneId)) ||
          (botPhoneJid && areJidsSameUser(quotedSender, botPhoneJid)) ||
          (botJid && areJidsSameUser(quotedSender, botJid)) ||
          (botLid && areJidsSameUser(quotedSender, botLid)) ||
          (rawQuotedSender && botLid && areJidsSameUser(rawQuotedSender, botLid)) ||
          (rawQuotedSender && botPhoneJid && areJidsSameUser(rawQuotedSender, botPhoneJid))
        )
      )

      Object.defineProperty(m, 'quoted', {
        value: new Proxy(m.quoted, {
          get(target, prop, receiver) {
            if (prop === 'sender' || prop === 'realSender') return quotedSender
            if (prop === 'rawSender') return rawQuotedSender
            if (prop === 'mentionedJid') return quotedMentionedJid
            if (prop === 'rawMentionedJid') return rawQuotedMentionedJid
            // Override fromMe agar pakai normalized sender — fix LID mismatch yang bikin
            // game answer plugins gagal detect pesan bot sendiri
            if (prop === 'fromMe') return quotedFromMe
            // Override isBaileys — jika fromMe true, anggap isBaileys juga true
            // supaya plugin yang cek m.quoted.isBaileys (e.g. asahotak_ans) tetap jalan
            if (prop === 'isBaileys') {
              const origBaileys = Reflect.get(target, prop, receiver)
              return origBaileys || quotedFromMe
            }
            return Reflect.get(target, prop, receiver)
          }
        }),
        enumerable: true,
        configurable: true,
        writable: true,
      })
    }

    const user = (m.isGroup && m.sender
      ? findGroupParticipant(m.sender, [senderId, senderJid, m.key?.participant, m.key?.remoteJid])
      : {}) || {}
    const bot = (m.isGroup
      ? findGroupParticipant(conn.user.jid, [conn.user?.id])
      : {}) || {}

    const senderIdentityCandidates = buildJidCandidates(senderId, [
      m.sender,
      senderJid,
      ...legacySenderKeys,
      m.key?.participant,
      conn.decodeJid?.(m.key?.participant),
    ])
    const senderCandidateKeys = [...senderIdentityCandidates].filter((candidate) => typeof candidate === 'string' && dbUser[candidate])
    const bestSenderUserKey = selectBestUserKey(dbUser, senderCandidateKeys, senderId)

    if (!dbUser[bestSenderUserKey]) {
      dbUser[bestSenderUserKey] = createMinimalUserRecord()
    }

    if (!dbUser[senderId] || scoreUserRecord(dbUser[bestSenderUserKey]) > scoreUserRecord(dbUser[senderId])) {
      dbUser[senderId] = dbUser[bestSenderUserKey]
    }

    const senderUserRecord = dbUser[senderId] || dbUser[bestSenderUserKey] || (dbUser[senderId] = createMinimalUserRecord())

    const rootOwnerValues = [
      conn.user?.jid,
      conn.user?.id,
      ...(Array.isArray(global.owner) ? global.owner : [global.owner]),
      ...(Array.isArray(global.mods) ? global.mods.map((mod) => Array.isArray(mod) ? mod[0] : mod) : []),
    ].filter(Boolean)
    const hasUserFlag = (flag) => [...senderIdentityCandidates].some((candidate) => dbUser[candidate]?.[flag])
    const isSelfSender = Boolean(
      m.fromMe ||
      m.key?.fromMe ||
      (senderId && conn.user?.id && areJidsSameUser(senderId, conn.user.id)) ||
      (senderId && conn.user?.jid && areJidsSameUser(senderId, conn.user.jid))
    )
    const allowPrivilegedCommands = !global.config?.isSubBot
    const isROwner = allowPrivilegedCommands && (isSelfSender || hasIdentityMatch(senderIdentityCandidates, rootOwnerValues))

    const isOwner = allowPrivilegedCommands && (isROwner || hasUserFlag('owner') || false)
    const isPrems = isOwner || hasUserFlag('premium') || false
    const isSubBotRestrictedCommand = Boolean(global.config?.isSubBot)

    const isRAdmin = user?.admin === 'superadmin'
    const isAdmin = isRAdmin || user?.admin === 'admin'
    const isBotAdmin = bot?.admin === 'admin' || bot?.admin === 'superadmin'

    await protect(m, {
      conn,
      dbChat,
      dbUser,
      dbBot,
      isAdmin,
      isBotAdmin,
      stubType: chatUpdate.messages[0]
    })

    if (typeof m.text !== 'string') m.text = ''

    const isSelfChat = !m.isGroup && Boolean(
      (m.chat && conn.user?.id && areJidsSameUser(m.chat, conn.user.id)) ||
      (m.chat && conn.user?.jid && areJidsSameUser(m.chat, conn.user.jid))
    )

    if (
      isSelfChat &&
      isSelfSender &&
      !isPotentialCommandText(conn, m.text, botSettings)
    ) {
      return
    }

    if (m.isBaileys && m.id.length !== 20) {
      // Cek apakah pesan dari bot sendiri — pakai beberapa metode supaya tidak salah kick
      const botJid = conn.decodeJid(conn.user.id)
      const senderDecoded = conn.decodeJid(m.sender || '')
      const isSelf = m.fromMe 
        || areJidsSameUser(m.sender, conn.user.id)
        || senderDecoded === botJid
        || m.sender === conn.user.jid
        || m.key?.fromMe
        || (botJid && senderDecoded && botJid.split('@')[0] === senderDecoded.split('@')[0])

      if (isSelf) return

      if (m.isGroup && dbChat[m.chat]?.antibot && isBotAdmin && !isAdmin) {
        await conn.reply(
          m.chat,
          `*[ SYSTEM ALERT ]*\n\nBot terdeteksi: @${m.sender.split('@')[0]}. Removing...`,
          m
        )
        return applyGroupParticipantAction(conn, m.chat, m.rawSender || m.sender, 'remove', participants)
      }
      return
    }

    m.exp += Math.ceil(Math.random() * 10)
    const ___dirname = getDirname(import.meta.url)
    const pluginRuntime = getPluginRuntime()
    const defaultPrefixSource = conn.prefix ? conn.prefix : global.prefix
    const defaultMatch = resolvePrefixMatch(defaultPrefixSource, m.text)
    const defaultContext = createCommandContext(m.text, defaultMatch)
    let usedPrefix = defaultContext.usedPrefix
    const allowNoPrefix = Boolean(botSettings.noprefix)
    const hasDefaultCommandAccess = defaultContext.isAccessible || allowNoPrefix

    for (const entry of pluginRuntime.orderedEntries) {
      const { name, plugin, normalizedPluginName } = entry
      if (!plugin || plugin.disabled) continue
      const isSubBotOwnerPlugin = Boolean(global.config?.isSubBot && normalizedPluginName.startsWith('owner/'))
      if (isSubBotOwnerPlugin) continue
      if (entry.groupOnly && !m.isGroup) continue
      if (entry.privateOnly && m.isGroup) continue

      const __filename = join(___dirname, 'plugins', name)
      const isSelfMode = botSettings.self && !isROwner

      if (typeof plugin.all === 'function') {
        if (isSelfMode && !plugin.modeSelf) continue
        // [PERF] Fire-and-forget plugin.all — jangan block handler
        Promise.resolve(plugin.all.call(conn, m, {
          chatUpdate,
          conn,
          participants,
          groupMetadata,
          Func,
          failed,
          dbUser,
          usedPrefix,
          dbChat,
          dbBot,
          isROwner,
          isOwner,
          isAdmin,
          isBotAdmin,
          isPrems,
          __dirname: join(___dirname, 'plugins'),
          __filename
        })).then(() => {
          global.markDbDirty?.()
        }).catch((e) => {
          console.error(`Error in 'plugin.all' [${name}]:`, e)
        })
      }

      const match = entry.customPrefix
        ? resolvePrefixMatch(entry.customPrefix, m.text)
        : defaultMatch

      if (typeof plugin.before === 'function') {
        if (isSelfMode && !plugin.modeSelf) continue
        try {
          const stop = await plugin.before.call(conn, m, {
            match,
            usedPrefix,
            conn,
            participants,
            groupMetadata,
            Func,
            failed,
            dbChat,
            dbUser,
            dbBot,
            isROwner,
            isOwner,
            isAdmin,
            isBotAdmin,
            isPrems,
            __dirname: join(___dirname, 'plugins'),
            __filename
          })
          global.markDbDirty?.()
          if (stop) continue
        } catch (e) {
          console.error(`Error in 'plugin.before' [${name}]:`, e)
        }
      }

      if (!entry.isRunnable) continue
      if (isSelfMode && !plugin.modeSelf) continue
      const commandContext = entry.customPrefix
        ? createCustomPrefixContext(m.text, match)
        : defaultContext
      const isAcc = entry.customPrefix
        ? (commandContext.isAccessible || allowNoPrefix)
        : hasDefaultCommandAccess

      if (!isAcc || (!entry.customPrefix && !commandContext.command)) continue

      let isAccept = false

      if (entry.customPrefix) {
        const prefixCommand = plugin.customPrefix || plugin.command
        isAccept = matchesCommandPattern(prefixCommand, commandContext.command, m.text)
      } else if (entry.stringCommands.size > 0 && entry.stringCommands.has(commandContext.command)) {
        isAccept = true
      } else if (entry.regexCommands.length > 0) {
        isAccept = entry.regexCommands.some((pattern) =>
          matchesCommandPattern(pattern, commandContext.command, m.text)
        )
      }

      usedPrefix = commandContext.usedPrefix

      if (!isAccept) continue

      const { noPrefix, args, command, text } = commandContext

      m.plugin = name
      m.prefix = usedPrefix
      m.command = command
      m.isAdmin = isAdmin
      m.isBotAdmin = isBotAdmin
      m.isCommand = true

      // --- GLOBAL COMMAND COOLDOWN (3 DETIK PER USER) ---
      if (!isROwner && !isOwner && usedPrefix) {
        conn.cooldowns = conn.cooldowns || {}
        const now = Date.now()
        const lastTime = conn.cooldowns[senderId] || 0
        if (now - lastTime < 3000) {
          const timeLeft = Math.ceil((3000 - (now - lastTime)) / 1000)
          m.reply(`Eits, sabar dong bree! 😤 Jangan spam command ntar Onah pusing. Tunggu *${timeLeft} detik* lagi ya! 😝`)
          continue
        }
        conn.cooldowns[senderId] = now
      }
      // --------------------------------------------------

      const isUnban = /^(bangun|unbanchat)$/i.test(command)
      if (dbChat[m.chat]?.isBanned && !isROwner && !isUnban) return
      if (senderUserRecord?.banned && !isROwner) return
      if (conn.spamBanned?.[senderId] && !isROwner) return

      // [FIX] Pre-fetch official group metadata sebelum gc_only check,
      // supaya user yang sudah join grup official tidak kena false-positive warning.
      // Tanpa ini, kalau metadata belum ke-cache (misal habis restart / LID),
      // pengecekan langsung skip dan fallback ke scan semua grup yang juga unreliable.
      let _prefetchedOfficialMetadata = null
      const _needsGcOnlyCheck = (global.setting?.groupOnly || global.opts?.['gconly']) && !m.isGroup && !isROwner && !m.key.fromMe
      if (_needsGcOnlyCheck && global.officialGroupJid) {
        const officialJid = global.officialGroupJid
        const existing = conn.chats?.[officialJid]?.metadata
        if (existing?.participants?.length) {
          _prefetchedOfficialMetadata = existing
        } else {
          try {
            _prefetchedOfficialMetadata = await getCachedGroupMetadata(conn, officialJid)
          } catch (e) {
            console.warn('[GC_ONLY] Gagal fetch metadata official group:', e.message)
          }
        }
      }

      const check = {
        default_gc_only: () => {
          if (!(global.setting.groupOnly || global.opts['gconly'])) return false
          if (m.isGroup || isROwner || m.key.fromMe) return false
          
          const checkUserInGroup = (chat) => {
            if (!chat || !chat.metadata?.participants) return false;
            return chat.metadata.participants.some((p) => {
              const participantCandidates = buildJidCandidates(p.id || p.jid || p.lid, [
                p.id,
                p.jid,
                p.lid,
                p.phoneNumber,
                p.pn,
              ]);
              for (const candidate of senderIdentityCandidates) {
                if (participantCandidates.has(candidate)) return true;
              }
              return false;
            });
          };

          const officialJid = global.officialGroupJid
          if (officialJid) {
            // Gunakan metadata yang sudah di-prefetch (pasti sudah ada karena di-fetch di atas)
            const officialGroupChat = conn.chats?.[officialJid]
            const metadata = _prefetchedOfficialMetadata || officialGroupChat?.metadata
            if (metadata?.participants) {
              const isMember = checkUserInGroup({ metadata })
              return !isMember
            }
          }

          const chatValues = Object.values(conn.chats || {})
          const hasCommon = chatValues.some(
            c =>
              c.id?.endsWith('@g.us') &&
              checkUserInGroup(c)
          )
          return !hasCommon
        },
        unreg: () => plugin.register && !senderUserRecord?.registered,
        premium: () => plugin.premium && !isPrems,
        subbotOwnerScope: () => isSubBotRestrictedCommand && (plugin.owner || plugin.rowner || normalizedPluginName.startsWith('owner/')),
        owner: () => plugin.owner && !isOwner,
        rowner: () => plugin.rowner && !isROwner,
        group: () => plugin.group && !m.isGroup,
        private: () => plugin.private && m.isGroup,
        adminOnly: () => m.isGroup && dbChat[m.chat]?.adminonly && !isAdmin && !isOwner,
        admin: () => plugin.admin && !isAdmin,
        botAdmin: () => plugin.botAdmin && !isBotAdmin,
        game: () => m.isGroup && !dbChat[m.chat]?.game && plugin.tags?.includes('game'),
        rpg: () => m.isGroup && !dbChat[m.chat]?.rpg && plugin.tags?.includes('rpg'),
        limit: () => !isPrems && plugin.limit && (senderUserRecord?.limit ?? 0) < plugin.limit * 1,
        level: () => (plugin.level ?? 0) > (senderUserRecord?.level ?? 0),
        sewa: () => {
          if (!m.isGroup) return false
          if (isROwner || isOwner) return false
          
          const chat = dbChat[m.chat]
          // Hanya aktif untuk grup yang sudah ditandai needSewa
          // (yaitu grup yang bot-nya di-add oleh orang random, bukan via .join owner)
          if (!chat?.needSewa) return false

          const isRented = chat.expired && chat.expired > Date.now()
          if (isRented) return false
          
          // Whitelist command yang tetap bisa diakses di grup belum sewa
          const whitelistCommands = ['sewa', 'sewabot', 'owner', 'creator', 'payment', 'ping', 'rules', 'help', 'menu', 'daftar', 'register', 'verify', 'unreg', 'join', 'addsewa', 'buysewa', 'ceksewa', 'tutoronah', 'ceksn']
          if (whitelistCommands.includes((command || '').toLowerCase())) return false

          return true
        },
      }

      let failedCheck = Object.keys(check).find(key => check[key]())
      if (failedCheck) {
        console.log(chalk.bold.red(`[HANDLER] Blocked by check: ${failedCheck} for user: ${m.sender} on command: ${command}`));
        if (failedCheck === 'sewa') {
          conn.sewaCooldowns = conn.sewaCooldowns || {}
          const now = Date.now()
          const lastWarn = conn.sewaCooldowns[m.chat] || 0
          if (now - lastWarn > 60000) { // 1 menit cooldown per grup
            conn.sewaCooldowns[m.chat] = now
            await conn.reply(
              m.chat,
              `⚠️ *PERINGATAN BOT SEWA*\n\n` +
              `Halo! Grup ini belum terdaftar dalam masa sewa aktif.\n` +
              `Agar Onah bisa merespons perintah di grup ini, silakan hubungi *.owner* untuk melakukan penyewaan.\n\n` +
              `Ketik *.sewa* untuk info harga & list sewa.`,
              m
            )
          }
          continue
        }

        if (failedCheck === 'default_gc_only') {
          await failed('gconly', m, conn)
          continue
        }

        if (failedCheck === 'level') {
          conn.reply(
            m.chat,
            `Level ${plugin.level} required.\n*Your Level:* ${senderUserRecord?.level ?? 0}`,
            m
          )
        } else if (failedCheck === 'subbotOwnerScope') {
          await m.reply(SUBBOT_OWNER_DISABLED_MESSAGE)
        } else if (failedCheck === 'limit') {
          conn.reply(m.chat, `😿 Limit kakak abis…
Mau unlimited? buy premium di zansxart.me`, m)
        } else {
          failed(failedCheck, m, conn)
        }
        continue
      }

      if (plugin.delay) {
        conn.pending = conn.pending || {}
        const now = Date.now()
        if (now < (conn.pending[senderId] || 0)) {
          const timeLeft = Math.ceil((conn.pending[senderId] - now) / 1000)
          m.reply(`Mohon tunggu ${timeLeft} detik.`)
          continue
        }
        conn.pending[senderId] = now + plugin.delay * 1000
      }

      m.exp += 'exp' in plugin ? parseInt(plugin.exp) : 15
      if (!isPrems) m.limit = m.limit || plugin.limit || false

      const extra = {
        match,
        usedPrefix,
        noPrefix,
        args,
        command,
        text,
        Func,
        failed,
        conn,
        participants,
        groupMetadata,
        dbBot,
        dbUser,
        dbChat,
        isROwner,
        isOwner,
        isAdmin,
        isBotAdmin,
        isPrems,
        __dirname: join(___dirname, 'plugins'),
        __filename
      }

      // [PERF] NON-BLOCKING plugin execution — handler langsung lanjut ke pesan berikutnya
      // Plugin berat (API call, scraping, dll) gak block pesan lain
      const _pluginName = m.plugin
      const _pluginArgs = [...args]
      const _pluginPrefix = m.prefix
      const _pluginCommand = m.command
      const _pluginSender = m.sender
      const _pluginLimit = m.limit
      const _pluginExp = m.exp
      const _realSender = m.realSender
      ;(async () => {
        let pluginError = null
        try {
          await (plugin.run || plugin).call(conn, m, extra)
        } catch (e) {
          pluginError = e
          m.error = e

          if (e) {
            if (typeof e === 'string') {
              await m.reply(e).catch(() => {})
              return
            }

            if (typeof e === 'object' && !e.stack && !e.message) {
              await m.reply(format(e)).catch(() => {})
              return
            }

            const userMessage =
              typeof e === 'object' && typeof e?.userMessage === 'string'
                ? e.userMessage.trim()
                : ''

            if (userMessage) {
              console.warn('[PLUGIN USER ERROR]', _pluginName, formatRuntimeError(e))
              await m.reply(userMessage).catch(() => {})
              return
            }

            console.error('[PLUGIN ERROR]', e)

            const errorText = format(e)

            const errorReport =
              `*⚠️ SYSTEM ERROR REPORT*\n\n` +
              `❌ *Plugin:* ${_pluginName}\n` +
              `👤 *Sender:* @${(_pluginSender || '').split('@')[0]}\n` +
              `💬 *Command:* ${_pluginPrefix}${_pluginCommand} ${_pluginArgs.join(' ')}\n\n` +
              `📄 *Trace:*\n\`\`\`${errorText}\`\`\``

            await conn
              .sendMessage(global.zansx, {
                text: errorReport,
                mentions: [_pluginSender].filter(Boolean)
              })
              .catch(err =>
                console.error('[REPORT ERROR] Gagal kirim ke grup log:', err)
              )

            await m.reply(`⚠️ Terjadi kesalahan internal pada sistem.`).catch(() => {})
          }
        } finally {
          // Stats tracking
          if (_pluginName) {
            global.db.data.stats = global.db.data.stats || {}
            const stats = global.db.data.stats[_pluginName]
            const now = Date.now()
            if (stats) {
              stats.total++
              stats.last = now
              if (!pluginError) {
                stats.success++
                stats.lastSuccess = now
              }
            } else {
              global.db.data.stats[_pluginName] = {
                total: 1,
                success: pluginError ? 0 : 1,
                last: now,
                lastSuccess: pluginError ? 0 : now
              }
            }
          }

          // Limit & exp tracking (dipindah ke sini karena non-blocking)
          const dbUserData =
            _realSender && global.db.data?.users
              ? global.db.data.users[_realSender]
              : null

          if (dbUserData) {
            dbUserData.exp += _pluginExp

            if (_pluginLimit) {
              const used = Number(_pluginLimit)
              if (!isNaN(used)) {
                dbUserData.limit -= used
                if (dbUserData.limit < 0) dbUserData.limit = 0
                await m.reply(`🔖 ${used} Limit digunakan`).catch(() => {})
              }
            }
          }

          global.markDbDirty?.()

          // Logging
          try {
            const printLog = await getPrintLog()
            await printLog(m, conn)
          } catch (e) {
            console.error('[LOGGING ERROR]', e)
          }

          // Autoread
          if (global.db.data.settings[conn.user.jid]?.autoread) {
            await conn.readMessages([m.key]).catch(() => {})
          }
        }
      })()
      break
    }
  } catch (e) {
    console.error('[GLOBAL HANDLER ERROR]', e)
  } finally {
    // [PERF] Limit, exp, logging, autoread dipindah ke dalam non-blocking plugin exec block
    // Untuk pesan tanpa command match, tetap jalankan logging minimal
    if (m && !m.isCommand) {
      try {
        const printLog = await getPrintLog()
        await printLog(m, conn)
      } catch (e) {
        console.error('[LOGGING ERROR]', e)
      }

      if (global.db.data.settings?.[conn.user?.jid]?.autoread) {
        await conn.readMessages([m.key]).catch(() => {})
      }
    }
  }
}

const file = fileURLToPath(import.meta.url)
watchFile(file, () => {
  unwatchFile(file)
  console.log(chalk.redBright(`[UPDATE] '${file}' updated`))
  import(`${file}?update=${Date.now()}`)
})
