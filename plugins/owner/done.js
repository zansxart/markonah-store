/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';
import { rp, usage, copyable, resolveInvoice } from '../../lib/format.js';
import { sendThumb, sendStatusCard } from '../../lib/ui.js';

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

    // Order SMM diproses otomatis via `belisosmed` (langsung tembak provider).
    // `done` khusus produk manual/akun — kalau dipakai ke SMM cuma bikin pesan
    // "data akun" nyasar ke pembeli followers. Arahkan owner ke ceksosmed.
    if (trx.trx_type === 'smm') {
        return m.reply(`ℹ️ Invoice ${copyable(inv)} adalah pesanan *Jasa Sosmed*, tidak perlu di-*done* manual.\nOrder sudah otomatis dikirim ke provider. Cek progres pengerjaan dengan *${usedPrefix || '.'}ceksosmed ${trx.smm_order_id || '<order_id>'}*.`);
    }

    // Jangan proses ulang transaksi yang sudah selesai/batal.
    if (trx.status === 'done' || trx.status === 'cancel') {
        return m.reply(`❌ Invoice ${copyable(inv)} sudah berstatus *${trx.status}*.`);
    }

    let product = storeDB.getProduct(trx.product_id);
    let stockDataStr = 'Silakan hubungi admin untuk detail pesanan.';

    if (product && storeDB.getStockCount(product.id) >= trx.qty) {
        let takenStock = storeDB.takeStock(product.id, trx.qty, trx.buyer_jid, inv);
        if (takenStock && takenStock.length > 0) {
            stockDataStr = takenStock.join('\n  ');
        }
    }

    storeDB.completeTransaction(inv, stockDataStr);

    let productName = product ? product.name : trx.product_id;
    let totalPrice = trx.total_price || 0;

    // Konfirmasi singkat ke owner.
    await m.reply(`✅ Invoice ${copyable(inv)} *Selesai*. Data akun dikirim ke PC pembeli.`);

    // DATA AKUN → cuma PC pembeli (rahasia).
    let teksBuyer = `\`PESANAN SELESAI\`\n\n` +
        `↳ *Invoice:* ${copyable(inv)}\n` +
        `↳ *Produk:* ${productName}\n` +
        `↳ *Total Harga:* Rp ${rp(totalPrice)}\n\n` +
        `*Data Akun / Produk:*\n${stockDataStr}\n\n\n` +
        `_Segera ganti password (jika akun). Terima kasih telah berbelanja!_`;
    await sendThumb(conn, trx.buyer_jid, teksBuyer, 'done');

    // STATUS SELESAI → grup + tag pembeli (tanpa data akun).
    await sendStatusCard(conn, {
        title: 'PESANAN SELESAI',
        invoiceId: inv,
        buyerJid: trx.buyer_jid,
        productName,
        amount: totalPrice,
        status: 'done',
        chatJid: trx.chat_jid,
    }, 'done');
};
handler.help = ['done'];
handler.command = ['done', 'selesai', 'complete'];
handler.tags = ['owner'];
handler.rowner = true;
export default handler;
