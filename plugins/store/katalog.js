/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';
import { rp } from '../../lib/format.js';
import { replyThumb } from '../../lib/ui.js';
import { startFlow } from '../../lib/session.js';
import { getRandomIntro, getRandomFooter } from '../../lib/random-msg.js';

const SESSION_TTL = 3 * 60 * 1000; // 3 menit

/**
 * Render Layar 1: daftar kategori bernomor.
 */
export function renderCategoryList(categories, prefix = '.') {
    const p = prefix !== undefined && prefix !== null ? prefix : '.';
    let intro = getRandomIntro('katalog');
    let footer = getRandomFooter('katalog');
    let text = `\`KATALOG PRODUK DIGITAL\`\n${intro}\n\n`;
    categories.forEach((cat, i) => {
        text += `${i + 1}. 🛍️ *${cat}*\n`;
    });
    text += `\n_Balas angka (contoh: 1) atau ketik *${p}katalog <kategori>*\n\n`;
    text += `🚀 *Jasa Sosmed?* Ketik *${p}sosmed* untuk katalog followers & likes.\n\n\n`;
    text += `${footer}`;
    return text;
}

/**
 * Render Layar 2: produk dalam satu kategori.
 */
export function renderCategoryProducts(category, products, prefix = '.') {
    const p = prefix !== undefined && prefix !== null ? prefix : '.';
    if (!products || products.length === 0) {
        return `Belum ada produk nih di kategori *${category}*. Nanti dikabarin lagi ya kak!`;
    }
    let footer = getRandomFooter('katalog');
    let text = `\`KATALOG ${String(category).toUpperCase()}\`\n\n`;
    for (const prod of products) {
        const isManual = prod.type === 'manual';
        const manualStock = prod.manual_stock || 0;
        const stockCount = isManual ? manualStock : storeDB.getStockCount(prod.id);
        const stockBadge = stockCount > 0 ? `Ready (${stockCount})` : `Kosong`;
        
        text += `↳ 🏷️ *${prod.name}*\n`;
        text += `  Kode: *${prod.id}*\n`;
        text += `  Harga: *Rp ${rp(prod.price)}*\n`;
        text += `  Stok: *${stockBadge}*\n`;
        if (prod.description) text += `  _Ket: ${prod.description}_\n`;
        text += `\n`;
    }
    text += `*Cara Pembelian:* Ketik *${p}buy <kode>*\nContoh: *${p}buy ${products[0].id}*\n\n\n`;
    text += `${footer}`;
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
    return replyThumb(conn, m, renderCategoryProducts(category, products, usedPrefix), 'katalog');
}

let handler = async (m, { conn, args, usedPrefix }) => {
    const p = usedPrefix !== undefined && usedPrefix !== null ? usedPrefix : '.';

    // Ada argumen → langsung ke produk (dukung nama kategori atau angka walau tanpa sesi)
    if (args[0]) {
        let category = null;
        if (/^\d+$/.test(args[0])) {
            const all = storeDB.getCategories();
            const idx = parseInt(args[0], 10) - 1;
            if (idx >= 0 && idx < all.length) {
                category = all[idx];
            } else {
                const session = conn.katalogSession?.[m.sender];
                category = resolveCategoryByNumber(session, args[0]);
            }
            if (!category) return m.reply(`❌ Nomor kategori ${args[0]} tidak valid. Pilihan kategori 1-${all.length}. Ketik *${p}katalog* untuk melihat daftar.`);
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
    startFlow(conn, m.sender, 'katalogSession');
    conn.katalogSession[m.sender] = {
        categories: [...categories],
        expires: Date.now() + SESSION_TTL,
    };

    return replyThumb(conn, m, renderCategoryList(categories, usedPrefix), 'katalog');
};

// Tangkap balasan angka setelah user buka katalog (sesi aktif & belum expired).
handler.before = async (m, { conn, usedPrefix }) => {
    const text = (m.text || '').trim();
    if (!/^\d+$/.test(text)) return; // hanya reaksi ke pesan yang murni angka

    // Kalau ada flow lain aktif (buy/topup/smm), biarkan flow itu yang menangani —
    // jangan ikut campur, biar tidak dobel-balas.
    if (conn.buySession?.[m.sender] || conn.topupSession?.[m.sender] || conn.smmSession?.[m.sender]) return;

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
