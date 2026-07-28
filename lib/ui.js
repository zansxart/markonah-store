/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 *
 * Helper UI: balas pesan dengan thumbnail (image + caption) biar tampilan rapi.
 * Thumbnail diambil dari global.thumb[key] per-aksi, fallback ke global.media.thumbnail.
 * Kalau file-nya tidak ada, otomatis fallback ke teks biasa.
 */
import fs from 'fs';

/**
 * Resolve sumber gambar thumbnail.
 * @param {string} [key] kunci dari global.thumb (mis. 'done', 'proses', 'katalog')
 */
function resolveThumb(key) {
    const src = (key && global.thumb?.[key]) || global.media?.thumbnail || global.media?.logo || '';
    if (!src) return null;
    if (typeof src === 'string' && fs.existsSync(src)) {
        try { return fs.readFileSync(src); } catch { return null; }
    }
    if (typeof src === 'string' && /^https?:\/\//i.test(src)) return { url: src };
    return null;
}

/**
 * Balas pesan dengan thumbnail + caption. Fallback ke m.reply teks biasa.
 * @param {object} conn
 * @param {object} m
 * @param {string} text
 * @param {string} [key]    kunci thumbnail (mis. 'done', 'katalog')
 * @param {object} [options]
 */
export async function replyThumb(conn, m, text, key, options = {}) {
    // Support lama: replyThumb(conn, m, text, options) tanpa key
    if (key && typeof key === 'object') { options = key; key = null; }
    const image = resolveThumb(key);
    if (!image) return m.reply(text, null, options);
    return conn.sendMessage(m.chat, { image, caption: text, ...options }, { quoted: m });
}

/**
 * Kirim thumbnail + caption ke JID tertentu (bukan reply).
 * @param {object} conn
 * @param {string} jid
 * @param {string} text
 * @param {string} [key]    kunci thumbnail
 * @param {object} [options]
 */
export async function sendThumb(conn, jid, text, key, options = {}) {
    // Support lama: sendThumb(conn, jid, text, options) tanpa key
    if (key && typeof key === 'object') { options = key; key = null; }
    const image = resolveThumb(key);
    if (!image) return conn.sendMessage(jid, { text, ...options });
    return conn.sendMessage(jid, { image, caption: text, ...options });
}
