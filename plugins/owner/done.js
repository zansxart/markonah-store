/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';
import { rp, usage, copyable, resolveInvoice } from '../../lib/format.js';
import { replyThumb, sendThumb } from '../../lib/ui.js';

let handler = async (m, { conn, args, usedPrefix, command }) => {
    let inv = resolveInvoice(m, args[0]);
    if (!inv) return m.reply(usage({
        prefix: usedPrefix, command,
        desc: 'Tandai transaksi selesai & kirim stok (bisa reply pesan invoice)',
        format: '<invoice>',
        examples: 'INV-K7P2',
        note: 'Atau cukup reply pesan bot yang memuat invoice, lalu ketik ' + (usedPrefix || '.') + command,
    }));

    let trx = storeDB.getTransaction(inv);
    if (!trx) return m.reply('Transaksi tidak ditemukan!');

    let product = storeDB.getProduct(trx.product_id);
    let stockDataStr = 'Silakan hubungi admin untuk detail pesanan.';

    if (product && storeDB.getStockCount(product.id) >= trx.qty) {
        let takenStock = storeDB.takeStock(product.id, trx.qty, trx.buyer_jid, inv);
        if (takenStock && takenStock.length > 0) {
            stockDataStr = takenStock.join('\n  ');
        }
    }

    storeDB.completeTransaction(inv, stockDataStr);

    await replyThumb(conn, m, `\`TRANSAKSI SELESAI\`\n\n↳ *Invoice:* ${copyable(inv)}\n↳ *Status:* Selesai`, 'done');

    let productName = product ? product.name : trx.product_id;
    let totalPrice = trx.total_price || 0;

    let teksBuyer = `\`PESANAN SELESAI\`\n\n` +
        `↳ *Invoice:* ${copyable(inv)}\n` +
        `↳ *Produk:* ${productName}\n` +
        `↳ *Total Harga:* Rp ${rp(totalPrice)}\n\n` +
        `*Data Akun / Produk:*\n${stockDataStr}\n\n\n` +
        `_Segera ganti password (jika akun). Terima kasih telah berbelanja!_`;
    await sendThumb(conn, trx.buyer_jid, teksBuyer, 'done');
};
handler.help = ['done'];
handler.command = ['done', 'selesai', 'complete'];
handler.tags = ['owner'];
handler.rowner = true;
export default handler;
