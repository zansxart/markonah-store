/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 *
 * Edit produk fleksibel: mendukung pipe (|), spasi, ubah harga instan, maupun edit per-field.
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
        desc: 'Edit data produk (harga, nama, kategori, deskripsi, tipe, stok)',
        format: '<id> <harga>  atau  <id> <field> <value>  atau  <id>|<field>|<value>',
        examples: [
            'gdrive4 300k',
            'gdrive4 price 300000',
            'gdrive4 nama Google Drive 12 Bulan',
            'gdrive4|harga|300000',
            'gdrive4|nama|Google Drive|300000|Cloud|Garansi 12 Bulan|manual|10'
        ],
        note: 'Gunakan *.setharga <id> <harga>* untuk ubah harga secara paling praktis!',
    }));

    let id = '', field = '', value = '', updates = {};

    if (text.includes('|')) {
        let parts = text.split('|').map(v => v.trim());
        id = parts[0];

        let product = storeDB.getProduct(id);
        if (!product) return m.reply(`❌ Produk dengan ID '${id}' tidak ditemukan!`);

        // Jika format lengkap seperti addproduk: id|nama|harga|kategori|deskripsi|tipe|slot
        if (parts.length >= 4 && !isNaN(parseHumanPrice(parts[2]))) {
            updates.name = parts[1];
            updates.price = parseHumanPrice(parts[2]);
            if (parts[3]) updates.category = parts[3];
            if (parts[4]) updates.description = parts[4];
            if (parts[5]) {
                if (/^(manual|po|preorder|pre-order)$/i.test(parts[5])) updates.type = 'manual';
                else if (/^(stock|stok|auto|otomatis)$/i.test(parts[5])) updates.type = 'stock';
            }
            if (parts[6] && !isNaN(parts[6])) updates.manual_stock = parseInt(parts[6]);
        }
        // Jika format 2 bagian: id|harga  atau  id|300k
        else if (parts.length === 2 && !isNaN(parseHumanPrice(parts[1]))) {
            updates.price = parseHumanPrice(parts[1]);
        }
        // Jika format standar 3 bagian: id|field|value
        else {
            field = parts[1]?.toLowerCase();
            value = parts.slice(2).join('|');
        }
    }
    else {
        id = args[0]?.trim();
        let product = storeDB.getProduct(id);
        if (!product) return m.reply(`❌ Produk dengan ID '${id}' tidak ditemukan! Cek ID dengan *${usedPrefix}katalog*.`);

        let arg1Price = parseHumanPrice(args[1]);

        // Case 1: .ep gdrive4 300000  atau  .ep gdrive4 300k  (langsung ubah harga)
        if (!isNaN(arg1Price) && args.length === 2) {
            updates.price = arg1Price;
        }
        // Case 2: .ep gdrive4 300000 Google Drive Google Drive 12 Bulan Full Garansi manual 10
        else if (!isNaN(arg1Price) && args.length > 2) {
            updates.price = arg1Price;
            let remaining = args.slice(2);
            
            // Cek apakah 2 argumen terakhir adalah tipe & slot: manual 10
            let lastSlot = parseInt(remaining[remaining.length - 1]);
            let secondLastType = remaining[remaining.length - 2]?.toLowerCase();
            
            if (!isNaN(lastSlot) && /^(manual|po|stock|stok|auto|otomatis)$/i.test(secondLastType)) {
                updates.manual_stock = lastSlot;
                updates.type = /^(manual|po)$/i.test(secondLastType) ? 'manual' : 'stock';
                remaining = remaining.slice(0, -2);
            } else if (/^(manual|po|stock|stok|auto|otomatis)$/i.test(remaining[remaining.length - 1])) {
                let lastType = remaining[remaining.length - 1].toLowerCase();
                updates.type = /^(manual|po)$/i.test(lastType) ? 'manual' : 'stock';
                remaining = remaining.slice(0, -1);
            }

            if (remaining.length > 0) {
                // Sisa teks dijadikan deskripsi/nama
                let restText = remaining.join(' ');
                if (restText.includes('|')) {
                    let rParts = restText.split('|').map(v => v.trim());
                    if (rParts[0]) updates.name = rParts[0];
                    if (rParts[1]) updates.category = rParts[1];
                    if (rParts[2]) updates.description = rParts[2];
                } else {
                    updates.description = restText;
                }
            }
        }
        // Case 3: .ep gdrive4 field value  (misal: .ep gdrive4 nama Google Drive 12 Bulan)
        else {
            field = args[1]?.toLowerCase();
            value = args.slice(2).join(' ').trim();
        }
    }

    let product = storeDB.getProduct(id);
    if (!product) return m.reply(`❌ Produk dengan ID '${id}' tidak ditemukan!`);

    // Jika belum ada updates yang terisi dari penanganan otomatis di atas, proses field/value
    if (Object.keys(updates).length === 0) {
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

        let targetField = fieldAliasMap[field];
        if (!targetField) {
            return m.reply(`❌ Format tidak dikenali!\n\n` +
                `👉 *Ubah Harga Cepat:* ${usedPrefix}setharga ${id} 300k\n` +
                `👉 *Ubah Field Spesifik:* ${usedPrefix}ep ${id} nama Nama Baru\n` +
                `👉 *Atau Pakai Pipa:* ${usedPrefix}ep ${id}|nama|300000|Kategori|Deskripsi|manual|10`);
        }

        if (targetField === 'price') {
            let numPrice = parseHumanPrice(value);
            if (isNaN(numPrice) || numPrice < 0) return m.reply('❌ Harga harus berupa angka atau format 300k / 300000!');
            updates.price = numPrice;
        } else if (targetField === 'stok') {
            let numStock = parseInt(value);
            if (isNaN(numStock) || numStock < 0) return m.reply('❌ Stok harus berupa angka >= 0!');
            if (product.type !== 'manual') return m.reply(`❌ Field "stok" hanya untuk produk manual. Tipe "stock" diisi lewat *${usedPrefix}addstok*.`);
            updates.manual_stock = numStock;
        } else if (targetField === 'type') {
            if (/^(manual|po|preorder|pre-order)$/i.test(value)) updates.type = 'manual';
            else if (/^(stock|stok|auto|otomatis)$/i.test(value)) updates.type = 'stock';
            else return m.reply(`❌ Tipe "${value}" tidak dikenal. Pilih: *stock* atau *manual*.`);
        } else {
            updates[targetField] = value;
        }
    }

    storeDB.editProduct(id, updates);
    let updated = storeDB.getProduct(id);

    let stokLine = updated.type === 'manual'
        ? `↳ *Slot:* ${updated.manual_stock || 0}\n`
        : '';
    let teks = `\`PRODUK BERHASIL DIUPDATE\`\n\n` +
        `↳ *ID:* ${updated.id}\n` +
        `↳ *Nama:* ${updated.name}\n` +
        `↳ *Harga:* Rp ${rp(updated.price)}\n` +
        `↳ *Kategori:* ${updated.category}\n` +
        `↳ *Deskripsi:* ${updated.description}\n` +
        `↳ *Tipe:* ${updated.type === 'manual' ? 'Manual / Pre-Order' : 'Stock (kirim otomatis)'}\n` +
        `${stokLine}\n\n` +
        `_Data produk telah diperbarui!_`;
    m.reply(teks);
};

handler.help = ['editproduk <id> <field> <value>'];
handler.command = ['editproduk', 'ep'];
handler.tags = ['owner'];
handler.rowner = true;
export default handler;
