/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';
import { rp } from '../../lib/format.js';

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) return m.reply(`Format salah!\nContoh: ${usedPrefix + command} spotify1|Spotify Premium 1 Bulan|15000|Streaming|Akun Spotify Premium Family 1 bulan`);
    let [id, name, price, category, description] = text.split('|');
    if (!id || !name || !price) return m.reply(`ID, Nama, dan Harga wajib diisi!`);
    if (isNaN(price)) return m.reply(`Harga harus berupa angka!`);
    
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
