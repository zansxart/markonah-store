/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';
import { rp } from '../../lib/format.js';

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) return m.reply(`Format salah!\nContoh: ${usedPrefix + command} spotify1|price|20000\nField: name, price, category, description`);
    
    let [id, field, ...valueArr] = text.split('|');
    let value = valueArr.join('|').trim();
    
    if (!id || !field || !value) return m.reply('ID, Field, dan Value harus diisi!');
    
    let product = storeDB.getProduct(id.trim());
    if (!product) return m.reply('Produk tidak ditemukan!');
    
    let allowedFields = ['name', 'price', 'category', 'description'];
    field = field.trim().toLowerCase();
    if (!allowedFields.includes(field)) return m.reply(`Field tidak valid! Pilih: ${allowedFields.join(', ')}`);
    
    let updates = {};
    if (field === 'price') {
        if (isNaN(value)) return m.reply('Harga harus berupa angka!');
        updates[field] = parseInt(value);
    } else {
        updates[field] = value;
    }
    
    storeDB.editProduct(id.trim(), updates);
    let updated = storeDB.getProduct(id.trim());
    
    let teks = `┏━━━〔 ✏️ PRODUK DIUPDATE 〕━⬣
┃ ✦ ID       : ${updated.id}
┃ ✦ Nama     : ${updated.name}
┃ ✦ Harga    : Rp ${rp(updated.price)}
┃ ✦ Kategori : ${updated.category}
┃ ✦ Deskripsi: ${updated.description}
┗━━━━━━━━━━━━━━━━⬣`;
    m.reply(teks);
};
handler.help = ['editproduk'];
handler.command = ['editproduk', 'ep'];
handler.tags = ['owner'];
handler.rowner = true;
export default handler;
