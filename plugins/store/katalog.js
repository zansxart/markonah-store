/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';
import { rp } from '../../lib/format.js';

const SESSION_TTL = 3 * 60 * 1000; // 3 menit

/**
 * Render Layar 1: daftar kategori bernomor.
 */
export function renderCategoryList(categories, prefix = '.') {
    const p = prefix || '.';
    let text = `🛍️ *KATALOG STORE*\nPilih kategori (balas angkanya):\n\n`;
    categories.forEach((cat, i) => {
        text += `${i + 1}. ${cat}\n`;
    });
    text += `\n_Balas angka, mis. 2 — berlaku 3 menit._\n_Atau ketik ${p}katalog <kategori>._`;
    return text;
}

/**
 * Render Layar 2: produk dalam satu kategori.
 */
export function renderCategoryProducts(category, products, prefix = '.') {
    const p = prefix || '.';
    if (!products || products.length === 0) {
        return `❌ Tidak ada produk di kategori *${category}*.`;
    }
    let text = `📁 *${String(category).toUpperCase()}*\n\n`;
    for (const prod of products) {
        const stockCount = storeDB.getStockCount(prod.id);
        const stockBadge = stockCount > 0 ? `✅ READY (${stockCount})` : `❌ KOSONG`;
        text += `╭── 📦 *${prod.name}*\n`;
        text += `│ 🆔 Kode : \`${prod.id}\`\n`;
        text += `│ 💰 Harga : *Rp ${rp(prod.price)}*\n`;
        text += `│ 📊 Stok : ${stockBadge}\n`;
        if (prod.description) text += `│ 📝 Ket : _${prod.description}_\n`;
        text += `╰───────────────────\n\n`;
    }
    text += `💡 *Cara Beli:* Ketik \`${p}buy <kode>\`\n_Contoh:_ \`${p}buy ${products[0].id}\``;
    return text;
}

/**
 * Resolusi input angka → nama kategori dari snapshot sesi.
 * @returns {string|null} nama kategori, atau null kalau di luar range
 */
export function resolveCategoryByNumber(session, numStr) {
    if (!session || !Array.isArray(session.categories)) return null;
    const idx = parseInt(numStr, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= session.categories.length) return null;
    return session.categories[idx];
}

function showCategoryProducts(m, conn, category, usedPrefix) {
    const products = storeDB.getProductsByCategory(category);
    return m.reply(renderCategoryProducts(category, products, usedPrefix));
}

let handler = async (m, { conn, args, usedPrefix }) => {
    const p = usedPrefix || '.';

    // Ada argumen → langsung ke produk (dukung nama kategori atau angka bila ada sesi)
    if (args[0]) {
        let category = null;
        if (/^\d+$/.test(args[0])) {
            const session = conn.katalogSession?.[m.sender];
            category = resolveCategoryByNumber(session, args[0]);
            if (!category) return m.reply(`❌ Nomor kategori tidak valid. Ketik *${p}katalog* dulu untuk lihat daftar.`);
        } else {
            // Cari kategori case-insensitive dari daftar yang ada
            const all = storeDB.getCategories();
            category = all.find(c => c.toLowerCase() === args.join(' ').toLowerCase()) || args.join(' ');
        }
        return showCategoryProducts(m, conn, category, usedPrefix);
    }

    // Tanpa argumen → tampilkan daftar kategori bernomor + simpan sesi
    const categories = storeDB.getCategories();
    if (!categories || categories.length === 0) {
        return m.reply(`❌ Belum ada produk di katalog.`);
    }

    conn.katalogSession = conn.katalogSession || {};
    conn.katalogSession[m.sender] = {
        categories: [...categories],
        expires: Date.now() + SESSION_TTL,
    };

    return m.reply(renderCategoryList(categories, usedPrefix));
};

// Tangkap balasan angka setelah user buka katalog (sesi aktif & belum expired).
handler.before = async (m, { conn, usedPrefix }) => {
    const text = (m.text || '').trim();
    if (!/^\d+$/.test(text)) return; // hanya reaksi ke pesan yang murni angka

    const session = conn.katalogSession?.[m.sender];
    if (!session) return; // tidak ada sesi → jangan ganggu obrolan biasa

    // Expired → bersihkan & diam
    if (Date.now() > session.expires) {
        delete conn.katalogSession[m.sender];
        return;
    }

    const category = resolveCategoryByNumber(session, text);
    if (!category) {
        // Angka di luar range → ralat + tampilkan ulang daftar
        await m.reply(`❌ Nomor tidak ada di daftar. Pilih 1-${session.categories.length}:\n\n${renderCategoryList(session.categories, usedPrefix)}`);
        return true;
    }

    delete conn.katalogSession[m.sender]; // sekali pakai
    await showCategoryProducts(m, conn, category, usedPrefix);
    return true; // stop, jangan diproses plugin lain
};

handler.help = ['katalog', 'stok', 'store', 'shop', 'produk', 'list'];
handler.command = ['katalog', 'stok', 'store', 'shop', 'produk', 'list'];
handler.tags = ['store'];
export default handler;
