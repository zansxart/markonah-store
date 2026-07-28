/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';

let handler = async (m, { conn, args }) => {
    if (args[0]) {
        let id = args[0];
        let product = storeDB.getProduct(id);
        if (!product) return m.reply(`Produk tidak ditemukan!`);
        let stocks = product.stock || [];
        
        let teks = `\`DETAIL STOK PRODUK\`\n\n↳ *Produk:* ${product.name}\n↳ *Total Stok:* ${stocks.length}\n\n`;
        stocks.forEach((s, i) => {
            let censored = s.length > 5 ? s.substring(0, 3) + '***' + s.substring(s.length - 2) : '***';
            if (s.includes('@') && s.includes(':')) {
                let [email, pass] = s.split(':');
                let cEmail = email.substring(0, 2) + '***@' + (email.split('@')[1] || '');
                let cPass = pass ? pass.substring(0, 1) + '***' : '';
                censored = `${cEmail}:${cPass}`;
            }
            teks += `${i+1}. ${censored}\n`;
        });
        return m.reply(teks);
    }

    let products = storeDB.getAllProducts();
    let totalStock = 0;
    let teks = `\`DAFTAR STOK PRODUK\`\n\n`;
    for (let p of products) {
        let count = storeDB.getStockCount(p.id);
        totalStock += count;
        teks += `↳ 🏷️ *${p.name}* (\`${p.id}\`)\n  Stok: *${count}*\n\n`;
    }
    teks += `Total Produk: *${products.length}*  |  Total Stok: *${totalStock}*\n\n\n_Pantau ketersediaan stok produk store kamu di sini ya boss!_`;
    m.reply(teks);
};
handler.help = ['liststok'];
handler.command = ['liststok', 'ls', 'sisastok', 'stoksisa'];
handler.tags = ['owner'];
handler.rowner = true;
export default handler;
