/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';
import { rp, usage } from '../../lib/format.js';

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) return m.reply(usage({
        prefix: usedPrefix, command,
        desc: 'Ubah data produk (field: name, price, category, description, type, stok)',
        format: '<id>|<field>|<value>',
        examples: ['spotify1|price|20000', 'joki1|type|manual', 'joki1|stok|10'],
        note: 'Field: name, price, category, description, type, stok. type = "stock" / "manual" (Pre-Order). "stok" hanya untuk produk manual (set jumlah slot).',
    }));

    let [id, field, ...valueArr] = text.split('|');
    let value = valueArr.join('|').trim();

    if (!id || !field || !value) return m.reply(usage({
        prefix: usedPrefix, command,
        desc: 'ID, Field, dan Value wajib diisi',
        format: '<id>|<field>|<value>',
        examples: 'spotify1|price|20000',
        note: 'Field: name, price, category, description, type, stok.',
    }));

    let product = storeDB.getProduct(id.trim());
    if (!product) return m.reply('Produk tidak ditemukan!');

    let allowedFields = ['name', 'price', 'category', 'description', 'type', 'stok'];
    field = field.trim().toLowerCase();
    if (!allowedFields.includes(field)) return m.reply(`Field tidak valid! Pilih: ${allowedFields.join(', ')}`);

    let updates = {};
    if (field === 'price') {
        if (isNaN(value)) return m.reply('Harga harus berupa angka!');
        updates[field] = parseInt(value);
    } else if (field === 'stok') {
        if (isNaN(value) || parseInt(value) < 0) return m.reply('Stok harus berupa angka >= 0!');
        if (product.type !== 'manual') return m.reply(`❌ Field "stok" hanya untuk produk manual. Produk ini bertipe "stock" — isi stoknya pakai *${usedPrefix}addstok*.`);
        updates.manual_stock = parseInt(value);
    } else if (field === 'type') {
        // Normalisasi tipe; tolak nilai yang tidak dikenal biar owner sadar.
        if (/^(manual|po|preorder|pre-order)$/i.test(value)) {
            updates[field] = 'manual';
        } else if (/^(stock|stok|auto|otomatis)$/i.test(value)) {
            updates[field] = 'stock';
        } else {
            return m.reply(`❌ Tipe "${value}" tidak dikenal. Pilih: *stock* (kirim otomatis) atau *manual* (Pre-Order).`);
        }
    } else {
        updates[field] = value;
    }

    storeDB.editProduct(id.trim(), updates);
    let updated = storeDB.getProduct(id.trim());

    let stokLine = updated.type === 'manual'
        ? `↳ *Slot:* ${updated.manual_stock || 0}\n`
        : '';
    let teks = `\`PRODUK DIUPDATE\`\n\n` +
        `↳ *ID:* ${updated.id}\n` +
        `↳ *Nama:* ${updated.name}\n` +
        `↳ *Harga:* Rp ${rp(updated.price)}\n` +
        `↳ *Kategori:* ${updated.category}\n` +
        `↳ *Deskripsi:* ${updated.description}\n` +
        `↳ *Tipe:* ${updated.type === 'manual' ? 'Manual / Pre-Order' : 'Stock (kirim otomatis)'}\n` +
        `${stokLine}`;
    m.reply(teks);
};
handler.help = ['editproduk'];
handler.command = ['editproduk', 'ep'];
handler.tags = ['owner'];
handler.rowner = true;
export default handler;
