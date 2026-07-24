const moment = (await import('moment-timezone')).default
import fs from 'fs'
import archiver from 'archiver'
import cron from 'node-cron'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const jsonMessagePath = path.resolve(__dirname, '../../../storage/json/message.json')
const jsonMessage = JSON.parse(fs.readFileSync(jsonMessagePath, 'utf-8'))

const GROUP_METADATA_CACHE_TTL = 60 * 1000
const EXPIRY_NOTICE_DAYS = [3, 1]
const DAY_MS = 24 * 60 * 60 * 1000

let backupTask = null
let resetLimitTask = null
let expiryTask = null
let automaticInitialized = false

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function getActiveConn(conn) {
    return global.conn || conn
}

function getBotSettingKey(conn) {
    if (!conn) return ''
    return conn.user?.jid || conn.decodeJid?.(conn.user?.id) || conn.user?.id || ''
}

function getGroupMetadataCache(conn) {
    if (!conn.groupMetadataCache) {
        conn.groupMetadataCache = new Map()
    }

    return conn.groupMetadataCache
}

async function getCachedGroupMetadata(conn, jid) {
    const cache = getGroupMetadataCache(conn)
    const now = Date.now()
    const cached = cache.get(jid)

    if (cached && cached.expiresAt > now) {
        return cached.value
    }

    if (cached) {
        cache.delete(jid)
    }

    const metadata = await conn.groupMetadata(jid).catch(() => null)
    if (!metadata) return null

    cache.set(jid, {
        value: metadata,
        expiresAt: now + GROUP_METADATA_CACHE_TTL,
    })

    if (conn.chats?.[jid]) {
        conn.chats[jid].metadata = metadata
    }

    return metadata
}

function updateGroupSetting(jid, conn, type) {
    const setting = type === 'close' ? 'announcement' : 'not_announcement'
    return conn.groupSettingUpdate(jid, setting)
}

function ensureNumber(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback
}

function formatRemaining(ms) {
    const safeMs = Math.max(0, ensureNumber(ms, 0))
    const days = Math.floor(safeMs / DAY_MS)
    const hours = Math.floor((safeMs % DAY_MS) / (60 * 60 * 1000))
    const minutes = Math.floor((safeMs % (60 * 60 * 1000)) / (60 * 1000))

    if (days > 0) return `${days} hari ${hours} jam`
    if (hours > 0) return `${hours} jam ${minutes} menit`
    return `${minutes} menit`
}

async function groupSchedule(conn, message) {
    const activeConn = getActiveConn(conn)
    if (!activeConn) return

    const schedules = global.db.data.schedule
    if (!schedules || schedules.length === 0) return

    const time = moment.tz('Asia/Jakarta').format('HH:mm')

    for (const entry of schedules) {
        try {
            const groupMetadata = await getCachedGroupMetadata(activeConn, entry.id)
            if (!groupMetadata) {
                global.db.data.schedule = global.db.data.schedule.filter((item) => item.id !== entry.id)
                global.markDbDirty?.()
                continue
            }

            const isAnnounce = groupMetadata.announce

            if (time === entry.time.close && isAnnounce === false) {
                await activeConn.reply(entry.id, message.close, null)
                await updateGroupSetting(entry.id, activeConn, 'close')
            }

            if (time === entry.time.open && isAnnounce === true) {
                await activeConn.reply(entry.id, message.open, null)
                await updateGroupSetting(entry.id, activeConn, 'open')
            }
        } catch (error) {
            console.error(`[SCHEDULE ERROR] ID: ${entry.id}`, error)
        }
    }
}

function backupScript(conn) {
    if (backupTask) return backupTask

    backupTask = cron.schedule('0 */6 * * *', async () => {
        const activeConn = getActiveConn(conn)
        const settingKey = getBotSettingKey(activeConn)
        if (!activeConn || !settingKey) return
        if (!global.db.data.settings[settingKey]?.backup) return

        const backupFileName = jsonMessage.backupName || 'backup.zip'
        const output = fs.createWriteStream(backupFileName)
        const archive = archiver('zip', { zlib: { level: 9 } })

        const ownerNumber = String(Array.isArray(global.owner) ? global.owner[0] : global.owner || '').replace(/\D/g, '');
        const target = ownerNumber ? `${ownerNumber}@s.whatsapp.net` : global.zansx;

        output.on('close', async () => {
            try {
                const fileSize = await global.Func.toSize(archive.pointer())
                const caption =
                    `*SYSTEM AUTO BACKUP*\n\n` +
                    `Size: ${fileSize}\n` +
                    `Time: ${new Date().toLocaleString()}\n` +
                    `Status: Success`

                await activeConn.sendFile(target, backupFileName, backupFileName, caption, {
                    key: { participant: '0@s.whatsapp.net', remoteJid: '0@s.whatsapp.net' },
                    message: { conversation: 'System Backup Complete' }
                }).catch(console.error)
            } finally {
                setTimeout(() => {
                    if (fs.existsSync(backupFileName)) fs.unlinkSync(backupFileName)
                }, 60 * 1000)
            }
        })

        archive.on('warning', (error) => {
            if (error.code === 'ENOENT') {
                console.warn(error)
                return
            }

            throw error
        })

        archive.on('error', (error) => {
            throw error
        })

        archive.pipe(output)
        archive.glob('**/*', {
            ignore: [
                'node_modules/**',
                'tmp/**',
                'temp/**',
                '.npm/**',
                'session/**',
                'sessions/**',
                '.git/**',
                '.pm2/**',
                backupFileName
            ]
        })

        await archive.finalize()
    }, {
        scheduled: true,
        timezone: 'Asia/Jakarta'
    })

    return backupTask
}

function resetLimit(conn) {
    if (resetLimitTask) return resetLimitTask

    resetLimitTask = cron.schedule('0 0 * * *', async () => {
        if (!global.setting.resetLimit) return

        const activeConn = getActiveConn(conn)
        if (!activeConn) return

        try {
            const data = global.db.data
            const users = Object.keys(data.users)
            const groups = Object.keys(data.chats).filter((jid) => jid.endsWith('@g.us'))
            const defaultLimit = global.limit || 10

            let resetCount = 0
            for (const userId of users) {
                if (data.users[userId].limit < 1) {
                    data.users[userId].limit = defaultLimit
                    resetCount++
                }
            }
            if (resetCount > 0) {
                global.markDbDirty?.()
            }

            for (const groupId of groups) {
                await activeConn.reply(
                    groupId,
                    await global.Func.style('Limit harian pengguna telah direset oleh sistem.', 1),
                    null
                ).catch(() => {})
                await delay(3000)
            }
        } catch (error) {
            console.error('[RESET LIMIT ERROR]', error)
        }
    }, {
        scheduled: true,
        timezone: 'Asia/Jakarta'
    })

    return resetLimitTask
}

function expiryNotifier(conn) {
    if (expiryTask) return expiryTask

    expiryTask = cron.schedule('15 * * * *', async () => {
        const activeConn = getActiveConn(conn)
        if (!activeConn || !global.db?.data) return

        const nowMs = Date.now()
        const data = global.db.data
        const users = data.users || {}
        const chats = data.chats || {}

        for (const [jid, user] of Object.entries(users)) {
            if (!user || typeof user !== 'object') continue

            if (!user.premium || ensureNumber(user.premiumTime, 0) <= 0) {
                user.premiumLastNoticeDay = 0
            } else {
                const timeLeft = ensureNumber(user.premiumTime, 0) - nowMs
                const daysLeft = Math.ceil(timeLeft / DAY_MS)

                if (daysLeft <= 0) {
                    user.premium = false
                    user.premiumTime = 0
                    user.premiumLastNoticeDay = 0
                    await activeConn.sendMessage(jid, {
                        text: 'Masa premium kamu sudah habis. Jika mau aktif lagi, silakan perpanjang premium.'
                    }).catch(() => {})
                } else if (EXPIRY_NOTICE_DAYS.includes(daysLeft) && user.premiumLastNoticeDay !== daysLeft) {
                    user.premiumLastNoticeDay = daysLeft
                    await activeConn.sendMessage(jid, {
                        text:
                            `Pengingat premium:\n` +
                            `Status premium kamu akan habis dalam ${daysLeft} hari.\n` +
                            `Sisa waktu: ${formatRemaining(timeLeft)}.`
                    }).catch(() => {})
                } else if (daysLeft > Math.max(...EXPIRY_NOTICE_DAYS) && user.premiumLastNoticeDay) {
                    user.premiumLastNoticeDay = 0
                }
            }

            if (!user.owner || ensureNumber(user.ownerTime, 0) <= 0) {
                user.ownerLastNoticeDay = 0
            } else {
                const timeLeft = ensureNumber(user.ownerTime, 0) - nowMs
                const daysLeft = Math.ceil(timeLeft / DAY_MS)

                if (daysLeft <= 0) {
                    user.owner = false
                    user.ownerTime = 0
                    user.ownerLastNoticeDay = 0
                    await activeConn.sendMessage(jid, {
                        text: 'Status owner sementara kamu sudah habis.'
                    }).catch(() => {})
                } else if (EXPIRY_NOTICE_DAYS.includes(daysLeft) && user.ownerLastNoticeDay !== daysLeft) {
                    user.ownerLastNoticeDay = daysLeft
                    await activeConn.sendMessage(jid, {
                        text:
                            `Pengingat owner:\n` +
                            `Status owner kamu akan habis dalam ${daysLeft} hari.\n` +
                            `Sisa waktu: ${formatRemaining(timeLeft)}.`
                    }).catch(() => {})
                } else if (daysLeft > Math.max(...EXPIRY_NOTICE_DAYS) && user.ownerLastNoticeDay) {
                    user.ownerLastNoticeDay = 0
                }
            }
        }

        for (const [jid, chat] of Object.entries(chats)) {
            if (!jid.endsWith('@g.us') || !chat || typeof chat !== 'object') continue

            const expiredAt = ensureNumber(chat.expired, 0)
            if (expiredAt <= 0) {
                chat.sewaLastNoticeDay = 0
                continue
            }

            const timeLeft = expiredAt - nowMs
            const daysLeft = Math.ceil(timeLeft / DAY_MS)

            if (daysLeft <= 0) {
                chat.sewaLastNoticeDay = 0
                await activeConn.sendMessage(jid, {
                    text: 'Masa aktif sewa grup ini sudah habis. Bot akan keluar otomatis.'
                }).catch(() => {})
                await activeConn.groupLeave(jid).catch(() => {})
                delete chats[jid]
                continue
            }

            if (EXPIRY_NOTICE_DAYS.includes(daysLeft) && chat.sewaLastNoticeDay !== daysLeft) {
                chat.sewaLastNoticeDay = daysLeft
                await activeConn.sendMessage(jid, {
                    text:
                        `Pengingat masa sewa grup:\n` +
                        `Bot akan keluar dalam ${daysLeft} hari lagi.\n` +
                        `Sisa waktu: ${formatRemaining(timeLeft)}.`
                }).catch(() => {})
            } else if (daysLeft > Math.max(...EXPIRY_NOTICE_DAYS) && chat.sewaLastNoticeDay) {
                chat.sewaLastNoticeDay = 0
            }
        }
        global.markDbDirty?.()
    }, {
        scheduled: true,
        timezone: 'Asia/Jakarta'
    })

    return expiryTask
}

async function automatic(conn) {
    backupScript(conn)
    resetLimit(conn)
    expiryNotifier(conn)

    if (!automaticInitialized) {
        automaticInitialized = true
        console.log('[AUTO] Scheduled jobs initialized once.')
    }
}

async function schedule(conn) {
    return groupSchedule(conn, jsonMessage)
}

export { automatic, schedule }
