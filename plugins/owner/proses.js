/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';

let handler = async (m, { conn, args }) => {
    let inv = args[0];
    if (!inv) return m.reply('Masukkan ID Invoice!');
    
    let trx = storeDB.getTransaction(inv);
    if (!trx) return m.reply('Transaksi tidak ditemukan!');
    
    storeDB.updateTransactionStatus(inv, 'process');
    
    m.reply(`┏━━━〔 ✅ STATUS DIPERBARUI 〕━⬣\n┃ ✦ Invoice : ${inv}\n┃ ✦ Status  : Diproses\n┗━━━━━━━━━━━━━━━━⬣`);
    
    let teksBuyer = `┏━━━〔 ⏳ PESANAN DIPROSES 〕━⬣\n┃\n┃ 🧾 Invoice : ${inv}\n┃ Pesanan Anda sedang diproses oleh admin...\n┃ Mohon ditunggu ya kak!\n┗━━━━━━━━━━━━━━━━⬣`;
    conn.sendMessage(trx.buyer_jid, { text: teksBuyer });
};
handler.help = ['proses'];
handler.command = ['proses', 'process'];
handler.tags = ['owner'];
handler.rowner = true;
export default handler;
