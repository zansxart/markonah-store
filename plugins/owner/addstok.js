/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';

let handler = async (m, { conn, text, usedPrefix, command }) => {
    let input = text || (m.quoted ? m.quoted.text : '');
    if (!input) return m.reply(`Format salah!\nContoh: ${usedPrefix + command} spotify1\nemail:pass\nemail2:pass2`);
    
    let lines = input.split('\n');
    let productId = lines[0].trim();
    let stockData = lines.slice(1).map(v => v.trim()).filter(v => v);

    if (!productId) return m.reply(`ID Produk harus diisi!`);
    if (stockData.length === 0) return m.reply(`Data stok kosong! Pastikan baris pertama ID, dan baris berikutnya data stok.`);

    let product = storeDB.getProduct(productId);
    if (!product) return m.reply(`Produk dengan ID '${productId}' tidak ditemukan!`);

    storeDB.addStock(productId, stockData);
    let newCount = storeDB.getStockCount(productId);

    let teks = `┏━━━〔 📦 STOK DITAMBAHKAN 〕━⬣
┃ ✦ Produk : ${product.name}
┃ ✦ Jumlah : +${stockData.length}
┃ ✦ Total  : ${newCount}
┗━━━━━━━━━━━━━━━━⬣`;
    m.reply(teks);
};
handler.help = ['addstok'];
handler.command = ['addstok', 'tambahstok', 'as'];
handler.tags = ['owner'];
handler.rowner = true;
export default handler;
