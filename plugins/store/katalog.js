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
    
    let text = `🛍️ *KATALOG PRODUK STORE*\n_Daftar produk & stok otomatis_\n\n`;
    
    let currentCat = '';
    for (let p of products) {
        if (!category && currentCat !== p.category) {
            currentCat = p.category;
            text += `📁 *KATEGORI: ${currentCat.toUpperCase()}*\n`;
        }
        let stockCount = storeDB.getStockCount(p.id);
        let stockBadge = stockCount > 0 ? `✅ READY (${stockCount})` : `❌ KOSONG`;
        
        text += `╭── 📦 *${p.name}*\n`;
        text += `│ 🆔 Kode : \`${p.id}\`\n`;
        text += `│ 💰 Harga : *Rp ${rp(p.price)}*\n`;
        text += `│ 📊 Stok : ${stockBadge}\n`;
        if (p.description) text += `│ 📝 Ket : _${p.description}_\n`;
        text += `╰───────────────────\n\n`;
    }
    
    text += `💡 *Cara Beli:* Ketik \`${usedPrefix}buy <kode_produk>\`\n_Contoh:_ \`${usedPrefix}buy ${products[0]?.id || 'netflix'}\``;
    
    m.reply(text);
};

handler.help = ['katalog', 'store', 'shop', 'produk', 'list'];
handler.command = ['katalog', 'store', 'shop', 'produk', 'list'];
handler.tags = ['store'];
export default handler;
