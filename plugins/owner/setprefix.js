/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';

let handler = async (m, { conn, text, usedPrefix }) => {
    if (!text) {
        let current = storeDB.getSetting('prefix') || global.config?.prefix || '.';
        return m.reply(`*Format Penggunaan:*
👉 *${usedPrefix || '.'}setprefix .* (Satu karakter)
👉 *${usedPrefix || '.'}setprefix noprefix* (Tanpa prefix)
👉 *${usedPrefix || '.'}setprefix multi* (Multi prefix)

Prefix saat ini: *${current}*`);
    }

    let newPrefix = text.trim();
    
    // Simpan ke SQLite database agar permanen walau bot dirstart
    storeDB.setSetting('prefix', newPrefix);
    
    // Update global config runtime
    global.config = global.config || {};
    global.config.prefix = newPrefix;
    global.prefix = newPrefix;

    let displayPrefix = newPrefix === 'noprefix' ? 'Tanpa Prefix (noprefix)' : newPrefix === 'multi' ? 'Multi Prefix (., !, #, /, dll)' : `"${newPrefix}"`;

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

