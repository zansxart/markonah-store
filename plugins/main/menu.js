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
    let intro = getRandomIntro(userTag, botName);
    let footer = getRandomFooter();

    let menuText = `*${botName.toUpperCase()}*\n\n${intro}\n\n\`STATISTIK STORE\`\n• Produk: ${stats.products}  |  Stok: ${stats.stock}  |  Transaksi: ${stats.trx}\n${readMore}\n\`DEPOSIT & SALDO\`\n↳ *${usedPrefix}saldo* Cek sisa saldo deposit\n↳ *${usedPrefix}topup <nominal>* Isi saldo deposit akun\n\n\`PRODUK DIGITAL & AKUN\`\n↳ *${usedPrefix}katalog* Lihat daftar katalog produk\n↳ *${usedPrefix}buy <kode>* Pembelian produk stok ready\n\n\`JASA SOSIAL MEDIA\`\n↳ *${usedPrefix}sosmed* Katalog layanan sosial media\n↳ *${usedPrefix}carisosmed <query>* Cari layanan sosmed\n↳ *${usedPrefix}belisosmed <id> <target> <qty>* Order jasa sosmed\n↳ *${usedPrefix}ceksosmed <order_id>* Cek status pesanan sosmed\n\n\`RIWAYAT & TRANSAKSI\`\n↳ *${usedPrefix}riwayat* Cek riwayat transaksi belanja\n↳ *${usedPrefix}cektrx <invoice>* Cek status transaksi invoice\n↳ *${usedPrefix}bataltrx* Batalkan pesanan pending\n`;

    if (isOwner) {
        menuText += `\n\`ADMIN & OWNER\`\n↳ *${usedPrefix}setharga <id> <harga>* Ubah harga instan (contoh: .sh spotify1 20k)\n↳ *${usedPrefix}editproduk <id> <field> <val>* Ubah detail produk\n↳ *${usedPrefix}acc <invoice>* Konfirmasi bayar\n↳ *${usedPrefix}acc <invoice> <isi>* Kirim pesanan ke buyer\n↳ *${usedPrefix}proses <invoice>* Tandai sedang diproses\n↳ *${usedPrefix}medansaldo* Cek saldo provider sosmed\n↳ *${usedPrefix}addsaldo <user> <nominal>* Tambah saldo user\n↳ *${usedPrefix}minsaldo <user> <nominal>* Potong saldo user\n↳ *${usedPrefix}setsmmprofit <persen>* Set profit SMM\n↳ *${usedPrefix}addproduk* Tambah produk stok\n↳ *${usedPrefix}delproduk <id>* Hapus produk\n↳ *${usedPrefix}addstok <id>* Isi stok akun produk\n↳ *${usedPrefix}liststok* Cek stok ketersediaan\n↳ *${usedPrefix}done <invoice>* Selesai & kirim stok\n↳ *${usedPrefix}kirim <invoice> <data>* Kirim manual\n↳ *${usedPrefix}batal <invoice>* Batal pesanan\n↳ *${usedPrefix}setqris <data>* Update QRIS\n↳ *${usedPrefix}setprefix <prefix>* Ubah prefix\n↳ *${usedPrefix}rekap* Rekap omset penjualan\n`;
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
