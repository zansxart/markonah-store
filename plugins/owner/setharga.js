/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 *
 * Ubah harga produk secara instan tanpa perlu pipa (|).
 * Format: .setharga <id_produk> <harga_baru>
 * Contoh: .setharga spotify1 20000  atau  .setharga spotify1 20k
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

let handler = async (m, { conn, args, usedPrefix, command }) => {
    if (args.length < 2) return m.reply(usage({
        prefix: usedPrefix, command,
        desc: 'Ubah harga produk secara cepat & praktis',
        format: '<id_produk> <harga_baru>',
        examples: ['spotify1 20000', 'spotify1 20k', 'netflix1 35k'],
        note: 'Bisa pakai format angka (20000) atau imbuhan k/m (20k = 20.000).',
    }));

    let productId = args[0].trim();
    let rawPrice = args.slice(1).join('').trim();
    let newPrice = parseHumanPrice(rawPrice);

    if (isNaN(newPrice) || newPrice < 0) {
        return m.reply(`❌ Nominal harga tidak valid! Contoh: *${usedPrefix || '.'}${command} ${productId} 20000* atau *${usedPrefix || '.'}${command} ${productId} 20k*`);
    }

    let product = storeDB.getProduct(productId);
    if (!product) {
        return m.reply(`❌ Produk dengan ID '${productId}' tidak ditemukan! Cek ID produk dengan *${usedPrefix || '.'}katalog*.`);
    }

    let oldPrice = product.price;
    storeDB.editProduct(productId, { price: newPrice });

    let teks = `\`HARGA PRODUK DIPERBARUI\`\n\n` +
        `↳ *ID Produk:* ${product.id}\n` +
        `↳ *Nama Produk:* ${product.name}\n` +
        `↳ *Harga Lama:* Rp ${rp(oldPrice)}\n` +
        `↳ *Harga Baru:* *Rp ${rp(newPrice)}*\n\n\n` +
        `_Harga produk berhasil diperbarui secara instan!_`;

    m.reply(teks);
};

handler.help = ['setharga <id> <harga>'];
handler.command = ['setharga', 'sh', 'ubahharga', 'gantiharga'];
handler.tags = ['owner'];
handler.rowner = true;

export default handler;
