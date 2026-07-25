/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import fs from 'fs';
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
    
    let botName = global.info?.nameBot || global.info?.botName || 'STOREKU';
    let date = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    let time = new Date().toLocaleTimeString('id-ID');
    
    const readMore = String.fromCharCode(8206).repeat(4001);

    let menuText = `⚡ *${botName.toUpperCase()}* ⚡
_Automatic Store Bot System_

Halo *@${m.sender.split('@')[0]}* 👋

╭─── 📊 *SYSTEM INFO*
│ 📅 Date : ${date}
│ ⏰ Time : ${time}
│ 📦 Total Produk : *${stats.products}*
│ 🔑 Total Stok : *${stats.stock}*
│ 💳 Transaksi : *${stats.trx}*
╰───────────────────
${readMore}
╭─── 🛒 *CUSTOMER MENU*
│ › \`${usedPrefix}katalog\` ── Katalog Produk
│ › \`${usedPrefix}buy <id>\` ── Beli Produk
│ › \`${usedPrefix}cektrx <invoice>\` ── Cek Status Order
│ › \`${usedPrefix}riwayat\` ── Riwayat Belanja
│ › \`${usedPrefix}bataltrx\` ── Batalkan Transaksi
╰───────────────────

╭─── 👑 *ADMIN & OWNER*
│ › \`${usedPrefix}addproduk\` ── Tambah Produk
│ › \`${usedPrefix}delproduk <id>\` ── Hapus Produk
│ › \`${usedPrefix}addstok <id>\` ── Isi Stok Produk
│ › \`${usedPrefix}liststok\` ── Cek Stok Akun
│ › \`${usedPrefix}proses <invoice>\` ── Proses Pesanan
│ › \`${usedPrefix}done <invoice>\` ── Selesai & Kirim
│ › \`${usedPrefix}kirim <invoice>\` ── Kirim Manual
│ › \`${usedPrefix}batal <invoice>\` ── Batal Pesanan
│ › \`${usedPrefix}setqris <data>\` ── Update QRIS
│ › \`${usedPrefix}setprefix <prefix>\` ── Ubah Prefix
│ › \`${usedPrefix}rekap\` ── Rekap Omset
╰───────────────────

_© storeku by zansxart_
_Instagram: https://instagram.com/zansxart_`;

    let imageUrl = global.media?.thumbnail || './assets/thumbnail.jpg';
    let imageSource = (typeof imageUrl === 'string' && fs.existsSync(imageUrl))
        ? fs.readFileSync(imageUrl)
        : { url: imageUrl };
    
    await conn.sendMessage(m.chat, {
        image: imageSource,
        caption: menuText,
        mentions: [m.sender]
    }, { quoted: m });
};

handler.help = ['menu', 'help', 'start'];
handler.command = ['menu', 'help', 'start'];
handler.tags = ['main'];
export default handler;
