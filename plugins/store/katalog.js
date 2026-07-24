/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';
import { rp } from '../../lib/format.js';

let handler = async (m, { conn, args, usedPrefix }) => {
    let category = args[0] ? args[0].toLowerCase() : null;
    let products = category ? storeDB.getProductsByCategory(category) : storeDB.getAllProducts();
    
    if (products.length === 0) {
        return m.reply(`❌ Tidak ada produk${category ? ` di kategori *${category}*` : ''}.`);
    }
    
    let text = `┏━━━〔 🛒 KATALOG PRODUK 〕━⬣\n`;
    
    let currentCat = '';
    for (let p of products) {
        if (!category && currentCat !== p.category) {
            currentCat = p.category;
            text += `\n┃ 📦 *KATEGORI: ${currentCat.toUpperCase()}*\n`;
        }
        let stockCount = storeDB.getStockCount(p.id);
        let stockStatus = stockCount > 0 ? 'READY' : 'KOSONG';
        text += `┃ ✦ ID: ${p.id}\n┃ ✦ Nama: ${p.name}\n┃ ✦ Harga: Rp ${rp(p.price)}\n┃ ✦ Stok: ${stockStatus} (${stockCount})\n┃ ✦ Desc: ${p.description || '-'}\n┃\n`;
    }
    
    text += `┗━━━━━━━━━━━━━━━━⬣\n\n💡 Ketik *${usedPrefix}buy <id>* untuk membeli.`;
    
    m.reply(text);
};

handler.help = ['katalog', 'store', 'shop', 'produk', 'list'];
handler.command = ['katalog', 'store', 'shop', 'produk', 'list'];
handler.tags = ['store'];
export default handler;
