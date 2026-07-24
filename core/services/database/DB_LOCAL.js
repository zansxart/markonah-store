const USER_SCHEMA_VERSION = 1

const isNumber = x => typeof x === 'number' && !isNaN(x)

/**
 * [PERF] Setup energy→stamina alias SEKALI per user object.
 * Sebelumnya dipanggil setiap pesan (delete + Object.defineProperty),
 * yang menghancurkan V8 hidden class optimization.
 * Sekarang pakai flag __energyAliasSet supaya hanya jalan sekali.
 */
function _setupEnergyAlias(user) {
    if (!user || user.__energyAliasSet) return
    // Hapus energy plain property kalau ada, ganti dengan getter/setter ke stamina
    const currentEnergy = user.energy
    delete user.energy
    Object.defineProperty(user, 'energy', {
        get() { return this.stamina },
        set(value) { this.stamina = value },
        enumerable: true,
        configurable: true
    })
    // Kalau stamina belum ada tapi energy ada, migrate
    if (!isNumber(user.stamina) && isNumber(currentEnergy)) {
        user.stamina = currentEnergy
    }
    // Tandai supaya tidak di-define ulang
    Object.defineProperty(user, '__energyAliasSet', {
        value: true,
        enumerable: false,
        configurable: true,
        writable: false,
    })
}

/**
 * [PERF] Normalize chat data — diextract supaya bisa dipanggil dari fast path
 */
function _normalizeChat(m, conn, chats) {
    if (!m.isGroup) return

    let chat = chats[m.chat]
    if (typeof chat !== 'object') {
        chats[m.chat] = {}
        chat = chats[m.chat]
        global.markDbDirty?.()
    }
    if (chat) {
        if (!('acc' in chat)) chat.acc = false
        if (!('welcome' in chat)) chat.welcome = false
        if (!('antibot' in chat)) chat.antibot = false
        if (!('bye' in chat)) chat.bye = false
        if (!('detect' in chat)) chat.detect = false
        if (!('sWelcome' in chat)) chat.sWelcome = ''
        if (!('sBye' in chat)) chat.sBye = ''
        if (!('delete' in chat)) chat.delete = false
        if (!('adminonly' in chat)) chat.adminonly = false
        if (!('antiedit' in chat)) chat.antiedit = false
        if (!('antilink' in chat)) chat.antilink = false
        if (!('antilinkall' in chat)) chat.antilinkall = false
        if (!('antilinkType' in chat)) chat.antilinkType = 'delete'
        if (!('antispam' in chat)) chat.antispam = true
        if (!('antifoto' in chat)) chat.antifoto = false
        if (!('antivideo' in chat)) chat.antiVideo = false
        if (!('antisticker' in chat)) chat.antiSticker = false
        if (!('antiaudio' in chat)) chat.antiaudio = false
        if (!('viewonce' in chat)) chat.viewonce = false
        if (!('antibadword' in chat)) chat.antibadword = false
        if (!('simi' in chat)) chat.simi = false
        if (!('rpg' in chat)) chat.rpg = false
        if (!('game' in chat)) chat.game = false
        if (!('antitagsw' in chat)) chat.antitagsw = false
        if (!isNumber(chat.expired)) chat.expired = null
        if (!('sewaLastNoticeDay' in chat)) chat.sewaLastNoticeDay = 0
        if (!('blacklist' in chat)) chat.blacklist = []
        if (!('totalChat' in chat)) chat.totalChat = {}
        if (!('list' in chat) || typeof chat.list !== 'object' || Array.isArray(chat.list)) chat.list = {}
        if (!('adzan' in chat)) chat.adzan = { status: false, wilayah: 'lubuklinggau', close: false }
        if (!('listLink' in chat)) chat.listLink = []
        if (!('antimeta' in chat)) chat.antimeta = false
        if (!('mbg' in chat)) chat.mbg = true
    }
}

/**
 * [PERF] Normalize settings — diextract supaya bisa dipanggil dari fast path
 */
function _normalizeSettings(conn, settings) {
    const jid = conn.user.jid
    let s = settings[jid]
    if (typeof s !== 'object') {
        settings[jid] = {}
        s = settings[jid]
        global.markDbDirty?.()
    }
    if (s) {
        if (!('self' in s)) s.self = false
        if (!('autoread' in s)) s.autoread = false
        if (!('autobio' in s)) s.autobio = true
        if (!('autoreact' in s)) s.autoreact = false
        if (!('anticall' in s)) s.anticall = false
        if (!('image' in s)) s.image = true
        if (!('gif' in s)) s.gif = false
        if (!('teks' in s)) s.teks = false
        if (!('doc' in s)) s.doc = false
        if (!('button' in s)) s.button = false
        if (!('backup' in s)) s.backup = false
        if (!('mustjoin' in s)) s.mustjoin = false
        if (!('schedule' in s)) s.schedule = []
        if (!('listblock' in s)) s.listblock = []
        if (!('fake' in s)) s.fake = false
        if (!('noprefix' in s)) s.noprefix = false
        if (!('covers' in s) || typeof s.covers !== 'object') s.covers = {}
        if (!('menu' in s.covers) || typeof s.covers.menu !== 'object') s.covers.menu = {}
        if (!('welcome' in s.covers) || typeof s.covers.welcome !== 'object') s.covers.welcome = {}
        if (!('bye' in s.covers) || typeof s.covers.bye !== 'object') s.covers.bye = {}
        if (!('autoAi' in s)) s.autoAi = true
        if (!('autoAiChance' in s)) s.autoAiChance = 0.4
        if (!('mbg' in s)) s.mbg = true
        if (!('startupNotice' in s)) s.startupNotice = true
    }
}

/**
 * [PERF] Normalize misc data (schedule, autoreactChannels)
 */
function _normalizeMisc(conn, data) {
    if (typeof data.schedule !== 'object') {
        data.schedule = []
        global.markDbDirty?.()
    }
    if (typeof data.autoreactChannels !== 'object') {
        data.autoreactChannels = {}
        global.markDbDirty?.()
    }
}

export default async (m, conn) => {

    const isNumber = x => typeof x === 'number' && !isNaN(x)
    const normalizeBank = (bank) => {
        // Bank dengan level 0 = belum punya rekening, jangan di-upgrade otomatis
        const DEFAULT_LIMIT = 999_000_000_000_000

        if (bank && typeof bank === 'object' && !Array.isArray(bank)) {
            const level = isNumber(bank.level) ? bank.level : Number(bank.level) || 0
            const balance = isNumber(bank.balance) ? Math.max(0, bank.balance) : Math.max(0, Number(bank.balance) || 0)
            const limit = isNumber(bank.limit) ? bank.limit : Number(bank.limit) || 0
            return {
                level,
                balance,
                // Kalau level > 0 (sudah punya bank), pastikan limit minimal DEFAULT_LIMIT
                // Kalau level 0 (belum punya bank), limit tetap 0
                limit: level > 0 ? Math.max(DEFAULT_LIMIT, limit) : limit,
            }
        }

        // Legacy format: bank = number (saldo langsung)
        const legacyBalance = isNumber(bank) ? Math.max(0, bank) : Math.max(0, Number(bank) || 0)
        if (legacyBalance > 0) {
            // Ada saldo legacy, berarti punya bank
            return {
                level: 1,
                balance: legacyBalance,
                limit: Math.max(DEFAULT_LIMIT, legacyBalance),
            }
        }
        // Tidak ada saldo dan bukan object = belum punya bank
        return { level: 0, balance: 0, limit: 0 }
    }
    const delay = ms => isNumber(ms) && new Promise(resolve => setTimeout(function () {
        clearTimeout(conn)
        resolve()
    }, ms))

    let dbModified = false
    const userKey = m.realSender || m.sender
    let user = global.db.data.users[userKey]
    const hasExistingUser = typeof user === 'object' && user !== null

    // [PERF] Fast path — kalau user sudah ada dan schema sudah benar,
    // skip semua 200+ property normalization yang berat lewat Proxy chain.
    // Ini menghilangkan bottleneck utama saat bot kena spam.
    if (hasExistingUser && user.__schemaVersion === USER_SCHEMA_VERSION) {
        // Tetap setup energy alias kalau belum ada (cek sekali, bukan re-define tiap pesan)
        if (!user.__energyAliasSet) {
            _setupEnergyAlias(user)
        }
        // Pastikan money/exp/limit dan item-item RPG valid (mencegah NaN / undefined)
        if (typeof user.money !== 'number' || isNaN(user.money)) user.money = 0
        if (typeof user.exp !== 'number' || isNaN(user.exp)) user.exp = 0
        if (typeof user.limit !== 'number' || isNaN(user.limit)) user.limit = 0
        if (typeof user.potion !== 'number' || isNaN(user.potion)) user.potion = 0
        if (typeof user.sampah !== 'number' || isNaN(user.sampah)) user.sampah = 0
        if (typeof user.diamond !== 'number' || isNaN(user.diamond)) user.diamond = 0
        if (typeof user.common !== 'number' || isNaN(user.common)) user.common = 0
        if (typeof user.uncommon !== 'number' || isNaN(user.uncommon)) user.uncommon = 0
        if (typeof user.mythic !== 'number' || isNaN(user.mythic)) user.mythic = 0
        if (typeof user.legendary !== 'number' || isNaN(user.legendary)) user.legendary = 0
        if (typeof user.string !== 'number' || isNaN(user.string)) user.string = 0
        if (typeof user.kayu !== 'number' || isNaN(user.kayu)) user.kayu = 0
        if (typeof user.rock !== 'number' || isNaN(user.rock)) user.rock = 0
        if (typeof user.iron !== 'number' || isNaN(user.iron)) user.iron = 0
        if (typeof user.gold !== 'number' || isNaN(user.gold)) user.gold = 0
        if (typeof user.emerald !== 'number' || isNaN(user.emerald)) user.emerald = 0

        // Pastikan bank dan saldonya selalu valid
        if (!user.bank || typeof user.bank !== 'object' || Array.isArray(user.bank)) {
            user.bank = { level: 0, balance: 0, limit: 0 }
        } else {
            if (typeof user.bank.balance !== 'number' || isNaN(user.bank.balance)) user.bank.balance = 0
            if (typeof user.bank.level !== 'number' || isNaN(user.bank.level)) user.bank.level = 0
            if (typeof user.bank.limit !== 'number' || isNaN(user.bank.limit)) user.bank.limit = 0
        }

        // Chat & settings normalization tetap jalan (ringan)
        _normalizeChat(m, conn, global.db.data.chats)
        _normalizeSettings(conn, global.db.data.settings)
        _normalizeMisc(conn, global.db.data)
        return
    }

    if (!hasExistingUser) {
        global.db.data.users[userKey] = {}
        dbModified = true
    }

    const normalizedUser = global.db.data.users[userKey]
    const shouldNormalizeUser = !hasExistingUser || !normalizedUser?.__schemaVersion || normalizedUser.__schemaVersion !== USER_SCHEMA_VERSION
    if (shouldNormalizeUser) {
        dbModified = true
    }

    if (hasExistingUser) {
        normalizedUser.bank = normalizeBank(normalizedUser.bank)
        if (!("banned" in normalizedUser)) normalizedUser.banned = false
        if (!("lastUnreg" in normalizedUser)) normalizedUser.lastUnreg = 0
        if (!("autoAi" in normalizedUser)) normalizedUser.autoAi = false
        if (!("autoAiChance" in normalizedUser)) normalizedUser.autoAiChance = 0.3
        
        // --- RPG & Kehidupan Schema Normalization ---
        if (!("gender" in normalizedUser)) normalizedUser.gender = 'Belum diatur'
        if (!("statusRelationship" in normalizedUser)) normalizedUser.statusRelationship = 'jomblo'
        if (!("pasangan" in normalizedUser)) normalizedUser.pasangan = null
        if (!("marriage" in normalizedUser)) normalizedUser.marriage = null
        if (!("isPregnant" in normalizedUser)) normalizedUser.isPregnant = false
        if (!("pregnancyDueDate" in normalizedUser)) normalizedUser.pregnancyDueDate = null
        if (!Array.isArray(normalizedUser.children)) normalizedUser.children = []
        if (!isNumber(normalizedUser.energy)) normalizedUser.energy = 100
        
        if (typeof normalizedUser.inventory !== 'object' || normalizedUser.inventory === null || Array.isArray(normalizedUser.inventory)) {
            normalizedUser.inventory = { food: 0, bahan: 0, masakan: 0 }
        } else {
            if (!isNumber(normalizedUser.inventory.food)) normalizedUser.inventory.food = 0
            if (!isNumber(normalizedUser.inventory.bahan)) normalizedUser.inventory.bahan = 0
            if (!isNumber(normalizedUser.inventory.masakan)) normalizedUser.inventory.masakan = 0
        }

        if (typeof normalizedUser.lastActivity !== 'object' || normalizedUser.lastActivity === null || Array.isArray(normalizedUser.lastActivity)) {
            normalizedUser.lastActivity = { cook: 0, ngewe: 0, mineHunt: 0, checkPregnancy: 0 }
        } else {
            if (!isNumber(normalizedUser.lastActivity.cook)) normalizedUser.lastActivity.cook = 0
            if (!isNumber(normalizedUser.lastActivity.ngewe)) normalizedUser.lastActivity.ngewe = 0
            if (!isNumber(normalizedUser.lastActivity.mineHunt)) normalizedUser.lastActivity.mineHunt = 0
            if (!isNumber(normalizedUser.lastActivity.checkPregnancy)) normalizedUser.lastActivity.checkPregnancy = 0
        }

        if (!("tempProposal" in normalizedUser)) normalizedUser.tempProposal = null
        if (!("tempMarriageProposal" in normalizedUser)) normalizedUser.tempMarriageProposal = null

        // --- Nyawit (Palm Oil RPG) ---
        if (normalizedUser.bibitsawit === undefined || normalizedUser.bibitsawit === null || isNaN(normalizedUser.bibitsawit)) normalizedUser.bibitsawit = 0
        if (normalizedUser.buahsawit === undefined || normalizedUser.buahsawit === null || isNaN(normalizedUser.buahsawit)) normalizedUser.buahsawit = 0
        if (normalizedUser.sawit_pohon === undefined || normalizedUser.sawit_pohon === null || isNaN(normalizedUser.sawit_pohon)) normalizedUser.sawit_pohon = 0
        if (!normalizedUser.sawit_status) normalizedUser.sawit_status = 'none'
        
        if (typeof normalizedUser.sawit_lastactivity !== 'object' || normalizedUser.sawit_lastactivity === null || Array.isArray(normalizedUser.sawit_lastactivity)) {
            normalizedUser.sawit_lastactivity = { tanam: 0, siram: 0, panen: 0 }
        } else {
            if (normalizedUser.sawit_lastactivity.tanam === undefined || normalizedUser.sawit_lastactivity.tanam === null || isNaN(normalizedUser.sawit_lastactivity.tanam)) normalizedUser.sawit_lastactivity.tanam = 0
            if (normalizedUser.sawit_lastactivity.siram === undefined || normalizedUser.sawit_lastactivity.siram === null || isNaN(normalizedUser.sawit_lastactivity.siram)) normalizedUser.sawit_lastactivity.siram = 0
            if (normalizedUser.sawit_lastactivity.panen === undefined || normalizedUser.sawit_lastactivity.panen === null || isNaN(normalizedUser.sawit_lastactivity.panen)) normalizedUser.sawit_lastactivity.panen = 0
        }
    }

    if (hasExistingUser && shouldNormalizeUser) {
        user = normalizedUser
        if (!user.registered) {
            if (!("name" in user)) user.name = m.name
            if (!isNumber(user.age)) user.age = -1
            if (!isNumber(user.atm)) user.atm = 0
            if (!("money" in user)) user.money = 1000
            if (!("exp" in user)) user.exp = 0
            if (!("level" in user)) user.level = 1
            if (!("limit" in user)) user.limit = global.limit
            if (!("health" in user)) user.health = 100
            if (!isNumber(user.fullatm)) user.fullatm = 0
            if (!isNumber(user.atm)) user.atm = 0
            if (!isNumber(user.gold)) user.gold = 0
            if (!isNumber(user.emerald)) user.emerald = 0
            if (!isNumber(user.diamond)) user.diamond = 0
            if (!isNumber(user.iron)) user.iron = 0
            if (!isNumber(user.rock)) user.rock = 0
            if (!isNumber(user.string)) user.string = 0
            if (!isNumber(user.trash)) user.trash = 0
            if (!isNumber(user.common)) user.common = 0
            if (!isNumber(user.uncommon)) user.uncommon = 0

            if (!isNumber(user.anggur)) user.anggur = 0
            if (!isNumber(user.apel)) user.apel = 0
            if (!isNumber(user.jeruk)) user.jeruk = 0
            if (!isNumber(user.mangga)) user.mangga = 0
            if (!isNumber(user.pisang)) user.pisang = 0
            if (!isNumber(user.semangka)) user.semangka = 0
            if (!isNumber(user.stroberi)) user.stroberi = 0

            if (!isNumber(user.bibitanggur)) user.bibitanggur = 0
            if (!isNumber(user.bibitapel)) user.bibitapel = 0
            if (!isNumber(user.bibitjeruk)) user.bibitjeruk = 0
            if (!isNumber(user.bibitmangga)) user.bibitmangga = 0
            if (!isNumber(user.bibitpisang)) user.bibitpisang = 0

            if (!isNumber(user.anakanjing)) user.anakanjing = 0
            if (!isNumber(user.anakcentaur)) user.anakcentaur = 0
            if (!isNumber(user.anakgriffin)) user.anakgriffin = 0
            if (!isNumber(user.anakkucing)) user.anakkucing = 0
            if (!isNumber(user.anakkuda)) user.anakkuda = 0
            if (!isNumber(user.anakkyubi)) user.anakkyubi = 0
            if (!isNumber(user.anaknaga)) user.anaknaga = 0
            if (!isNumber(user.anakrubah)) user.anakrubah = 0
            if (!isNumber(user.anakserigala)) user.anakserigala = 0
            if (!isNumber(user.anakphonix)) user.anakphonix = 0

            if (!isNumber(user.armor)) user.armor = 0
            if (!isNumber(user.armordurability)) user.armordurability = 0
            if (!isNumber(user.axe)) user.axe = 0
            if (!isNumber(user.axedurability)) user.axedurability = 0
            if (!isNumber(user.kapak)) user.kapak = 0
            if (!isNumber(user.kapakdurability)) user.kapakdurability = 0

            if (!isNumber(user.ayam)) user.ayam = 0
            if (!isNumber(user.ayambakar)) user.ayambakar = 0
            if (!isNumber(user.ayamgoreng)) user.ayamgoreng = 0
            if (!isNumber(user.babi)) user.babi = 0
            if (!isNumber(user.babihutan)) user.babihutan = 0
            if (!isNumber(user.babipanggang)) user.babipanggang = 0
            if (!isNumber(user.banteng)) user.banteng = 0
            if (!isNumber(user.bawal)) user.bawal = 0
            if (!isNumber(user.bawalbakar)) user.bawalbakar = 0
            if (!isNumber(user.bayam)) user.bayam = 0

            if (!isNumber(user.buaya)) user.buaya = 0
            if (!isNumber(user.buntal)) user.buntal = 0
            if (!isNumber(user.cat)) user.cat = 0
            if (!isNumber(user.catexp)) user.catexp = 0
            if (!isNumber(user.catlastfeed)) user.catlastfeed = 0
            if (!isNumber(user.fox)) user.fox = 0
            if (!isNumber(user.foxexp)) user.foxexp = 0
            if (!isNumber(user.foxlastfeed)) user.foxlastfeed = 0

            if (!isNumber(user.dailylimit)) user.dailylimit = 0
            if (!isNumber(user.dog)) user.dog = 0
            if (!isNumber(user.dogexp)) user.dogexp = 0
            if (!isNumber(user.doglastfeed)) user.doglastfeed = 0
            if (!isNumber(user.dory)) user.dory = 0
            if (!isNumber(user.dragon)) user.dragon = 0
            if (!isNumber(user.dragonexp)) user.dragonexp = 0
            if (!isNumber(user.dragonlastfeed)) user.dragonlastfeed = 0
            if (!isNumber(user.gajah)) user.gajah = 0
            if (!isNumber(user.horse)) user.horse = 0
            if (!isNumber(user.horseexp)) user.horseexp = 0

            if (!isNumber(user.enchant)) user.enchant = 0
            if (!isNumber(user.esteh)) user.esteh = 0

            if (!isNumber(user.expg)) user.expg = 0
            if (!isNumber(user.exphero)) user.exphero = 0
            if (!isNumber(user.fishingrod)) user.fishingrod = 0
            if (!isNumber(user.fishingroddurability)) user.fishingroddurability = 0

            if (!isNumber(user.health)) user.health = 100
            if (!isNumber(user.healthmonster)) user.healthmonster = 0

            if (!isNumber(user.joinlimit)) user.joinlimit = 1
            if (!isNumber(user.judilast)) user.judilast = 0

            if (!isNumber(user.kardus)) user.kardus = 0
            if (!isNumber(user.katana)) user.katana = 0
            if (!isNumber(user.katanadurability)) user.katanadurability = 0
            if (!isNumber(user.kayu)) user.kayu = 0
            if (!isNumber(user.kentang)) user.kentang = 0
            if (!isNumber(user.kentanggoreng)) user.kentanggoreng = 0
            if (!isNumber(user.kepiting)) user.kepiting = 0
            if (!isNumber(user.kepitingbakar)) user.kepitingbakar = 0
            if (!isNumber(user.kerbau)) user.kerbau = 0
            if (!isNumber(user.kerjadelapan)) user.kerjadelapan = 0
            if (!isNumber(user.kerjadelapanbelas)) user.kerjadelapanbelas = 0
            if (!isNumber(user.kerjadua)) user.kerjadua = 0
            if (!isNumber(user.kerjaduabelas)) user.kerjaduabelas = 0
            if (!isNumber(user.kerjaduadelapan)) user.kerjaduadelapan = 0
            if (!isNumber(user.kerjaduadua)) user.kerjaduadua = 0
            if (!isNumber(user.kerjaduaempat)) user.kerjaduaempat = 0
            if (!isNumber(user.kerjaduaenam)) user.kerjaduaenam = 0
            if (!isNumber(user.kerjadualima)) user.kerjadualima = 0
            if (!isNumber(user.kerjaduapuluh)) user.kerjaduapuluh = 0
            if (!isNumber(user.kerjaduasatu)) user.kerjaduasatu = 0
            if (!isNumber(user.kerjaduasembilan)) user.kerjaduasembilan = 0
            if (!isNumber(user.kerjaduatiga)) user.kerjaduatiga = 0
            if (!isNumber(user.kerjaduatujuh)) user.kerjaduatujuh = 0
            if (!isNumber(user.kerjaempat)) user.kerjaempat = 0
            if (!isNumber(user.kerjaempatbelas)) user.kerjaempatbelas = 0
            if (!isNumber(user.kerjaenam)) user.kerjaenam = 0
            if (!isNumber(user.kerjaenambelas)) user.kerjaenambelas = 0
            if (!isNumber(user.kerjalima)) user.kerjalima = 0
            if (!isNumber(user.kerjalimabelas)) user.kerjalimabelas = 0
            if (!isNumber(user.kerjasatu)) user.kerjasatu = 0
            if (!isNumber(user.kerjasebelas)) user.kerjasebelas = 0
            if (!isNumber(user.kerjasembilan)) user.kerjasembilan = 0
            if (!isNumber(user.kerjasembilanbelas)) user.kerjasembilanbelas = 0
            if (!isNumber(user.kerjasepuluh)) user.kerjasepuluh = 0
            if (!isNumber(user.kerjatiga)) user.kerjatiga = 0
            if (!isNumber(user.kerjatigabelas)) user.kerjatigabelas = 0
            if (!isNumber(user.kerjatigapuluh)) user.kerjatigapuluh = 0
            if (!isNumber(user.kerjatujuh)) user.kerjatujuh = 0
            if (!isNumber(user.kerjatujuhbelas)) user.kerjatujuhbelas = 0
            if (!isNumber(user.korbanngocok)) user.korbanngocok = 0
            if (!isNumber(user.kubis)) user.kubis = 0
            if (!isNumber(user.kucing)) user.kucing = 0
            if (!isNumber(user.kucinglastclaim)) user.kucinglastclaim = 0
            if (!isNumber(user.kuda)) user.kuda = 0
            if (!isNumber(user.kudalastclaim)) user.kudalastclaim = 0
            if (!isNumber(user.kyubi)) user.kyubi = 0
            if (!isNumber(user.kyubiexp)) user.kyubiexp = 0
            if (!isNumber(user.kyubilastclaim)) user.kyubilastclaim = 0
            if (!isNumber(user.kyubilastfeed)) user.kyubilastfeed = 0
            if (!isNumber(user.labu)) user.labu = 0
            if (!isNumber(user.laper)) user.laper = 100
            if (!isNumber(user.lastadventure)) user.lastadventure = 0
            if (!isNumber(user.lastbansos)) user.lastbansos = 0
            if (!isNumber(user.lastberbru)) user.lastberbru = 0
            if (!isNumber(user.lastberkebon)) user.lastberkebon = 0
            if (!isNumber(user.lastbunga)) user.lastbunga = 0
            if (!isNumber(user.lastbunuhi)) user.lastbunuhi = 0
            if (!isNumber(user.lastclaim)) user.lastclaim = 0
            if (!isNumber(user.lastcode)) user.lastcode = 0
            if (!isNumber(user.lastcodereg)) user.lastcodereg = 0
            if (!isNumber(user.lastcrusade)) user.lastcrusade = 0
            if (!isNumber(user.lastdagang)) user.lastdagang = 0
            if (!isNumber(user.lastduel)) user.lastduel = 0
            if (!isNumber(user.lastdungeon)) user.lastdungeon = 0
            if (!isNumber(user.lasteasy)) user.lasteasy = 0
            if (!isNumber(user.lastfight)) user.lastfight = 0
            if (!isNumber(user.lastfishing)) user.lastfishing = 0
            if (!isNumber(user.lastgift)) user.lastgift = 0
            if (!isNumber(user.lastgojek)) user.lastgojek = 0
            if (!isNumber(user.lastgrab)) user.lastgrab = 0
            if (!isNumber(user.lasthourly)) user.lasthourly = 0
            if (!isNumber(user.lasthunt)) user.lasthunt = 0
            if (!isNumber(user.lastIstigfar)) user.lastIstigfar = 0
            if (!isNumber(user.lastjb)) user.lastjb = 0
            if (!isNumber(user.lastkill)) user.lastkill = 0
            if (!isNumber(user.lastlink)) user.lastlink = 0
            if (!isNumber(user.lastlumber)) user.lastlumber = 0
            if (!isNumber(user.lastmancingeasy)) user.lastmancingeasy = 0
            if (!isNumber(user.lastmancingextreme)) user.lastmancingextreme = 0
            if (!isNumber(user.lastmancinghard)) user.lastmancinghard = 0
            if (!isNumber(user.lastmancingnormal)) user.lastmancingnormal = 0
            if (!isNumber(user.lastmining)) user.lastmining = 0
            if (!isNumber(user.lastmisi)) user.lastmisi = 0
            if (!isNumber(user.lastmonthly)) user.lastmonthly = 0
            if (!isNumber(user.lastmulung)) user.lastmulung = 0
            if (!isNumber(user.lastnambang)) user.lastnambang = 0
            if (!isNumber(user.lastnebang)) user.lastnebang = 0
            if (!isNumber(user.lastngocok)) user.lastngocok = 0
            if (!isNumber(user.lastngojek)) user.lastngojek = 0
            if (!isNumber(user.lastopen)) user.lastopen = 0
            if (!isNumber(user.lastpekerjaan)) user.lastpekerjaan = 0
            if (!isNumber(user.lastpotionclaim)) user.lastpotionclaim = 0
            if (!isNumber(user.lastrampok)) user.lastrampok = 0
            if (!isNumber(user.lastlont)) user.lastlont = 0
            if (!isNumber(user.lastramuanclaim)) user.lastramuanclaim = 0
            if (!isNumber(user.lastrob)) user.lastrob = 0
            if (!isNumber(user.lastroket)) user.lastroket = 0
            if (!isNumber(user.lastsda)) user.lastsda = 0
            if (!isNumber(user.lastseen)) user.lastseen = 0
            if (!isNumber(user.lastSetStatus)) user.lastSetStatus = 0
            if (!isNumber(user.lastsironclaim)) user.lastsironclaim = 0
            if (!isNumber(user.lastsmancingclaim)) user.lastsmancingclaim = 0
            if (!isNumber(user.laststringclaim)) user.laststringclaim = 0
            if (!isNumber(user.lastswordclaim)) user.lastswordclaim = 0
            if (!isNumber(user.lastturu)) user.lastturu = 0
            if (!isNumber(user.lastwar)) user.lastwar = 0
            if (!isNumber(user.lastwarpet)) user.lastwarpet = 0
            if (!isNumber(user.lastweaponclaim)) user.lastweaponclaim = 0
            if (!isNumber(user.lastweekly)) user.lastweekly = 0
            if (!isNumber(user.lastwork)) user.lastwork = 0

            if (!isNumber(user.legendary)) user.legendary = 0
            if (!isNumber(user.lobster)) user.lobster = 0
            if (!isNumber(user.lumba)) user.lumba = 0
            if (!isNumber(user.magicwand)) user.magicwand = 0
            if (!isNumber(user.magicwanddurability)) user.magicwanddurability = 0
            if (!isNumber(user.makanancentaur)) user.makanancentaur = 0
            if (!isNumber(user.makanangriffin)) user.makanangriffin = 0
            if (!isNumber(user.makanankyubi)) user.makanankyubi = 0
            if (!isNumber(user.makanannaga)) user.makanannaga = 0
            if (!isNumber(user.makananpet)) user.makananpet = 0
            if (!isNumber(user.makananphonix)) user.makananphonix = 0
            if (!isNumber(user.makananserigala)) user.makananserigala = 0
            if (!isNumber(user.mana)) user.mana = 0
            if (!isNumber(user.mangga)) user.mangga = 0

            if (!isNumber(user.monyet)) user.monyet = 0
            if (!isNumber(user.mythic)) user.mythic = 0
            if (!isNumber(user.naga)) user.naga = 0
            if (!isNumber(user.nagalastclaim)) user.nagalastclaim = 0
            if (!isNumber(user.net)) user.net = 0
            if (!isNumber(user.nila)) user.nila = 0
            if (!isNumber(user.nilabakar)) user.nilabakar = 0
            if (!isNumber(user.ojekk)) user.ojekk = 0
            if (!isNumber(user.oporayam)) user.oporayam = 0
            if (!isNumber(user.orca)) user.orca = 0
            if (!isNumber(user.pancing)) user.pancing = 0
            if (!isNumber(user.pancingan)) user.pancingan = 1
            if (!isNumber(user.panda)) user.panda = 0
            if (!isNumber(user.paus)) user.paus = 0
            if (!isNumber(user.pausbakar)) user.pausbakar = 0
            if (!isNumber(user.pc)) user.pc = 0
            if (!isNumber(user.pepesikan)) user.pepesikan = 0
            if (!isNumber(user.pertambangan)) user.pertambangan = 0
            if (!isNumber(user.pertanian)) user.pertanian = 0
            if (!isNumber(user.pet)) user.pet = 0
            if (!isNumber(user.petFood)) user.petFood = 0
            if (!isNumber(user.phonix)) user.phonix = 0
            if (!isNumber(user.phonixexp)) user.phonixexp = 0
            if (!isNumber(user.phonixlastclaim)) user.phonixlastclaim = 0
            if (!isNumber(user.phonixlastfeed)) user.phonixlastfeed = 0
            if (!isNumber(user.pickaxe)) user.pickaxe = 0
            if (!isNumber(user.pickaxedurability)) user.pickaxedurability = 0
            if (!isNumber(user.pillhero)) user.pillhero = 0
            if (!isNumber(user.pisang)) user.pisang = 0
            if (!isNumber(user.pointxp)) user.pointxp = 0
            if (!isNumber(user.potion)) user.potion = 0
            if (!isNumber(user.psenjata)) user.psenjata = 0
            if (!isNumber(user.psepick)) user.psepick = 0
            if (!isNumber(user.ramuan)) user.ramuan = 0
            if (!isNumber(user.ramuancentaurlast)) user.ramuancentaurlast = 0
            if (!isNumber(user.ramuangriffinlast)) user.ramuangriffinlast = 0
            if (!isNumber(user.ramuanherolast)) user.ramuanherolast = 0
            if (!isNumber(user.ramuankucinglast)) user.ramuankucinglast = 0
            if (!isNumber(user.ramuankudalast)) user.ramuankudalast = 0
            if (!isNumber(user.ramuankyubilast)) user.ramuankyubilast = 0
            if (!isNumber(user.ramuannagalast)) user.ramuannagalast = 0
            if (!isNumber(user.ramuanphonixlast)) user.ramuanphonixlast = 0
            if (!isNumber(user.ramuanrubahlast)) user.ramuanrubahlast = 0
            if (!isNumber(user.ramuanserigalalast)) user.ramuanserigalalast = 0
            if (!isNumber(user.reglast)) user.reglast = 0
            if (!isNumber(user.rendang)) user.rendang = 0
            if (!isNumber(user.rhinoceros)) user.rhinoceros = 0
            if (!isNumber(user.rhinocerosexp)) user.rhinocerosexp = 0
            if (!isNumber(user.rhinoceroslastfeed)) user.rhinoceroslastfeed = 0
            if (!isNumber(user.robo)) user.robo = 0
            if (!isNumber(user.roboxp)) user.roboxp = 0

            if (!isNumber(user.roket)) user.roket = 0
            if (!isNumber(user.roti)) user.roti = 0
            if (!isNumber(user.rubah)) user.rubah = 0
            if (!isNumber(user.rubahlastclaim)) user.rubahlastclaim = 0
            if (!isNumber(user.rumahsakit)) user.rumahsakit = 0
            if (!isNumber(user.sampah)) user.sampah = 0
            if (!isNumber(user.sand)) user.sand = 0
            if (!isNumber(user.sapi)) user.sapi = 0
            if (!isNumber(user.sapir)) user.sapir = 0
            if (!isNumber(user.seedbayam)) user.seedbayam = 0
            if (!isNumber(user.seedbrokoli)) user.seedbrokoli = 0
            if (!isNumber(user.seedjagung)) user.seedjagung = 0
            if (!isNumber(user.seedkangkung)) user.seedkangkung = 0
            if (!isNumber(user.seedkentang)) user.seedkentang = 0
            if (!isNumber(user.seedkubis)) user.seedkubis = 0
            if (!isNumber(user.seedlabu)) user.seedlabu = 0
            if (!isNumber(user.seedtomat)) user.seedtomat = 0
            if (!isNumber(user.seedwortel)) user.seedwortel = 0
            if (!isNumber(user.serigala)) user.serigala = 0
            if (!isNumber(user.serigalalastclaim)) user.serigalalastclaim = 0
            if (!isNumber(user.shield)) user.shield = false
            if (!isNumber(user.skillexp)) user.skillexp = 0
            if (!isNumber(user.snlast)) user.snlast = 0
            if (!isNumber(user.soda)) user.soda = 0
            if (!isNumber(user.sop)) user.sop = 0
            if (!isNumber(user.spammer)) user.spammer = 0
            if (!isNumber(user.spinlast)) user.spinlast = 0
            if (!isNumber(user.ssapi)) user.ssapi = 0
            if (!isNumber(user.stamina)) user.stamina = 100
            if (!isNumber(user.steak)) user.steak = 0
            if (!isNumber(user.stick)) user.stick = 0
            if (!isNumber(user.strength)) user.strength = 0

            if (!isNumber(user.sword)) user.sword = 0
            if (!isNumber(user.sworddurability)) user.sworddurability = 0
            if (!isNumber(user.tigame)) user.tigame = 50
            if (!isNumber(user.tiketcoin)) user.tiketcoin = 0
            if (!isNumber(user.title)) user.title = 0

            if (!isNumber(user.upgrader)) user.upgrader = 0
            if (!isNumber(user.wallet)) user.wallet = 0
            if (!isNumber(user.warn)) user.warn = 0
            if (!isNumber(user.weapon)) user.weapon = 0
            if (!isNumber(user.weapondurability)) user.weapondurability = 0

            if (!user.lbars) user.lbars = "[▒▒▒▒▒▒▒▒▒]"
            if (!user.job) user.job = "Pengangguran"
        }

        if (!("owner" in user)) user.owner = false
        if (!("ownerTime" in user)) user.ownerTime = 0
        if (!("premium" in user)) user.premium = false
        if (!("premiumTime" in user)) user.premiumTime = 0
        if (!("ownerLastNoticeDay" in user)) user.ownerLastNoticeDay = 0
        if (!("premiumLastNoticeDay" in user)) user.premiumLastNoticeDay = 0
        user.bank = normalizeBank(user.bank);

        // db rpg lainnya

        if (!("energy" in user)) user.energy = 100;
        if (!("gender" in user)) user.gender = 'male';
        if (!("pasangan" in user)) user.pasangan = null; // Untuk pacaran
        if (!("marriage" in user)) user.marriage = null; // Untuk menikah
        if (!("statusRelationship" in user)) user.statusRelationship = 'jomblo'; // jomblo, pacaran, menikah
        if (!("tempProposal" in user)) user.tempProposal = null; // Proposal pacaran satu arah
        if (!("tempMarriageProposal" in user)) user.tempMarriageProposal = null; // Proposal menikah satu arah

        // Properti Kehamilan & Anak
        if (!("isPregnant" in user)) user.isPregnant = false;
        if (!("pregnancyDueDate" in user)) user.pregnancyDueDate = null;
        if (!("children" in user)) user.children = []; // Array untuk menyimpan data anak


        if (!("inventory" in user)) {
            user.inventory = {
                food: 0,
                bahan: 0,
                masakan: 0
            };
        } else {

            if (!("food" in user.inventory)) user.inventory.food = 0;
            if (!("bahan" in user.inventory)) user.inventory.bahan = 0;
            if (!("masakan" in user.inventory)) user.inventory.masakan = 0;
        }


        if (!("lastActivity" in user)) {
            user.lastActivity = {
                cook: 0,
                ngewe: 0,
                mineHunt: 0,
                checkPregnancy: 0 // Cooldown untuk cek hamil
            };
        } else {

            if (!("cook" in user.lastActivity)) user.lastActivity.cook = 0;
            if (!("ngewe" in user.lastActivity)) user.lastActivity.ngewe = 0;
            if (!("mineHunt" in user.lastActivity)) user.lastActivity.mineHunt = 0;
            if (!("checkPregnancy" in user.lastActivity)) user.lastActivity.checkPregnancy = 0;
        }

        if (global.setting.data_rpg) {
            const defaultUser = {
                age: -1,
                exp: 0,
                level: 1,
                limit: global.limit,
                health: 100,
                money: 1000,
                lastUnreg: 0,
                registered: false,
                 owner: false,
                 ownerTime: 0,
                 premium: false,
                 premiumTime: 0,
                 ownerLastNoticeDay: 0,
                 premiumLastNoticeDay: 0,
                 agility: 16,
                banned: false,
                antispam: 0,
                antispamlastclaim: 0,
                skill: "",
                title: "",
                sewa: false,
                anakanjing: 0,
                anakcentaur: 0,
                anakgriffin: 0,
                anakkucing: 0,
                anakkuda: 0,
                anakkyubi: 0,
                anaknaga: 0,
                anakpancingan: 0,
                anakphonix: 0,
                anakrubah: 0,
                anakserigala: 0,
                anggur: 0,
                anjing: 0,
                anjinglastclaim: 0,
                apel: 0,
                aqua: 0,
                arc: 0,
                arcdurability: 0,
                arlok: 0,
                armor: 0,
                armordurability: 0,
                armormonster: 0,
                as: 0,
                atm: 0,
                autolevelup: true,
                axe: 0,
                axedurability: 0,
                ayam: 0,
                ayamb: 0,
                ayambakar: 0,
                ayamg: 0,
                ayamgoreng: 0,
                babi: 0,
                babihutan: 0,
                babipanggang: 0,
                bank: { level: 0, balance: 0, limit: 0 },
                fullatm: 0,
                bandage: 0,
                banteng: 0,
                batu: 0,
                bawal: 0,
                bawalbakar: 0,
                bayam: 0,
                berlian: 100,
                bibitanggur: 0,
                bibitapel: 0,
                bibitjeruk: 0,
                bibitmangga: 0,
                bibitpisang: 0,
                botol: 0,
                bow: 0,
                bowdurability: 0,
                boxs: 0,
                brick: 0,
                brokoli: 0,
                buaya: 0,
                buntal: 0,
                cat: 0,
                catlastfeed: 0,
                centaur: 0,
                centaurexp: 0,
                centaurlastclaim: 0,
                centaurlastfeed: 0,
                clay: 0,
                coal: 0,
                coin: 0,
                common: 0,
                crystal: 0,
                cumi: 0,
                cupon: 0,
                dailylimit: 0,
                diamond: 0,
                dog: 0,
                dogexp: 0,
                doglastfeed: 0,
                dory: 0,
                dragon: 0,
                dragonexp: 0,
                dragonlastfeed: 0,
                emas: 0,
                emerald: 0,
                esteh: 0,
                exp: 0,
                expg: 0,
                exphero: 0,
                expired: 0,
                fishingrod: 0,
                fishingroddurability: 0,
                fortress: 0,
                fox: 0,
                foxexp: 0,
                foxlastfeed: 0,
                fullatm: Infinity,
                gadodado: 0,
                gajah: 0,
                gamemines: false,
                ganja: 0,
                gardenboxs: 0,
                gems: 0,
                glass: 0,
                gold: 0,
                griffin: 0,
                griffinexp: 0,
                griffinlastclaim: 0,
                griffinlastfeed: 0,
                gulai: 0,
                gurita: 0,
                harimau: 0,
                haus: 100,
                healt: 100,
                health: 100,
                healthmonster: 0,
                healtmonster: 0,
                hero: 1,
                herolastclaim: 0,
                hiu: 0,
                horse: 0,
                horseexp: 0,
                horselastfeed: 0,
                ikan: 0,
                ikanbakar: 0,
                intelligence: 10,
                iron: 0,
                jagung: 0,
                jagungbakar: 0,
                jeruk: 0,
                job: "Pengangguran",
                judilast: 0,
                kaleng: 0,
                kambing: 0,
                kangkung: 0,
                kapak: 0,
                kardus: 0,
                katana: 0,
                katanadurability: 0,
                kayu: 0,
                kentang: 0,
                kentanggoreng: 0,
                kepiting: 0,
                kepitingbakar: 0,
                kerbau: 0,
                kerjadelapan: 0,
                kerjadelapanbelas: 0,
                kerjadua: 0,
                kerjaduabelas: 0,
                kerjaduadelapan: 0,
                kerjaduadua: 0,
                kerjaduaempat: 0,
                kerjaduaenam: 0,
                kerjadualima: 0,
                kerjaduapuluh: 0,
                kerjaduasatu: 0,
                kerjaduasembilan: 0,
                kerjaduatiga: 0,
                kerjaduatujuh: 0,
                kerjaempat: 0,
                kerjaempatbelas: 0,
                kerjaenam: 0,
                kerjaenambelas: 0,
                kerjalima: 0,
                kerjalimabelas: 0,
                kerjasatu: 0,
                kerjasebelas: 0,
                kerjasembilan: 0,
                kerjasembilanbelas: 0,
                kerjasepuluh: 0,
                kerjatiga: 0,
                kerjatigabelas: 0,
                kerjatigapuluh: 0,
                kerjatujuh: 0,
                kerjatujuhbelas: 0,
                korbanngocok: 0,
                kubis: 0,
                kucing: 0,
                kucinglastclaim: 0,
                kuda: 0,
                kudalastclaim: 0,
                kyubi: 0,
                kyubiexp: 0,
                kyubilastclaim: 0,
                kyubilastfeed: 0,
                labu: 0,
                laper: 100,
                lastadventure: 0,
                lastberbru: 0,
                lastberkebon: 0,
                lastbunga: 0,
                lastbunuhi: 0,
                lastclaim: 0,
                lastcode: 0,
                lastcrusade: 0,
                lastdagang: 0,
                lastduel: 0,
                lastdungeon: 0,
                lasteasy: 0,
                lastfight: 0,
                lastfishing: 0,
                lastgojek: 0,
                lastgrab: 0,
                lasthourly: 0,
                lasthunt: 0,
                lastjb: 0,
                lastkill: 0,
                lastlink: 0,
                lastlumber: 0,
                lastmancingeasy: 0,
                lastmancingextreme: 0,
                lastmancinghard: 0,
                lastmancingnormal: 0,
                lastmining: 0,
                lastmisi: 0,
                lastmonthly: 0,
                lastmulung: 0,
                lastnambang: 0,
                lastnebang: 0,
                lastngocok: 0,
                lastngojek: 0,
                lastopen: 0,
                lastpekerjaan: 0,
                lastpotionclaim: 0,
                lastramuanclaim: 0,
                lastrob: 0,
                lastroket: 0,
                lastseen: 0,
                lastSetStatus: 0,
                lastsironclaim: 0,
                lastsmancingclaim: 0,
                laststringclaim: 0,
                lastswordclaim: 0,
                lastturu: 0,
                lastwarpet: 0,
                lastweaponclaim: 0,
                lastweekly: 0,
                lastwork: 0,
                legendary: 0,
                lele: 0,
                leleb: 0,
                lelebakar: 0,
                leleg: 0,
                bank: { level: 0, balance: 0, limit: 0 },
                limit: global.limit,
                lion: 0,
                lionexp: 0,
                lionlastfeed: 0,
                lobster: 0,
                lumba: 0,
                magicwand: 0,
                magicwanddurability: 0,
                makanan: 0,
                makanancentaur: 0,
                makanangriffin: 0,
                makanankyubi: 0,
                makanannaga: 0,
                makananpet: 0,
                makananphonix: 0,
                makananserigala: 0,
                mana: 20,
                mangga: 0,
                misi: "",
                money: 100,
                monyet: 0,
                mythic: 0,
                naga: 0,
                nagalastclaim: 0,
                name: m.name,
                net: 0,
                nila: 0,
                nilabakar: 0,
                ojekk: 0,
                oporayam: 0,
                orca: 0,
                owner: false,
                ownerTime: 0,
                pancingan: 1,
                panda: 0,
                pasangan: "",
                paus: 0,
                pausbakar: 0,
                pc: 0,
                pepesikan: 0,
            };

            for (const key in defaultUser) {
                if (!(key in user)) {
                    user[key] = defaultUser[key];
                }
            }
        }
    } else if (shouldNormalizeUser) {
        global.db.data.users[userKey] = {
            name: m.name,
            age: -1,
            exp: 0,
            level: 1,
            limit: global.limit,
            health: 100,
            money: 1000,
            lastUnreg: 0,
            registered: false,
            owner: false,
            ownerTime: 0,
            premium: false,
            premiumTime: 0,
            ownerLastNoticeDay: 0,
            premiumLastNoticeDay: 0,
            energy: 100,
            gender: 'Belum diatur',   // ✅ jangan null biar gak undefined
            statusRelationship: 'Jomblo',
            pasangan: null,
            marriage: null,
            isPregnant: false,
            pregnancyDueDate: null,
            children: [],
            bank: { level: 0, balance: 0, limit: 0 },
            inventory: {
                food: 0,
                bahan: 0,
                masakan: 0
            },
            lastActivity: {
                cook: 0,
                ngewe: 0,
                mineHunt: 0,
                checkPregnancy: 0
            },
            tempProposal: null,
            tempMarriageProposal: null,
            bibitsawit: 0,
            buahsawit: 0,
            sawit_pohon: 0,
            sawit_status: 'none',
            sawit_lastactivity: {
                tanam: 0,
                siram: 0,
                panen: 0
            },
            autoAi: false,
            autoAiChance: 0.3,
            __schemaVersion: USER_SCHEMA_VERSION
        }
    }

    if (shouldNormalizeUser && global.db.data.users[userKey]) {
        global.db.data.users[userKey].__schemaVersion = USER_SCHEMA_VERSION
    }

    if (m.isGroup) {
        let chat = global.db.data.chats[m.chat]
        if (typeof chat !== 'object') {
            global.db.data.chats[m.chat] = {}
            dbModified = true
        }
        if (chat) {
            if (!('acc' in chat)) chat.acc = false
            if (!('welcome' in chat)) chat.welcome = false
            if (!('antibot' in chat)) chat.antibot = false
            if (!('bye' in chat)) chat.bye = false
            if (!('detect' in chat)) chat.detect = false
            if (!('sWelcome' in chat)) chat.sWelcome = ''
            if (!('sBye' in chat)) chat.sBye = ''
            if (!('delete' in chat)) chat.delete = false
            if (!('adminonly' in chat)) chat.adminonly = false
            if (!('antiedit' in chat)) chat.antiedit = false
            if (!('antilink' in chat)) chat.antilink = false
            if (!('antilinkall' in chat)) chat.antilinkall = false
            if (!('antilinkType' in chat)) chat.antilinkType = 'delete'
            if (!('antispam' in chat)) chat.antispam = true
            if (!('antifoto' in chat)) chat.antifoto = false
            if (!('antivideo' in chat)) chat.antiVideo = false
            if (!('antisticker' in chat)) chat.antiSticker = false
            if (!('antiaudio' in chat)) chat.antiaudio = false
            if (!('viewonce' in chat)) chat.viewonce = false
            if (!('antibadword' in chat)) chat.antibadword = false
            if (!('simi' in chat)) chat.simi = false
            if (!('rpg' in chat)) chat.rpg = false
            if (!('game' in chat)) chat.game = false
            if (!('antitagsw' in chat)) chat.antitagsw = false
            if (!isNumber(chat.expired)) chat.expired = null
            if (!('sewaLastNoticeDay' in chat)) chat.sewaLastNoticeDay = 0
            if (!('blacklist' in chat)) chat.blacklist = []
            if (!('totalChat' in chat)) chat.totalChat = {}
            if (!('list' in chat) || typeof chat.list !== 'object' || Array.isArray(chat.list)) chat.list = {}
            if (!('adzan' in chat)) chat.adzan = { status: false, wilayah: 'lubuklinggau', close: false }
            if (!('listLink' in chat)) chat.listLink = []
            if (!('antimeta' in chat)) chat.antimeta = false
            if (!('mbg' in chat)) chat.mbg = true
        } else {
            dbModified = true
            global.db.data.chats[m.chat] = {
                isBanned: false,
                antibot: false,
                antispam: true,
                antitagsw: false,
                adminonly: false,
                acc: false,
                welcome: false,
                bye: false,
                detect: false,
                totalChat: {},
                sWelcome: '',
                sBye: '',
                delete: false,
                antiedit: false,
                antilink: false,
                antilinkall: false,
                antilinkType: 'delete',
                antifoto: false,
                antivideo: false,
                antisticker: false,
                antiaudio: false,
                viewonce: false,
                antibadword: false,
                simi: false,
                expired: null,
                sewaLastNoticeDay: 0,
                rpg: false,
                game: false,
                blacklist: [],
                list: {},
                adzan: { status: false, wilayah: 'lubuklinggau', close: false },
                listLink: [],
                antimeta: false,
                mbg: true,
            }
        }
    }
    
    // [RPG SYNC] Sinkronkan Stamina dan Energi agar tidak membingungkan user
    // [PERF] Hanya define energy alias SEKALI per user object, bukan setiap pesan.
    // Sebelumnya: delete + Object.defineProperty setiap pesan = hancurkan V8 hidden class
    if (user) {
        _setupEnergyAlias(user)

        if (typeof user.money !== 'number' || isNaN(user.money)) user.money = 0
        if (typeof user.exp !== 'number' || isNaN(user.exp)) user.exp = 0
        if (typeof user.limit !== 'number' || isNaN(user.limit)) user.limit = 0
    }

    let settings = global.db.data.settings[conn.user.jid]
    if (typeof settings !== 'object') {
        global.db.data.settings[conn.user.jid] = {}
        dbModified = true
    }
    if (settings) {
        if (!('self' in settings)) settings.self = false
        if (!('autoread' in settings)) settings.autoread = false
        if (!('autobio' in settings)) settings.autobio = true
        if (!('autoreact' in settings)) settings.autoreact = false
        if (!('anticall' in settings)) settings.anticall = false
        if (!('image' in settings)) settings.image = true
        if (!('gif' in settings)) settings.gif = false
        if (!('teks' in settings)) settings.teks = false
        if (!('doc' in settings)) settings.doc = false
        if (!('button' in settings)) settings.button = false
        if (!('backup' in settings)) settings.backup = false
        if (!('mustjoin' in settings)) settings.mustjoin = false
        if (!('schedule' in settings)) settings.schedule = []
        if (!('listblock' in settings)) settings.listblock = []
        if (!('fake' in settings)) settings.fake = false
        if (!('noprefix' in settings)) settings.noprefix = false
        if (!('covers' in settings) || typeof settings.covers !== 'object') settings.covers = {}
        if (!('menu' in settings.covers) || typeof settings.covers.menu !== 'object') settings.covers.menu = {}
        if (!('welcome' in settings.covers) || typeof settings.covers.welcome !== 'object') settings.covers.welcome = {}
        if (!('bye' in settings.covers) || typeof settings.covers.bye !== 'object') settings.covers.bye = {}
        if (!('autoAi' in settings)) settings.autoAi = true
        if (!('autoAiChance' in settings)) settings.autoAiChance = 0.4
        if (!('mbg' in settings)) settings.mbg = true
        if (!('startupNotice' in settings)) settings.startupNotice = true
    } else {
        dbModified = true
        global.db.data.settings[conn.user.jid] = {
            self: false,
            autobio: false,
            autoreact: false,
            autoread: false,
            anticall: false,
            mustjoin: false,
            image: true,
            gif: false,
            teks: false,
            doc: false,
            button: false,
            gcImg: true,
            gcGif: false,
            gcTeks: false,
            gcDoc: false,
            timeChat: 0,
            resetTime: 0,
            backup: false,
            schedule: [],
            listblock: [],
            fake: false,
            noprefix: false,
            autoAi: true,
            autoAiChance: 0.4,
            mbg: true,
            startupNotice: true,
            covers: {
                menu: {},
                welcome: {},
                bye: {}
            }
        }
    }

    let schedule = global.db.data.schedule;
    if (typeof schedule !== 'object') {
        global.db.data.schedule = [];
        dbModified = true;
    }

    if (typeof global.db.data.autoreactChannels !== 'object') {
        global.db.data.autoreactChannels = {};
        dbModified = true;
    }

    if (dbModified) {
        global.markDbDirty?.()
    }
}
