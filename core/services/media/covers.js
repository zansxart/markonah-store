import fs from 'fs'
import path from 'path'
import fetch from 'node-fetch'

const ROOT_DIR = path.resolve('./')
const COVER_DIR = path.join(ROOT_DIR, 'storage', 'cache', 'covers')

const IMAGE_TYPES = new Set(['jpg', 'jpeg', 'png', 'webp', 'image', 'img'])
const GIF_TYPES = new Set(['gif', 'video', 'mp4'])

const DEFAULT_REMOTE_COVERS = {
    menu: {
        image: () => global.media?.thumbnail || null,
        gif: () => global.media?.gif || null
    },
    welcome: () => global.media?.welcome || 'https://files.catbox.moe/opmcq5.mp4',
    bye: () => global.media?.bye || 'https://files.catbox.moe/9lxi6y.mp4'
}

function ensureDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true })
}

function toRelativePath(filePath) {
    return path.relative(ROOT_DIR, filePath).replace(/\\/g, '/')
}

function toAbsolutePath(filePath) {
    if (!filePath) return null
    return path.isAbsolute(filePath) ? filePath : path.join(ROOT_DIR, filePath.replace(/\//g, path.sep))
}

function detectKindFromExtension(extension) {
    const ext = String(extension || '').replace('.', '').toLowerCase()
    return ['mp4', 'gif', 'webm', 'mkv', 'mov'].includes(ext) ? 'gif' : 'image'
}

function detectKindFromPath(filePath) {
    return detectKindFromExtension(path.extname(filePath))
}

function getExtFromMime(mimetype, kind) {
    const mime = String(mimetype || '').toLowerCase()
    if (kind === 'gif') return 'mp4'
    if (mime.includes('png')) return 'png'
    if (mime.includes('webp')) return 'webp'
    return 'jpg'
}

function getExtFromUrl(url, kind) {
    try {
        const ext = path.extname(new URL(url).pathname).replace('.', '').toLowerCase()
        if (kind === 'gif') return ext || 'mp4'
        if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return ext
    } catch { }
    return kind === 'gif' ? 'mp4' : 'jpg'
}

function buildCachePath(target, kind, ext, isDefault = false) {
    const suffix = target === 'menu' ? `menu-${kind}` : target
    const filename = `${isDefault ? 'default-' : ''}${suffix}.${ext}`
    return toRelativePath(path.join(COVER_DIR, filename))
}

function listCustomFiles(target, kind = null) {
    if (!fs.existsSync(COVER_DIR)) return []

    const normalizedKind = normalizeCoverKind(kind)
    const prefixes = target === 'menu'
        ? (normalizedKind ? [`menu-${normalizedKind}`] : ['menu-image', 'menu-gif'])
        : [target]

    return fs.readdirSync(COVER_DIR)
        .filter(file => !file.startsWith('default-'))
        .filter(file => prefixes.some(prefix => file.startsWith(`${prefix}.`)))
        .map(file => path.join(COVER_DIR, file))
}

function findDiskEntry(target, kind = null) {
    const normalizedKind = normalizeCoverKind(kind)
    const candidates = listCustomFiles(target, normalizedKind)
        .map(absolutePath => {
            const stat = fs.statSync(absolutePath)
            return {
                type: detectKindFromPath(absolutePath),
                source: 'file',
                path: toRelativePath(absolutePath),
                updatedAt: stat.mtimeMs
            }
        })
        .filter(entry => !normalizedKind || entry.type === normalizedKind)
        .sort((a, b) => b.updatedAt - a.updatedAt)

    return candidates[0] || null
}

function getDefaultEntry(target, kind = null) {
    if (target === 'menu') {
        const slot = normalizeCoverKind(kind) || 'image'
        return {
            type: slot,
            source: 'url',
            url: DEFAULT_REMOTE_COVERS.menu[slot](),
            path: buildCachePath(target, slot, slot === 'gif' ? 'mp4' : 'jpg', true)
        }
    }

    const url = target === 'welcome' ? DEFAULT_REMOTE_COVERS.welcome() : DEFAULT_REMOTE_COVERS.bye()
    return {
        type: 'gif',
        source: 'url',
        url,
        path: buildCachePath(target, 'gif', 'mp4', true)
    }
}

async function downloadBuffer(url) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Failed to fetch media: ${response.status}`)
    return Buffer.from(await response.arrayBuffer())
}

async function loadEntry(entry) {
    if (!entry) return { buffer: null, url: null, type: 'image', ready: false }

    const filePath = toAbsolutePath(entry.path)
    const result = {
        buffer: null,
        url: entry.url || null,
        type: normalizeCoverKind(entry.type) || 'image',
        path: entry.path || null,
        ready: false
    }

    if (filePath && fs.existsSync(filePath)) {
        result.buffer = fs.readFileSync(filePath)
        result.ready = true
        return result
    }

    if (!entry.url) return result

    try {
        const buffer = await downloadBuffer(entry.url)
        if (filePath) {
            ensureDirectory(path.dirname(filePath))
            fs.writeFileSync(filePath, buffer)
        }
        result.buffer = buffer
        result.ready = true
    } catch { }

    return result
}

function removeStaleFile(entry, keepPath) {
    const oldPath = toAbsolutePath(entry?.path)
    const nextPath = toAbsolutePath(keepPath)
    if (!oldPath || oldPath === nextPath || !fs.existsSync(oldPath)) return
    try {
        fs.unlinkSync(oldPath)
    } catch { }
}

function removeMatchingFiles(target, kind = null, keepPath = null) {
    const keepAbsolutePath = toAbsolutePath(keepPath)
    for (const absolutePath of listCustomFiles(target, kind)) {
        if (keepAbsolutePath && absolutePath === keepAbsolutePath) continue
        try {
            fs.unlinkSync(absolutePath)
        } catch { }
    }
}

function getSettingBucket(conn) {
    const settingKey = conn?.user?.jid
    if (!settingKey) return {}
    global.db.data.settings[settingKey] = global.db.data.settings[settingKey] || {}
    const settings = global.db.data.settings[settingKey]
    ensureCoverSettings(settings)
    return settings.covers
}

function getCustomEntry(covers, target, kind = null) {
    if (target === 'menu') {
        const slot = normalizeCoverKind(kind) || 'image'
        return covers.menu?.[slot] || null
    }
    return covers[target] || null
}

function setCustomEntry(covers, target, kind, entry) {
    if (target === 'menu') {
        const slot = normalizeCoverKind(kind) || 'image'
        covers.menu[slot] = entry
        return
    }
    covers[target] = entry
}

export function normalizeCoverKind(value) {
    const type = String(value || '').toLowerCase()
    if (IMAGE_TYPES.has(type)) return 'image'
    if (GIF_TYPES.has(type)) return 'gif'
    return null
}

export function ensureCoverSettings(settings) {
    if (!settings.covers || typeof settings.covers !== 'object') settings.covers = {}
    if (!settings.covers.menu || typeof settings.covers.menu !== 'object') settings.covers.menu = {}
    if (!settings.covers.welcome || typeof settings.covers.welcome !== 'object') settings.covers.welcome = {}
    if (!settings.covers.bye || typeof settings.covers.bye !== 'object') settings.covers.bye = {}
    return settings.covers
}

export async function resolveCover(conn, target, kind = null) {
    const covers = getSettingBucket(conn)
    const customEntry = getCustomEntry(covers, target, kind)
    const customResult = customEntry ? await loadEntry(customEntry) : null
    if (customResult?.ready) return customResult

    const diskEntry = findDiskEntry(target, kind)
    const diskResult = diskEntry ? await loadEntry(diskEntry) : null
    if (diskResult?.ready) return diskResult

    const defaultResult = await loadEntry(getDefaultEntry(target, kind))
    if (defaultResult.ready) return defaultResult

    return defaultResult.url ? defaultResult : (customResult || defaultResult)
}

export function applyThumbnail(externalAdReply, cover) {
    if (!externalAdReply || !cover) return
    if (cover.buffer) {
        externalAdReply.thumbnail = cover.buffer
        return
    }
    if (cover.url) externalAdReply.thumbnailUrl = cover.url
}

export function buildCoverMessage(cover, caption, mentions = []) {
    if (!cover || (!cover.buffer && !cover.url)) return { text: caption, mentions }

    if (cover.type === 'gif') {
        return {
            video: cover.buffer ? cover.buffer : { url: cover.url },
            gifPlayback: true,
            caption,
            mentions
        }
    }

    return {
        image: cover.buffer ? cover.buffer : { url: cover.url },
        caption,
        mentions
    }
}

export async function saveCoverFromBuffer(conn, target, kind, buffer, mimetype = '') {
    const covers = getSettingBucket(conn)
    const normalizedKind = normalizeCoverKind(kind)
    const extension = getExtFromMime(mimetype, normalizedKind)
    const relativePath = buildCachePath(target, normalizedKind, extension, false)
    const absolutePath = toAbsolutePath(relativePath)
    const previousEntry = getCustomEntry(covers, target, normalizedKind)

    ensureDirectory(path.dirname(absolutePath))
    fs.writeFileSync(absolutePath, buffer)
    removeMatchingFiles(target, target === 'menu' ? normalizedKind : null, relativePath)
    removeStaleFile(previousEntry, relativePath)

    const nextEntry = {
        type: normalizedKind,
        source: 'file',
        path: relativePath,
        mimetype,
        updatedAt: Date.now()
    }

    setCustomEntry(covers, target, normalizedKind, nextEntry)
    await global.safeDbWrite?.('covers-file').catch(() => {})
    return nextEntry
}

export async function saveCoverFromUrl(conn, target, kind, url) {
    const covers = getSettingBucket(conn)
    const normalizedKind = normalizeCoverKind(kind)
    const extension = getExtFromUrl(url, normalizedKind)
    const relativePath = buildCachePath(target, normalizedKind, extension, false)
    const absolutePath = toAbsolutePath(relativePath)
    const previousEntry = getCustomEntry(covers, target, normalizedKind)

    let cached = false
    try {
        const buffer = await downloadBuffer(url)
        ensureDirectory(path.dirname(absolutePath))
        fs.writeFileSync(absolutePath, buffer)
        removeMatchingFiles(target, target === 'menu' ? normalizedKind : null, relativePath)
        cached = true
    } catch { }

    removeStaleFile(previousEntry, relativePath)

    const nextEntry = {
        type: normalizedKind,
        source: cached ? 'file' : 'url',
        path: relativePath,
        url,
        updatedAt: Date.now()
    }

    setCustomEntry(covers, target, normalizedKind, nextEntry)
    await global.safeDbWrite?.('covers-url').catch(() => {})
    return { entry: nextEntry, cached }
}

export async function resetCover(conn, target, kind = null) {
    const covers = getSettingBucket(conn)
    const normalizedKind = normalizeCoverKind(kind)

    if (target === 'menu') {
        if (normalizedKind) {
            delete covers.menu?.[normalizedKind]
            removeMatchingFiles(target, normalizedKind)
        } else {
            covers.menu = {}
            removeMatchingFiles(target, null)
        }
    } else {
        covers[target] = {}
        removeMatchingFiles(target, null)
    }

    await global.safeDbWrite?.('covers-reset').catch(() => {})
    return true
}
