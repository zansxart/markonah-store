/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
let handler = async (m, { conn, text }) => {
    if (!text) return m.reply('Masukkan string QRIS!');
    global.payment = global.payment || {};
    global.payment.qris = text;
    
    let partial = text.substring(0, 15) + '...';
    m.reply(`┏━━━〔 ✅ QRIS BERHASIL DISET 〕━⬣\n┃ ✦ String : ${partial}\n┗━━━━━━━━━━━━━━━━⬣`);
};
handler.help = ['setqris'];
handler.command = ['setqris'];
handler.tags = ['owner'];
handler.rowner = true;
export default handler;
