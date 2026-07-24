/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';
import { rp } from '../../lib/format.js';

let handler = async (m, { conn, args, text }) => {
    let inv = args[0];
    let dataAkun = text.replace(inv, '').trim();
    if (m.quoted && m.quoted.text) {
        dataAkun = m.quoted.text;
    }
    
    if (!inv || !dataAkun) return m.reply('Masukkan ID Invoice dan Data Akun!\nContoh: .kirim INV-1234 email@gmail.com:pass');
    
    let trx = storeDB.getTransaction(inv);
    if (!trx) return m.reply('Transaksi tidak ditemukan!');
    
    storeDB.completeTransaction(inv, dataAkun);
    let product = storeDB.getProduct(trx.product_id);
    
    m.reply(`┏━━━〔 ✅ DATA DIKIRIM 〕━⬣\n┃ ✦ Invoice : ${inv}\n┃ ✦ Status  : Selesai\n┗━━━━━━━━━━━━━━━━⬣`);
    
    let productName = product ? product.name : (trx.product_name || trx.product_id);
    let totalPrice = trx.total_price || 0;
    
    let dataStr = dataAkun.split('\n').join('\n┃ ');
    
    let teksBuyer = `┏━━━〔 📦 PESANAN SELESAI 〕━⬣\n┃\n┃ 🧾 Invoice : ${inv}\n┃ 📦 Produk  : ${productName}\n┃ 💰 Total   : Rp ${rp(totalPrice)}\n┃\n┃ 📋 Data Akun:\n┃ ${dataStr}\n┃\n┃ ⚠️ Segera ganti password!\n┗━━━━━━━━━━━━━━━━⬣`;
    conn.sendMessage(trx.buyer_jid, { text: teksBuyer });
};
handler.help = ['kirim'];
handler.command = ['kirim', 'send', 'deliver'];
handler.tags = ['owner'];
handler.rowner = true;
export default handler;
