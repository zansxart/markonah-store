/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';

let handler = async (m, { conn, args }) => {
    if (!args[0]) return m.reply('Masukkan ID produk yang akan dihapus!');
    
    let id = args[0];
    let product = storeDB.getProduct(id);
    if (!product) return m.reply('Produk tidak ditemukan!');
    
    let name = product.name;
    storeDB.deleteProduct(id);
    
    m.reply(`┏━━━〔 🗑️ PRODUK DIHAPUS 〕━⬣\n┃ ✦ ID   : ${id}\n┃ ✦ Nama : ${name}\n┗━━━━━━━━━━━━━━━━⬣`);
};
handler.help = ['delproduk'];
handler.command = ['delproduk', 'hapusproduk', 'dp'];
handler.tags = ['owner'];
handler.rowner = true;
export default handler;
