/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';
import { rp, usage, copyable } from '../../lib/format.js';

let handler = async (m, { conn, args, usedPrefix, command }) => {
    let inv = args[0];
    if (!inv) return m.reply(usage({
        prefix: usedPrefix, command,
        desc: 'Tandai transaksi selesai & kirim stok ke pembeli',
        format: '<invoice>',
        examples: 'INV-A3F2K9',
    }));

    let trx = storeDB.getTransaction(inv);
    if (!trx) return m.reply('Transaksi tidak ditemukan!');

    let product = storeDB.getProduct(trx.product_id);
    let stockDataStr = 'Silakan hubungi admin untuk detail pesanan.';

    if (product && storeDB.getStockCount(product.id) >= trx.qty) {
        let takenStock = storeDB.takeStock(product.id, trx.qty, trx.buyer_jid, inv);
        if (takenStock && takenStock.length > 0) {
            stockDataStr = takenStock.join('\n┃ ');
        }
    }

    storeDB.completeTransaction(inv, stockDataStr);

    m.reply(`┏━━━〔 ✅ TRANSAKSI SELESAI 〕━⬣\n┃ ✦ Invoice : ${copyable(inv)}\n┃ ✦ Status  : Selesai\n┗━━━━━━━━━━━━━━━━⬣`);

    let productName = product ? product.name : trx.product_id;
    let totalPrice = trx.total_price || 0;

    let teksBuyer = `┏━━━〔 📦 PESANAN SELESAI 〕━⬣\n┃\n┃ 🧾 Invoice : ${copyable(inv)}\n┃ 📦 Produk  : ${productName}\n┃ 💰 Total   : Rp ${rp(totalPrice)}\n┃\n┃ 📋 Data Akun:\n┃ ${stockDataStr}\n┃\n┃ ⚠️ Segera ganti password!\n┗━━━━━━━━━━━━━━━━⬣`;
    conn.sendMessage(trx.buyer_jid, { text: teksBuyer });
};
handler.help = ['done'];
handler.command = ['done', 'selesai', 'complete'];
handler.tags = ['owner'];
handler.rowner = true;
export default handler;
