/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import fs from 'fs';
import { storeDB } from '../../lib/store-db.js';
import { getRandomIntro, getRandomFooter } from '../../lib/random-msg.js';

let handler = async (m, { conn, usedPrefix, isOwner }) => {
    let allProducts = storeDB.getAllProducts();
    let stockCounts = storeDB.getAllStockCounts();
    let totalStock = stockCounts.reduce((a, b) => a + b.count, 0);
    let stats = {
        products: allProducts.length,
        stock: totalStock,
        trx: storeDB.getAllTransactions().length
    };
    
    let botName = global.info?.nameBot || global.info?.botName || 'MARKONAH STORE';
    const readMore = String.fromCharCode(8206).repeat(4001);

    let userTag = `@${m.sender.split('@')[0]}`;
    let intro = getRandomIntro('menu', userTag, botName);
    let footer = getRandomFooter('menu');

    let menuText = `*${botName.toUpperCase()}*\n\n${intro}\n\n\`STATISTIK STORE\`\n• Produk: ${stats.products}  |  Stok: ${stats.stock}  |  Transaksi: ${stats.trx}\n${readMore}\n\`DEPOSIT & SALDO\`\n↳ *${usedPrefix}saldo* Cek sisa saldo deposit\n↳ *${usedPrefix}topup <nominal>* Isi saldo deposit akun\n\n\`PRODUK DIGITAL & AKUN\`\n↳ *${usedPrefix}katalog* Lihat daftar katalog produk\n↳ *${usedPrefix}buy <kode>* Pembelian produk stok ready\n\n\`JASA SOSIAL MEDIA\`\n↳ *${usedPrefix}sosmed* Katalog layanan sosial media\n↳ *${usedPrefix}carisosmed <query>* Cari layanan sosmed\n↳ *${usedPrefix}belisosmed <id> <target> <qty>* Order jasa sosmed\n↳ *${usedPrefix}ceksosmed <order_id>* Cek status pesanan sosmed\n\n\`RIWAYAT & TRANSAKSI\`\n↳ *${usedPrefix}riwayat* Cek riwayat transaksi belanja\n↳ *${usedPrefix}cektrx <invoice>* Cek status transaksi invoice\n↳ *${usedPrefix}bataltrx* Batalkan pesanan pending\n`;

    if (isOwner) {
        menuText += `\n\`ADMIN & OWNER STORE\`\n` +
            `↳ *${usedPrefix}addproduk* Tambah produk baru (.ap)\n` +
            `↳ *${usedPrefix}editproduk <id> <val>* Edit data produk (.ep)\n` +
            `↳ *${usedPrefix}setharga <id> <harga>* Ubah harga instan (.sh)\n` +
            `↳ *${usedPrefix}delproduk <id>* Hapus produk (.dp)\n` +
            `↳ *${usedPrefix}addstok <id>* Isi stok produk (.as)\n` +
            `↳ *${usedPrefix}liststok* Cek stok ketersediaan (.ls)\n` +
            `↳ *${usedPrefix}acc <invoice> [isi]* Konfirmasi & kirim pesanan\n` +
            `↳ *${usedPrefix}proses <invoice>* Tandai pesanan diproses\n` +
            `↳ *${usedPrefix}done <invoice>* Tandai pesanan selesai\n` +
            `↳ *${usedPrefix}kirim <invoice> <data>* Kirim data pesanan manual\n` +
            `↳ *${usedPrefix}batal <invoice>* Batalkan pesanan\n` +
            `↳ *${usedPrefix}addsaldo <user> <nominal>* Tambah saldo user\n` +
            `↳ *${usedPrefix}minsaldo <user> <nominal>* Potong saldo user\n` +
            `↳ *${usedPrefix}setsaldo <user> <nominal>* Set saldo user\n` +
            `↳ *${usedPrefix}listsaldo* Daftar saldo seluruh user\n` +
            `↳ *${usedPrefix}rekap* Rekap omset & laporan penjualan\n` +
            `↳ *${usedPrefix}resetrekap* Reset periode laporan omset (.rr)\n` +
            `↳ *${usedPrefix}resettrx* Reset seluruh riwayat transaksi (.rt)\n` +
            `↳ *${usedPrefix}broadcast <pesan>* Kirim pengumuman / BC\n` +
            `↳ *${usedPrefix}medansaldo* Cek saldo provider sosmed\n` +
            `↳ *${usedPrefix}setsmmprofit <persen>* Atur % margin profit SMM\n` +
            `↳ *${usedPrefix}setqris <string>* Atur QRIS pembayaran\n` +
            `↳ *${usedPrefix}setprefix <prefix>* Ubah prefix perintah bot\n`;
    }

    menuText += `\n\n${footer}`;

    let imageUrl = global.thumb?.menu || global.media?.thumbnail || './storage/assets/thumbnail.jpg';
    let imageSource = (typeof imageUrl === 'string' && fs.existsSync(imageUrl))
        ? fs.readFileSync(imageUrl)
        : (global.media?.thumbnail && fs.existsSync(global.media.thumbnail)
            ? fs.readFileSync(global.media.thumbnail)
            : { url: imageUrl });
    
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
