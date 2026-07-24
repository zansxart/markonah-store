/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';
import { rp, formatDate, formatTime, statusEmoji } from '../../lib/format.js';

let handler = async (m, { conn, args, usedPrefix }) => {
    if (!args[0]) return m.reply(`Contoh: ${usedPrefix}cektrx <invoice_id>`);
    
    let invoiceId = args[0].toUpperCase();
    let trx = storeDB.getTransaction(invoiceId);
    
    if (!trx) return m.reply(`❌ Transaksi dengan invoice ${invoiceId} tidak ditemukan.`);
    
    let product = storeDB.getProduct(trx.product_id);
    let productName = product ? product.name : (trx.product_name || trx.product_id);
    let emoji = typeof statusEmoji === 'function' ? statusEmoji(trx.status) : '';
    
    let dateObj = new Date(trx.created_at || trx.date);
    let dateStr = typeof formatDate === 'function' ? formatDate(dateObj) : dateObj.toLocaleDateString();
    let timeStr = typeof formatTime === 'function' ? formatTime(dateObj) : dateObj.toLocaleTimeString();
    
    let text = `┏━━━〔 🧾 DETAIL TRANSAKSI 〕━⬣
┃ ✦ Invoice: ${trx.invoice_id}
┃ ✦ Pembeli: @${trx.buyer_jid.split('@')[0]}
┃ ✦ Produk: ${productName}
┃ ✦ Qty: ${trx.qty}
┃ ✦ Total: Rp ${rp(trx.total_price)}
┃ ✦ Status: ${emoji} ${trx.status.toUpperCase()}
┃ ✦ Tanggal: ${dateStr}
┃ ✦ Waktu: ${timeStr}
┗━━━━━━━━━━━━━━━━⬣`;
    
    await conn.sendMessage(m.chat, { text, mentions: [trx.buyer_jid] }, { quoted: m });
};

handler.help = ['cektrx <invoice>'];
handler.command = ['cektrx', 'cekinvoice', 'invoice'];
handler.tags = ['store'];
export default handler;
