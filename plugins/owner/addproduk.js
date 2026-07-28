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
        format: '<id>|<nama>|<harga>|<kategori>|<deskripsi>|<tipe>|<slot>',
        examples: [
            'spotify1|Spotify Premium 1 Bulan|15000|Streaming|Akun Family',
            'jokibl|Joki Badge Lolos|50000|Jasa|Dikerjakan admin|manual|5',
        ],
        note: 'Kategori, deskripsi, tipe, slot opsional. Tipe: "stock" (default, pakai .addstok) / "manual" (Pre-Order, disiapkan admin). Slot: jumlah stok awal produk manual (default 0). ID, nama, harga wajib.',
    }));
    let [id, name, price, category, description, type, slot] = text.split('|');
    if (!id || !name || !price) return m.reply(usage({
        prefix: usedPrefix, command,
        desc: 'ID, Nama, dan Harga wajib diisi',
        format: '<id>|<nama>|<harga>|<kategori>|<deskripsi>|<tipe>|<slot>',
        examples: 'spotify1|Spotify Premium 1 Bulan|15000|Streaming|Akun Family 1 bulan',
    }));
    if (isNaN(price)) return m.reply(`❌ Harga harus berupa angka! Contoh: ${(usedPrefix || '.') + command} spotify1|Spotify|15000`);

    let cleanId = id.trim();
    let existing = storeDB.getProduct(cleanId);
    if (existing) {
        return m.reply(`❌ Produk dengan Kode/ID *${cleanId}* sudah ada! (*${existing.name}*).\n\n💡 Gunakan *${usedPrefix}editproduk ${cleanId} ...* atau *${usedPrefix}setharga ${cleanId} <harga>* jika ingin mengedit data produk ini, atau gunakan Kode/ID lain.`);
    }

    category = category || 'Umum';
    description = description || '';
    // Tipe: manual/po = Pre-Order (disiapkan owner), stock/auto = kirim otomatis.
    // Kalau owner isi tapi salah ketik → tolak biar tidak diam-diam jatuh ke stock.
    let pType = 'stock';
    let typeInput = (type || '').trim();
    if (typeInput) {
        if (/^(manual|po|preorder|pre-order)$/i.test(typeInput)) pType = 'manual';
        else if (/^(stock|stok|auto|otomatis)$/i.test(typeInput)) pType = 'stock';
        else return m.reply(`❌ Tipe "${typeInput}" tidak dikenal. Pilih: *stock* (kirim otomatis) atau *manual* (Pre-Order). Kosongkan untuk default stock.`);
    }
    let manualStock = slot && !isNaN(slot) ? Math.max(0, parseInt(slot)) : 0;

    storeDB.addProduct(id.trim(), name.trim(), parseInt(price), category.trim(), description.trim(), pType, manualStock);

    let slotLine = pType === 'manual' ? `↳ *Slot:* ${manualStock}\n` : '';
    let teks = `\`PRODUK DITAMBAHKAN\`\n\n` +
        `↳ *ID:* ${id.trim()}\n` +
        `↳ *Nama:* ${name.trim()}\n` +
        `↳ *Harga:* Rp ${rp(parseInt(price))}\n` +
        `↳ *Kategori:* ${category.trim()}\n` +
        `↳ *Deskripsi:* ${description.trim()}\n` +
        `↳ *Tipe:* ${pType === 'manual' ? 'Manual / Pre-Order' : 'Stock (.addstok)'}\n` +
        `${slotLine}`;
    m.reply(teks);
};
handler.help = ['addproduk'];
handler.command = ['addproduk', 'tambahproduk', 'ap'];
handler.tags = ['owner'];
handler.rowner = true;
export default handler;
