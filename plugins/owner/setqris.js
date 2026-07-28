/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { usage } from '../../lib/format.js';

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) return m.reply(usage({
        prefix: usedPrefix, command,
        desc: 'Atur string QRIS statis untuk pembayaran',
        format: '<string_qris>',
        examples: '00020101021126...',
        note: 'Salin string QRIS statis dari GoPay Merchant / DANA Bisnis.',
    }));
    global.payment = global.payment || {};
    global.payment.qris = text;
    
    m.reply(`\`QRIS BERHASIL DISET\`\n\n↳ *String:* ${partial}\n↳ *Status:* Aktif`);
};
handler.help = ['setqris'];
handler.command = ['setqris'];
handler.tags = ['owner'];
handler.rowner = true;
export default handler;
