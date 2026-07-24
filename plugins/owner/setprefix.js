/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
let handler = async (m, { conn, text }) => {
    if (!text) return m.reply('Masukkan prefix baru!');
    
    global.config = global.config || {};
    
    if (text.toLowerCase() === 'noprefix') {
        global.prefix = '';
    } else if (text.toLowerCase() === 'multi') {
        global.prefix = /^[°•π÷×¶∆£¢€¥®™+✓_=|~!?@#$%^&.©^]/i;
    } else {
        global.prefix = new RegExp('^[' + text.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&') + ']');
    }
    
    global.config.prefix = text;
    m.reply(`┏━━━〔 ✅ PREFIX DISET 〕━⬣\n┃ ✦ Prefix : ${text}\n┗━━━━━━━━━━━━━━━━⬣`);
};
handler.help = ['setprefix'];
handler.command = /^(setprefix|prefix)$/i;
handler.tags = ['owner'];
handler.rowner = true;
export default handler;
