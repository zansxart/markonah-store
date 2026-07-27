/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';
import { rp, generateInvoiceId, usage, copyable } from '../../lib/format.js';
import { createQRIS } from '../../lib/qris.js';
import { settlePaid } from '../../lib/settle.js';
import { notifyNewOrder } from '../../lib/store-notify.js';
import QRCode from 'qrcode';

/**
 * Cari nominal unik (harga + kode receh 1-99) yang belum dipakai transaksi
 * lain. Termasuk yang baru cancel: notif pembayaran QRIS bisa telat berjam-
 * jam (lintas e-wallet lewat switching), jadi selama window telat masih
 * aktif nominalnya tidak boleh kepakai ulang — kalau tidak, pembayaran telat
 * bakal nyocok ke invoice yang salah.
 */
function generateUniqueAmount(baseTotal) {
    for (let receh = 1; receh <= 99; receh++) {
        const candidate = baseTotal + receh;
        if (!storeDB.isAmountInUse(candidate)) return candidate;
    }
    // Fallback (99 pending nominal sama secara bersamaan — praktis mustahil).
    return baseTotal + Math.floor(Math.random() * 99) + 1;
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
    if (!args[0]) return m.reply(usage({
        prefix: usedPrefix, command,
        desc: 'Beli produk dari katalog',
        format: '<id> [qty]',
        examples: ['spotify1', 'spotify1 2'],
        note: 'Lihat daftar produk & ID-nya dengan ' + (usedPrefix || '.') + 'katalog',
    }));

    let productId = args[0];
    let qty = args[1] ? parseInt(args[1]) : 1;

    if (isNaN(qty) || qty < 1) return m.reply(`❌ Qty harus berupa angka minimal 1. Contoh: ${(usedPrefix || '.')}${command} ${productId} 2`);
    
    let product = storeDB.getProduct(productId);
    if (!product) return m.reply(`❌ Produk dengan ID ${productId} tidak ditemukan.`);
    
    let stock = storeDB.getStockCount(productId);
    if (stock < qty) return m.reply(`❌ Stok tidak cukup. Sisa stok: ${stock}`);
    
    let subtotal = product.price * qty;
    let invoiceId = generateInvoiceId();
    let qrisString = global.payment?.qris || '';

    if (!qrisString) return m.reply(`❌ QRIS belum diatur oleh Owner. Ketik ${usedPrefix}setqris untuk mengatur.`);

    // Nominal unik (harga + kode receh) → dipakai untuk QRIS, tagihan, & matcher webhook.
    let total = generateUniqueAmount(subtotal);
    let recehNote = total - subtotal;

    // chat_jid: chat asal transaksi, dipakai buat balikin notif ke grup yang sama.
    storeDB.createTransaction(invoiceId, m.sender, productId, qty, total, 'qris', total, m.chat);
    let qrisPayload = createQRIS(qrisString, total);
    let qrisBuffer = await QRCode.toBuffer(qrisPayload);

    let text = `┏━━━〔 💳 PEMBAYARAN 〕━⬣
┃
┃ 📦 Produk  : ${product.name}
┃ 🔢 Qty     : ${qty}
┃ 💰 Total   : Rp ${rp(total)}
┃ 🧾 Invoice : ${copyable(invoiceId)}
┃
┃ ⚠️ Bayar *TEPAT* Rp ${rp(total)}
┃    (termasuk kode unik ${recehNote})
┃    biar terverifikasi otomatis.
┃
┃ ⏰ Batas Bayar: 5 Menit
┃
┃ 📱 Scan QRIS di atas untuk membayar
┃
┗━━━━━━━━━━━━━━━━⬣`;

    await conn.sendMessage(m.chat, {
        image: qrisBuffer,
        caption: text
    }, { quoted: m });
    
    conn.storeTrx = conn.storeTrx || {};
    conn.storeTrx[m.sender] = {
        invoiceId,
        timer: setTimeout(() => {
            let trx = storeDB.getTransaction(invoiceId);
            if (trx && trx.status === 'pending') {
                storeDB.updateTransactionStatus(invoiceId, 'cancel');
                conn.sendMessage(m.chat, { text: `❌ Transaksi ${copyable(invoiceId)} dibatalkan karena melebihi batas waktu (5 Menit).` });
            }
            delete conn.storeTrx[m.sender];
        }, 5 * 60 * 1000)
    };
    
    notifyNewOrder(conn, {
        invoiceId,
        buyerJid: m.sender,
        productName: product.name,
        total,
        chatJid: m.chat,
    });
};

handler.before = async (m, { conn, isOwner }) => {
    if (!isOwner) return;
    
    let text = m.text?.toLowerCase();
    if (text !== 'confirm' && text !== 'acc') return;
    
    if (!m.quoted) return;
    
    let quotedText = m.quoted.text || m.quoted.caption || '';
    let match = quotedText.match(/Invoice\s*:\s*(INV-\w+)/i);
    if (!match) return;
    
    let invoiceId = match[1];
    let trx = storeDB.getTransaction(invoiceId);

    if (!trx) return m.reply(`❌ Transaksi tidak ditemukan.`);
    if (trx.status !== 'pending' && trx.status !== 'process') return m.reply(`❌ Transaksi sudah selesai atau dibatalkan.`);

    let res = await settlePaid(conn, invoiceId, { source: 'manual' });

    if (!res.ok) {
        if (res.reason === 'already_settled') return m.reply(`❌ Transaksi sudah selesai atau dibatalkan.`);
        return m.reply(`❌ Transaksi tidak ditemukan.`);
    }
    if (res.status === 'done') {
        return m.reply(`✅ Pesanan selesai dan stok dikirim ke pembeli.`);
    }
    const prefix = global.config?.prefix || '.';
    await m.reply(`✅ Pembayaran dikonfirmasi. Status: Process.\nStok kurang atau autoSend mati. Silakan kirim stok manual dengan command di bawah (long-press → Copy):`);
    return conn.sendMessage(m.chat, { text: copyable(`${prefix}done ${invoiceId}`) }, { quoted: m });
};

handler.help = ['buy <id>', 'buy <id> <qty>'];
handler.command = ['buy', 'beli', 'order'];
handler.tags = ['store'];
export default handler;
