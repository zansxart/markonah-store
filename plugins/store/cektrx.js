/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';
import { rp, formatDate, formatTime, statusEmoji, usage, copyable } from '../../lib/format.js';
import { replyThumb } from '../../lib/ui.js';
import { getRandomIntro, getRandomFooter } from '../../lib/random-msg.js';

let handler = async (m, { conn, args, usedPrefix, command }) => {
    if (!args[0]) return m.reply(usage({
        prefix: usedPrefix, command,
        desc: 'Cek status & detail sebuah transaksi',
        format: '<invoice>',
        examples: 'INV-A3F2K9',
    }));

    let invoiceId = args[0].toUpperCase();
    let trx = storeDB.getTransaction(invoiceId);
    
    if (!trx) return m.reply(`❌ Transaksi dengan invoice ${invoiceId} tidak ditemukan.`);
    
    let product = storeDB.getProduct(trx.product_id);
    let productName = product ? product.name : (trx.product_name || trx.product_id);
    let emoji = typeof statusEmoji === 'function' ? statusEmoji(trx.status) : '';
    
    let dateObj = new Date(trx.created_at || trx.date);
    let dateStr = typeof formatDate === 'function' ? formatDate(dateObj) : dateObj.toLocaleDateString();
    let timeStr = typeof formatTime === 'function' ? formatTime(dateObj) : dateObj.toLocaleTimeString();
    
    let intro = getRandomIntro('cektrx');
    let footer = getRandomFooter('cektrx');

    let text = `\`DETAIL TRANSAKSI INVOICE\`\n\n${intro}\n\n` +
        `↳ 🧾 *Invoice:* ${copyable(trx.invoice_id)}\n` +
        `↳ 👤 *Pembeli:* @${trx.buyer_jid.split('@')[0]}\n` +
        `↳ 📦 *Produk:* ${productName}\n` +
        `↳ 🔢 *Jumlah:* ${trx.qty}\n` +
        `↳ 💰 *Total Harga:* Rp ${rp(trx.total_price)}\n` +
        `↳ 📊 *Status:* ${emoji} ${trx.status.toUpperCase()}\n` +
        `↳ 🕒 *Waktu:* ${dateStr} ${timeStr}\n\n\n` +
        `${footer}`;
    
    await replyThumb(conn, m, text, 'invoice', { mentions: [trx.buyer_jid] });
};

handler.help = ['cektrx <invoice>'];
handler.command = ['cektrx', 'cekinvoice', 'invoice'];
handler.tags = ['store'];
export default handler;
