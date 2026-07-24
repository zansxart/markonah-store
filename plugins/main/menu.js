/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';

let handler = async (m, { conn, usedPrefix }) => {
    let allProducts = storeDB.getAllProducts();
    let stockCounts = storeDB.getAllStockCounts();
    let totalStock = stockCounts.reduce((a, b) => a + b.count, 0);
    let stats = {
        products: allProducts.length,
        stock: totalStock,
        trx: storeDB.getAllTransactions().length
    };
    
    let botName = global.info?.botName || 'STORE BOT';
    let date = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    let time = new Date().toLocaleTimeString('id-ID');
    
    const readMore = String.fromCharCode(8206).repeat(4001);

    let menuText = `┏━━━〔 🏪 ${botName} 〕━⬣
┃ ✦ Date: ${date}
┃ ✦ Time: ${time}
┃
┃ ✦ Products: ${stats.products}
┃ ✦ Stock: ${stats.stock}
┃ ✦ Transactions: ${stats.trx}
┗━━━━━━━━━━━━━━━━⬣
${readMore}
┏━━━〔 🛒 STORE MENU 〕━⬣
┃ ◕ ${usedPrefix}katalog - Lihat semua produk
┃ ◕ ${usedPrefix}buy <id> - Beli produk
┃ ◕ ${usedPrefix}buy <id> <qty> - Beli beberapa
┃ ◕ ${usedPrefix}cektrx <invoice> - Cek status transaksi
┃ ◕ ${usedPrefix}riwayat - Riwayat transaksi
┃ ◕ ${usedPrefix}bataltrx - Batalkan transaksi
┗━━━━━━━━━━━━━━━━⬣

┏━━━〔 👑 OWNER MENU 〕━⬣
┃ ◕ ${usedPrefix}addproduk - Tambah produk
┃ ◕ ${usedPrefix}delproduk <id> - Hapus produk
┃ ◕ ${usedPrefix}editproduk - Edit produk
┃ ◕ ${usedPrefix}addstok <id> - Tambah stok
┃ ◕ ${usedPrefix}liststok - Lihat semua stok
┃ ◕ ${usedPrefix}proses <invoice> - Proses pesanan
┃ ◕ ${usedPrefix}done <invoice> - Selesaikan pesanan
┃ ◕ ${usedPrefix}kirim <invoice> - Kirim produk manual
┃ ◕ ${usedPrefix}batal <invoice> - Batalkan pesanan
┃ ◕ ${usedPrefix}setqris <data> - Set QRIS
┃ ◕ ${usedPrefix}setprefix <prefix> - Set prefix
┃ ◕ ${usedPrefix}broadcast <text> - Broadcast
┃ ◕ ${usedPrefix}rekap - Rekap transaksi
┗━━━━━━━━━━━━━━━━⬣

${global.info?.wm || 'Store Bot By zansxart'}`;

    let imageUrl = global.media?.thumbnail || 'https://telegra.ph/file/default.jpg';
    
    await conn.sendMessage(m.chat, {
        image: { url: imageUrl },
        caption: menuText
    }, { quoted: m });
};

handler.help = ['menu', 'help', 'start'];
handler.command = ['menu', 'help', 'start'];
handler.tags = ['main'];
export default handler;
