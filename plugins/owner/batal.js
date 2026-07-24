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
    
    storeDB.updateTransactionStatus(inv, 'cancel');
    
    let teksAdmin = `┏━━━〔 ❌ TRANSAKSI DIBATALKAN 〕━⬣\n┃ ✦ Invoice : ${inv}\n┃ ✦ Status  : Dibatalkan\n┃\n┃ ⚠️ Stok yang telah diambil tidak\n┃ dikembalikan otomatis.\n┗━━━━━━━━━━━━━━━━⬣`;
    m.reply(teksAdmin);
    
    let teksBuyer = `┏━━━〔 ❌ PESANAN DIBATALKAN 〕━⬣\n┃\n┃ 🧾 Invoice : ${inv}\n┃ Mohon maaf, pesanan Anda telah dibatalkan oleh admin.\n┃ Silakan hubungi admin untuk info lebih lanjut.\n┗━━━━━━━━━━━━━━━━⬣`;
    conn.sendMessage(trx.buyer_jid, { text: teksBuyer });
};
handler.help = ['batal'];
handler.command = ['batal', 'cancel', 'reject'];
handler.tags = ['owner'];
handler.rowner = true;
export default handler;
