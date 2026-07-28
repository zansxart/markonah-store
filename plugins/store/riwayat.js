/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';
import { rp, formatDate, statusEmoji, copyable } from '../../lib/format.js';
import { getRandomIntro, getRandomFooter } from '../../lib/random-msg.js';

let handler = async (m, { conn }) => {
    let history = storeDB.getUserTransactions(m.sender);
    
    if (!history || history.length === 0) {
        return m.reply(`❌ Anda belum memiliki riwayat transaksi.`);
    }
    
    let recent = history.slice(-10).reverse();
    let intro = getRandomIntro('riwayat');
    let footer = getRandomFooter('riwayat');

    let text = `\`RIWAYAT TRANSAKSI BELANJA\`\n\n${intro}\n\n`;
    for (let trx of recent) {
        let product = storeDB.getProduct(trx.product_id);
        let productName = product ? product.name : (trx.product_name || trx.product_id);
        let emoji = typeof statusEmoji === 'function' ? statusEmoji(trx.status) : '';
        
        let dateObj = new Date(trx.created_at || trx.date);
        let dateStr = typeof formatDate === 'function' ? formatDate(dateObj) : dateObj.toLocaleDateString();
        
        text += `↳ 🛍️ *Invoice:* ${copyable(trx.invoice_id)}\n`;
        text += `  Produk: *${productName}*  |  Total: *Rp ${rp(trx.total_price)}*\n`;
        text += `  Status: ${emoji} ${trx.status.toUpperCase()} (${dateStr})\n\n`;
    }
    text += `\n\n${footer}`;
    
    m.reply(text);
};

handler.help = ['riwayat'];
handler.command = ['riwayat', 'history', 'trx'];
handler.tags = ['store'];
export default handler;
