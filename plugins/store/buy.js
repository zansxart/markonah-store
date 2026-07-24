/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';
import { rp, generateInvoiceId } from '../../lib/format.js';
import { createQRIS } from '../../lib/qris.js';
import QRCode from 'qrcode';

let handler = async (m, { conn, args, usedPrefix }) => {
    if (!args[0]) return m.reply(`Contoh: ${usedPrefix}buy <id> [qty]`);
    
    let productId = args[0];
    let qty = args[1] ? parseInt(args[1]) : 1;
    
    if (isNaN(qty) || qty < 1) return m.reply(`❌ Qty harus berupa angka minimal 1.`);
    
    let product = storeDB.getProduct(productId);
    if (!product) return m.reply(`❌ Produk dengan ID ${productId} tidak ditemukan.`);
    
    let stock = storeDB.getStockCount(productId);
    if (stock < qty) return m.reply(`❌ Stok tidak cukup. Sisa stok: ${stock}`);
    
    let total = product.price * qty;
    let invoiceId = generateInvoiceId();
    let qrisString = global.payment?.qris || '';
    
    if (!qrisString) return m.reply(`❌ QRIS belum diatur oleh Owner. Ketik ${usedPrefix}setqris untuk mengatur.`);
    
    storeDB.createTransaction(invoiceId, m.sender, productId, qty, total);
    let qrisPayload = createQRIS(qrisString, total);
    let qrisBuffer = await QRCode.toBuffer(qrisPayload);
    
    let text = `┏━━━〔 💳 PEMBAYARAN 〕━⬣
┃
┃ 📦 Produk  : ${product.name}
┃ 🔢 Qty     : ${qty}
┃ 💰 Total   : Rp ${rp(total)}
┃ 🧾 Invoice : ${invoiceId}
┃
┃ ⏰ Batas Bayar: 5 Menit
┃
┃ 📱 Scan QRIS di atas untuk
┃    membayar tepat Rp ${rp(total)}
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
                conn.sendMessage(m.chat, { text: `❌ Transaksi ${invoiceId} dibatalkan karena melebihi batas waktu (5 Menit).` });
            }
            delete conn.storeTrx[m.sender];
        }, 5 * 60 * 1000)
    };
    
    let ownerNum = (Array.isArray(global.owner) ? global.owner[0] : global.owner) + '@s.whatsapp.net';
    if (ownerNum) {
        let buyerName = m.sender.split('@')[0];
        conn.sendMessage(ownerNum, { 
            text: `🔔 *Pesanan Baru*\nInvoice: ${invoiceId}\nPembeli: @${buyerName}\nProduk: ${product.name}\nTotal: Rp ${rp(total)}\nStatus: Pending`, 
            mentions: [m.sender] 
        });
    }
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
    
    storeDB.updateTransactionStatus(invoiceId, 'paid');
    
    if (global.store?.autoSend) {
        let stock = storeDB.getStockCount(trx.product_id);
        if (stock >= trx.qty) {
            let items = storeDB.takeStock(trx.product_id, trx.qty, trx.buyer_jid, invoiceId);
            storeDB.completeTransaction(invoiceId, items);
            
            let resultText = `✅ *PEMBAYARAN DITERIMA*\nInvoice: ${invoiceId}\n\nBerikut adalah pesanan Anda:\n\n`;
            items.forEach((item, i) => {
                resultText += `${i + 1}. ${item}\n`;
            });
            resultText += `\nTerima kasih telah berbelanja!`;
            
            await conn.sendMessage(trx.buyer_jid, { text: resultText });
            return m.reply(`✅ Pesanan selesai dan stok dikirim ke pembeli.`);
        }
    }
    
    storeDB.updateTransactionStatus(invoiceId, 'process');
    await conn.sendMessage(trx.buyer_jid, { text: `✅ Pembayaran untuk invoice ${invoiceId} telah diterima.\nPesanan Anda sedang diproses.` });
    return m.reply(`✅ Pembayaran dikonfirmasi. Status: Process.\nStok kurang atau autoSend mati. Silakan kirim stok manual dengan:\n*${global.config?.prefix || '.'}done ${invoiceId}*`);
};

handler.help = ['buy <id>', 'buy <id> <qty>'];
handler.command = ['buy', 'beli', 'order'];
handler.tags = ['store'];
export default handler;
