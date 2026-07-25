/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';
import { resolvePrefix, isNoPrefixMode } from '../../lib/prefix-util.js';

let handler = async (m, { conn, text, usedPrefix }) => {
    if (!text) {
        let current = storeDB.getSetting('prefix') || global.config?.prefix || '.';
        return m.reply(`*Format Penggunaan:*
👉 *${usedPrefix || '.'}setprefix .* (Satu karakter)
👉 *${usedPrefix || '.'}setprefix noprefix* (Tanpa prefix)
👉 *${usedPrefix || '.'}setprefix multi* (Multi prefix)

Prefix saat ini: *${current}*`);
    }

    const { mode, prefix, store } = resolvePrefix(text);

    // Simpan bentuk string yang aman ke SQLite agar permanen walau bot direstart
    storeDB.setSetting('prefix', store);

    // Update global config runtime — pakai nilai resolusi (regex untuk multi),
    // bukan string mentah, supaya handler nggak menganggapnya prefix literal.
    global.config = global.config || {};
    global.config.prefix = store;
    global.prefix = prefix;

    // Mode "tanpa prefix" dikontrol flag boolean per-bot, bukan lewat string prefix.
    const botJid = conn.user?.jid || conn.user?.id;
    if (botJid) {
        global.db.data.settings[botJid] = global.db.data.settings[botJid] || {};
        global.db.data.settings[botJid].noprefix = isNoPrefixMode(store);
        global.markDbDirty?.();
    }

    let displayPrefix = mode === 'noprefix' ? 'Tanpa Prefix (noprefix)' : mode === 'multi' ? 'Multi Prefix (., !, #, /, dll)' : `"${store}"`;

    let teks = `┏━━━〔 ✅ PREFIX DIUBAH 〕━⬣
┃ ✦ Prefix Baru : ${displayPrefix}
┃ ✦ Status      : Tersimpan Permanen (SQLite)
┗━━━━━━━━━━━━━━━━⬣`;

    m.reply(teks);
};

handler.help = ['setprefix <prefix>'];
handler.command = /^(setprefix|prefix)$/i;
handler.tags = ['owner'];
handler.rowner = true;

export default handler;

