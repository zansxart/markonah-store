/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';
import { rp, formatDate, statusEmoji } from '../../lib/format.js';

let handler = async (m, { conn }) => {
    let history = storeDB.getUserTransactions(m.sender);
    
    if (!history || history.length === 0) {
        return m.reply(`❌ Anda belum memiliki riwayat transaksi.`);
    }
    
    let recent = history.slice(-10).reverse();
    
    let text = `┏━━━〔 📜 RIWAYAT TRANSAKSI 〕━⬣\n`;
    for (let trx of recent) {
        let product = storeDB.getProduct(trx.product_id);
        let productName = product ? product.name : (trx.product_name || trx.product_id);
        let emoji = typeof statusEmoji === 'function' ? statusEmoji(trx.status) : '';
        
        let dateObj = new Date(trx.created_at || trx.date);
        let dateStr = typeof formatDate === 'function' ? formatDate(dateObj) : dateObj.toLocaleDateString();
        
        text += `┃\n`;
        text += `┃ ✦ Invoice: ${trx.invoice_id}\n`;
        text += `┃ ✦ Produk: ${productName}\n`;
        text += `┃ ✦ Total: Rp ${rp(trx.total_price)}\n`;
        text += `┃ ✦ Status: ${emoji} ${trx.status.toUpperCase()}\n`;
        text += `┃ ✦ Tanggal: ${dateStr}\n`;
    }
    text += `┃\n┗━━━━━━━━━━━━━━━━⬣`;
    
    m.reply(text);
};

handler.help = ['riwayat'];
handler.command = ['riwayat', 'history', 'trx'];
handler.tags = ['store'];
export default handler;
