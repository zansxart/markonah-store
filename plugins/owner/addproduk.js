/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';
import { rp, usage } from '../../lib/format.js';

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) return m.reply(usage({
        prefix: usedPrefix, command,
        desc: 'Tambah produk baru ke katalog',
        format: '<id>|<nama>|<harga>|<kategori>|<deskripsi>',
        examples: 'spotify1|Spotify Premium 1 Bulan|15000|Streaming|Akun Family 1 bulan',
        note: 'Kategori & deskripsi opsional. ID, nama, harga wajib. Pemisah pakai "|".',
    }));
    let [id, name, price, category, description] = text.split('|');
    if (!id || !name || !price) return m.reply(usage({
        prefix: usedPrefix, command,
        desc: 'ID, Nama, dan Harga wajib diisi',
        format: '<id>|<nama>|<harga>|<kategori>|<deskripsi>',
        examples: 'spotify1|Spotify Premium 1 Bulan|15000|Streaming|Akun Family 1 bulan',
    }));
    if (isNaN(price)) return m.reply(`❌ Harga harus berupa angka! Contoh: ${(usedPrefix || '.') + command} spotify1|Spotify|15000`);

    category = category || 'Umum';
    description = description || '';

    storeDB.addProduct(id.trim(), name.trim(), parseInt(price), category.trim(), description.trim());

    let teks = `┏━━━〔 📦 PRODUK DITAMBAHKAN 〕━⬣
┃ ✦ ID       : ${id.trim()}
┃ ✦ Nama     : ${name.trim()}
┃ ✦ Harga    : Rp ${rp(parseInt(price))}
┃ ✦ Kategori : ${category.trim()}
┃ ✦ Deskripsi: ${description.trim()}
┗━━━━━━━━━━━━━━━━⬣`;
    m.reply(teks);
};
handler.help = ['addproduk'];
handler.command = ['addproduk', 'tambahproduk', 'ap'];
handler.tags = ['owner'];
handler.rowner = true;
export default handler;
