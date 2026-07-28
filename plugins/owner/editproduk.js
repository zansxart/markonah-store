/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';
import { rp, usage } from '../../lib/format.js';

function parseHumanPrice(str) {
    if (!str) return NaN;
    let clean = String(str).toLowerCase().trim().replace(/[^0-9.km]/g, '');
    if (clean.endsWith('k')) {
        return Math.floor(parseFloat(clean.slice(0, -1)) * 1000);
    }
    if (clean.endsWith('m')) {
        return Math.floor(parseFloat(clean.slice(0, -1)) * 1000000);
    }
    return parseInt(clean.replace(/[^0-9]/g, ''));
}

let handler = async (m, { conn, text, args, usedPrefix, command }) => {
    if (!text) return m.reply(usage({
        prefix: usedPrefix, command,
        desc: 'Ubah data produk (name, price/harga, category, description, type, stok)',
        format: '<id> <field> <value>  atau  <id> <harga>',
        examples: ['spotify1 20000', 'spotify1 20k', 'spotify1 price 25k', 'spotify1|name|Spotify Premium VIP'],
        note: 'Bisa ubah harga langsung tanpa field: *' + (usedPrefix || '.') + command + ' spotify1 20k*',
    }));

    let id = '', field = '', value = '';

    // Support Pipe (|) maupun Spasi
    if (text.includes('|')) {
        let parts = text.split('|');
        id = parts[0]?.trim();
        field = parts[1]?.trim();
        value = parts.slice(2).join('|').trim();
    } else {
        // Jika 2 argumen & argumen kedua angka/20k -> otomatis anggap ubah harga: .ep spotify1 20k
        if (args.length === 2 && !isNaN(parseHumanPrice(args[1]))) {
            id = args[0].trim();
            field = 'price';
            value = args[1].trim();
        } else {
            id = args[0]?.trim();
            field = args[1]?.trim();
            value = args.slice(2).join(' ').trim();
        }
    }

    if (!id || !field || !value) return m.reply(usage({
        prefix: usedPrefix, command,
        desc: 'ID, Field, dan Value wajib diisi',
        format: '<id> <field> <value>  atau  <id> <harga>',
        examples: ['spotify1 20000', 'spotify1 20k', 'spotify1 price 25k'],
    }));

    let product = storeDB.getProduct(id);
    if (!product) return m.reply(`❌ Produk dengan ID '${id}' tidak ditemukan!`);

    let fieldAliasMap = {
        'harga': 'price',
        'price': 'price',
        'nama': 'name',
        'name': 'name',
        'kategori': 'category',
        'category': 'category',
        'deskripsi': 'description',
        'desc': 'description',
        'description': 'description',
        'tipe': 'type',
        'type': 'type',
        'stok': 'stok',
        'slot': 'stok',
    };

    field = field.toLowerCase();
    let targetField = fieldAliasMap[field];

    if (!targetField) {
        return m.reply(`❌ Field '${field}' tidak valid! Pilih: harga/price, nama/name, kategori/category, deskripsi/desc, tipe/type, stok.`);
    }

    let updates = {};
    if (targetField === 'price') {
        let numPrice = parseHumanPrice(value);
        if (isNaN(numPrice) || numPrice < 0) return m.reply('❌ Harga harus berupa angka atau format 20k / 20000!');
        updates.price = numPrice;
    } else if (targetField === 'stok') {
        let numStock = parseInt(value);
        if (isNaN(numStock) || numStock < 0) return m.reply('❌ Stok harus berupa angka >= 0!');
        if (product.type !== 'manual') return m.reply(`❌ Field "stok" hanya untuk produk manual. Produk bertipe "stock" diisi lewat *${usedPrefix}addstok*.`);
        updates.manual_stock = numStock;
    } else if (targetField === 'type') {
        if (/^(manual|po|preorder|pre-order)$/i.test(value)) {
            updates.type = 'manual';
        } else if (/^(stock|stok|auto|otomatis)$/i.test(value)) {
            updates.type = 'stock';
        } else {
            return m.reply(`❌ Tipe "${value}" tidak dikenal. Pilih: *stock* (kirim otomatis) atau *manual* (Pre-Order).`);
        }
    } else {
        updates[targetField] = value;
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
