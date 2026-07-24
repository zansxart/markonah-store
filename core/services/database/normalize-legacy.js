import crypto from 'crypto'

const DEFAULT_BANK = { level: 1, balance: 0, limit: 999_000_000_000_000 }

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const toNumber = (value, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}
const uniqueStrings = (values = []) => [...new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean)
)]

const hasStoreCatalogMetaShape = (meta) => (
  isPlainObject(meta) &&
  'createdAt' in meta &&
  'updatedAt' in meta &&
  'creator' in meta &&
  'updater' in meta &&
  'price' in meta &&
  'stock' in meta &&
  'category' in meta &&
  'description' in meta &&
  Array.isArray(meta.aliases)
)

export function normalizeBank(bank) {
  if (isPlainObject(bank)) {
    const level = toNumber(bank.level, 0)
    const balance = Math.max(0, toNumber(bank.balance, 0))
    const limit = toNumber(bank.limit, 0)
    return {
      level,
      balance,
      // Kalau level > 0 (sudah punya bank), pastikan limit minimal DEFAULT_BANK.limit
      // Kalau level 0 (belum punya bank), limit tetap 0
      limit: level > 0 ? Math.max(DEFAULT_BANK.limit, limit) : limit,
    }
  }

  // Legacy format: bank = number (saldo langsung)
  const legacyBalance = Math.max(0, toNumber(bank, 0))
  if (legacyBalance > 0) {
    return {
      level: DEFAULT_BANK.level,
      balance: legacyBalance,
      limit: Math.max(DEFAULT_BANK.limit, legacyBalance),
    }
  }
  // Tidak ada saldo dan bukan object = belum punya bank
  return { level: 0, balance: 0, limit: 0 }
}

function normalizeInventory(inventory) {
  const value = isPlainObject(inventory) ? inventory : {}
  return {
    food: toNumber(value.food, 0),
    bahan: toNumber(value.bahan, 0),
    masakan: toNumber(value.masakan, 0),
  }
}

function normalizeLastActivity(lastActivity) {
  const value = isPlainObject(lastActivity) ? lastActivity : {}
  return {
    cook: toNumber(value.cook, 0),
    ngewe: toNumber(value.ngewe, 0),
    mineHunt: toNumber(value.mineHunt, 0),
    checkPregnancy: toNumber(value.checkPregnancy, 0),
  }
}

export function normalizeStoreMeta(meta = {}, sender = '') {
  const value = isPlainObject(meta) ? meta : {}
  const createdAt = toNumber(value.createdAt, 0)
  const updatedAt = toNumber(value.updatedAt, createdAt || 0)
  const stockValue = value.stock

  return {
    createdAt,
    updatedAt,
    creator: String(value.creator || sender || '').trim(),
    updater: String(value.updater || sender || '').trim(),
    price: Math.max(0, toNumber(value.price, 0)),
    stock: stockValue === null || stockValue === '' || stockValue === undefined
      ? null
      : Math.max(0, toNumber(stockValue, 0)),
    category: String(value.category || '').trim(),
    description: String(value.description || '').trim(),
    aliases: uniqueStrings(value.aliases),
  }
}

export function wrapStoreCatalogEntry(name, value, sender = '') {
  if (isPlainObject(value) && value.__storeEntry === true && value.data) {
    return {
      __storeEntry: true,
      name: String(value.name || name || '').trim(),
      data: value.data,
      meta: normalizeStoreMeta(value.meta, sender),
    }
  }

  return {
    __storeEntry: true,
    name: String(name || '').trim(),
    data: value,
    meta: normalizeStoreMeta({}, sender),
  }
}

export function unwrapStoreCatalogEntry(name, value, sender = '') {
  const wrapped = wrapStoreCatalogEntry(name, value, sender)
  return {
    name: wrapped.name,
    data: wrapped.data,
    meta: normalizeStoreMeta(wrapped.meta, sender),
  }
}

export function normalizeUserRecord(user = {}, options = {}) {
  const source = isPlainObject(user) ? user : {}
  const defaultLimit = toNumber(options.defaultLimit, 20) || 20
  const fallbackName = String(options.fallbackName || source.name || '').trim()
  const hadLegacyBank = !isPlainObject(source.bank)
  const normalized = {
    ...source,
    name: fallbackName || 'Unknown',
    age: source.age ?? -1,
    exp: toNumber(source.exp, 0),
    level: Math.max(1, toNumber(source.level, 1)),
    limit: toNumber(source.limit, defaultLimit),
    health: toNumber(source.health, 100),
    money: toNumber(source.money, 1000),
    lastUnreg: toNumber(source.lastUnreg, 0),
    registered: Boolean(source.registered),
    owner: Boolean(source.owner),
    ownerTime: Math.max(0, toNumber(source.ownerTime, 0)),
    premium: Boolean(source.premium),
    premiumTime: Math.max(0, toNumber(source.premiumTime, 0)),
    ownerLastNoticeDay: Math.max(0, toNumber(source.ownerLastNoticeDay, 0)),
    premiumLastNoticeDay: Math.max(0, toNumber(source.premiumLastNoticeDay, 0)),
    energy: toNumber(source.energy, 100),
    gender: source.gender || 'Belum diatur',
    statusRelationship: source.statusRelationship || 'jomblo',
    pasangan: source.pasangan ?? null,
    marriage: source.marriage ?? null,
    isPregnant: Boolean(source.isPregnant),
    pregnancyDueDate: source.pregnancyDueDate ?? null,
    children: Array.isArray(source.children) ? source.children : [],
    tempProposal: source.tempProposal ?? null,
    tempMarriageProposal: source.tempMarriageProposal ?? null,
    banned: Boolean(source.banned),
    wallet: toNumber(source.wallet, 0),
    bitcoin: toNumber(source.bitcoin, 0),
    popularitas: toNumber(source.popularitas, 0),
    bank: normalizeBank(source.bank),
    inventory: normalizeInventory(source.inventory),
    lastActivity: normalizeLastActivity(source.lastActivity),
  }

  return {
    value: normalized,
    legacyBankFixed: hadLegacyBank,
  }
}

export function normalizeChatRecord(chat = {}) {
  const source = isPlainObject(chat) ? chat : {}
  const listSource = isPlainObject(source.list) ? source.list : {}
  let storeEntriesWrapped = 0

  const list = Object.fromEntries(
    Object.entries(listSource).map(([name, entry]) => {
      const wasLegacy = !(
        isPlainObject(entry) &&
        entry.__storeEntry === true &&
        entry.data &&
        hasStoreCatalogMetaShape(entry.meta)
      )
      const wrapped = wrapStoreCatalogEntry(name, entry)
      if (wasLegacy) storeEntriesWrapped += 1
      return [name, wrapped]
    })
  )

  return {
    value: {
      ...source,
      isBanned: Boolean(source.isBanned),
      antibot: Boolean(source.antibot),
      antispam: source.antispam === undefined ? true : Boolean(source.antispam),
      antitagsw: Boolean(source.antitagsw),
      adminonly: Boolean(source.adminonly),
      acc: Boolean(source.acc),
      welcome: Boolean(source.welcome),
      bye: Boolean(source.bye),
      detect: Boolean(source.detect),
      totalChat: isPlainObject(source.totalChat) ? source.totalChat : {},
      sWelcome: String(source.sWelcome || ''),
      sBye: String(source.sBye || ''),
      delete: Boolean(source.delete),
      antiedit: Boolean(source.antiedit),
      antilink: Boolean(source.antilink),
      antilinkall: Boolean(source.antilinkall),
      antilinkType: source.antilinkType || 'delete',
      antifoto: Boolean(source.antifoto),
      antivideo: Boolean(source.antivideo || source.antiVideo),
      antisticker: Boolean(source.antisticker || source.antiSticker),
      antiaudio: Boolean(source.antiaudio),
      viewonce: Boolean(source.viewonce),
      antibadword: Boolean(source.antibadword),
      simi: Boolean(source.simi),
      expired: source.expired == null ? null : Math.max(0, toNumber(source.expired, 0)),
      sewaLastNoticeDay: Math.max(0, toNumber(source.sewaLastNoticeDay, 0)),
      rpg: Boolean(source.rpg),
      game: Boolean(source.game),
      blacklist: Array.isArray(source.blacklist) ? source.blacklist : [],
      list,
      adzan: isPlainObject(source.adzan)
        ? {
            status: Boolean(source.adzan.status),
            wilayah: String(source.adzan.wilayah || 'lubuklinggau'),
            close: Boolean(source.adzan.close),
          }
        : { status: false, wilayah: 'lubuklinggau', close: false },
      listLink: Array.isArray(source.listLink) ? source.listLink : [],
      antimeta: Boolean(source.antimeta),
    },
    storeEntriesWrapped,
  }
}

export function normalizeSettingRecord(settings = {}) {
  const source = isPlainObject(settings) ? settings : {}
  const covers = isPlainObject(source.covers) ? source.covers : {}

  return {
    ...source,
    self: Boolean(source.self),
    autobio: source.autobio === undefined ? true : Boolean(source.autobio),
    autoreact: Boolean(source.autoreact),
    autoread: Boolean(source.autoread),
    anticall: Boolean(source.anticall),
    mustjoin: Boolean(source.mustjoin),
    image: source.image === undefined ? true : Boolean(source.image),
    gif: Boolean(source.gif),
    teks: Boolean(source.teks),
    doc: Boolean(source.doc),
    button: Boolean(source.button),
    gcImg: source.gcImg === undefined ? true : Boolean(source.gcImg),
    gcGif: Boolean(source.gcGif),
    gcTeks: Boolean(source.gcTeks),
    gcDoc: Boolean(source.gcDoc),
    timeChat: toNumber(source.timeChat, 0),
    resetTime: toNumber(source.resetTime, 0),
    backup: Boolean(source.backup),
    schedule: Array.isArray(source.schedule) ? source.schedule : [],
    listblock: Array.isArray(source.listblock) ? source.listblock : [],
    fake: Boolean(source.fake),
    noprefix: Boolean(source.noprefix),
    covers: {
      menu: isPlainObject(covers.menu) ? covers.menu : {},
      welcome: isPlainObject(covers.welcome) ? covers.welcome : {},
      bye: isPlainObject(covers.bye) ? covers.bye : {},
    },
  }
}

export function normalizeHostedBotRecord(record = {}) {
  const source = isPlainObject(record) ? record : {}
  const createdAt = Math.max(0, toNumber(source.createdAt, 0))
  const updatedAt = Math.max(0, toNumber(source.updatedAt, createdAt))

  return {
    id: String(source.id || `sb-${crypto.randomBytes(3).toString('hex')}`),
    number: String(source.number || '').replace(/\D/g, ''),
    ownerJid: String(source.ownerJid || '').trim(),
    jid: String(source.jid || '').trim(),
    status: String(source.status || 'stopped').trim() || 'stopped',
    createdAt,
    updatedAt,
    lastStartAt: Math.max(0, toNumber(source.lastStartAt, 0)),
    lastStopAt: Math.max(0, toNumber(source.lastStopAt, 0)),
    lastReadyAt: Math.max(0, toNumber(source.lastReadyAt, 0)),
    lastError: String(source.lastError || ''),
    pid: Math.max(0, toNumber(source.pid, 0)),
    autoStart: Boolean(source.autoStart),
    sessionsDir: String(source.sessionsDir || '').trim(),
    databaseFile: String(source.databaseFile || '').trim(),
  }
}

export function normalizeDatabaseShape(data = {}) {
  const source = isPlainObject(data) ? data : {}
  return {
    users: isPlainObject(source.users) ? source.users : {},
    chats: isPlainObject(source.chats) ? source.chats : {},
    stats: isPlainObject(source.stats) ? source.stats : {},
    sticker: isPlainObject(source.sticker) ? source.sticker : {},
    settings: isPlainObject(source.settings) ? source.settings : {},
    menfess: isPlainObject(source.menfess) ? source.menfess : {},
    schedule: Array.isArray(source.schedule) ? source.schedule : [],
    hostedBots: Array.isArray(source.hostedBots) ? source.hostedBots : [],
    leo: isPlainObject(source.leo) ? source.leo : {},
    tiktok: isPlainObject(source.tiktok) ? source.tiktok : {},
  }
}

export function normalizeEntireDatabase(data = {}, options = {}) {
  const defaultLimit = toNumber(options.defaultLimit, 20) || 20
  const normalized = normalizeDatabaseShape(data)
  const summary = {
    usersNormalized: 0,
    chatsNormalized: 0,
    settingsNormalized: 0,
    hostedBotsNormalized: 0,
    legacyBanksFixed: 0,
    storeEntriesWrapped: 0,
  }

  for (const [jid, user] of Object.entries(normalized.users)) {
    const { value, legacyBankFixed } = normalizeUserRecord(user, {
      defaultLimit,
      fallbackName: jid.split('@')[0],
    })
    normalized.users[jid] = value
    summary.usersNormalized += 1
    if (legacyBankFixed) summary.legacyBanksFixed += 1
  }

  for (const [jid, chat] of Object.entries(normalized.chats)) {
    const { value, storeEntriesWrapped } = normalizeChatRecord(chat)
    normalized.chats[jid] = value
    summary.chatsNormalized += 1
    summary.storeEntriesWrapped += storeEntriesWrapped
  }

  for (const [jid, settings] of Object.entries(normalized.settings)) {
    normalized.settings[jid] = normalizeSettingRecord(settings)
    summary.settingsNormalized += 1
  }

  normalized.hostedBots = normalized.hostedBots.map((record) => {
    summary.hostedBotsNormalized += 1
    return normalizeHostedBotRecord(record)
  })

  return {
    data: normalized,
    summary,
  }
}
