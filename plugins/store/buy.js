/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 *
 * Alur beli produk:
 * 1. .buy <id> [qty]  → bot tampilkan opsi pembayaran (balas angka)
 * 2. [1] Manual   → potong saldo user → owner diminta siapkan produk
 *                   (owner: .proses → kabari buyer, .acc <inv> <isi> → kirim ke buyer)
 * 3. [2] Otomatis → payment gateway (masih dalam pengembangan)
 */
import { storeDB } from '../../lib/store-db.js';
import { rp, generateInvoiceId, usage, copyable } from '../../lib/format.js';
import { settlePaid } from '../../lib/settle.js';
import { displayPrefix } from '../../lib/prefix-util.js';
import { replyThumb } from '../../lib/ui.js';
import { getRandomIntro, getRandomFooter } from '../../lib/random-msg.js';

const SESSION_TTL = 5 * 60 * 1000; // opsi pembayaran berlaku 5 menit

function renderPaymentOptions(product, qty, subtotal, balance) {
    let intro = getRandomIntro('buy');
    let footer = getRandomFooter('buy');
    return `\`KONFIRMASI PESANAN PRODUK\`\n\n${intro}\n\n` +
    `↳ 📦 *Produk:* ${product.name}\n` +
    `↳ 🔢 *Jumlah:* ${qty}\n` +
    `↳ 💰 *Total Harga:* Rp ${rp(subtotal)}\n` +
    `↳ 💳 *Saldo Anda:* Rp ${rp(balance)}\n\n` +
    `Silakan pilih metode pembayaran (balas angkanya):\n\n` +
    `1. *Bayar Manual (Saldo)*\n` +
    `   _Diproses oleh admin saat online._\n\n` +
    `2. *Bayar Otomatis (Payment Gateway)*\n` +
    `   _On 24 jam, pesanan diproses otomatis._\n\n\n` +
    `${footer}`;
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
    if (!args[0]) return m.reply(usage({
        prefix: usedPrefix, command,
        desc: 'Beli produk dari katalog',
        format: '<id> [qty]',
        examples: ['spotify1', 'spotify1 2'],
        note: 'Lihat daftar produk & ID-nya dengan ' + (usedPrefix || '.') + 'katalog',
    }));

    let productId = args[0];
    let qty = args[1] ? parseInt(args[1]) : 1;

    if (isNaN(qty) || qty < 1) return m.reply(`❌ Qty harus berupa angka minimal 1. Contoh: ${(usedPrefix || '.')}${command} ${productId} 2`);

    let product = storeDB.getProduct(productId);
    if (!product) return m.reply(`❌ Produk dengan ID ${productId} tidak ditemukan.`);

    // Cek stok sesuai tipe: manual pakai counter manual_stock, stock pakai tabel stock.
    let stock = product.type === 'manual' ? (product.manual_stock || 0) : storeDB.getStockCount(productId);
    if (stock < qty) return replyThumb(conn, m, `\`STOK KOSONG / TIDAK CUKUP\`\n\n↳ 📦 *Produk:* ${product.name}\n↳ 🔢 *Permintaan:* ${qty}\n↳ 📊 *Sisa Stok:* ${stock}\n\n\n_Mohon maaf kak, stok produk sedang tidak mencukupi._`, 'gagal');

    let subtotal = product.price * qty;
    let user = storeDB.getOrCreateUser(m.sender, m.pushName || 'User');

    // Simpan sesi opsi pembayaran (satu sesi aktif per user)
    conn.buySession = conn.buySession || {};
    conn.buySession[m.sender] = {
        productId,
        qty,
        subtotal,
        expires: Date.now() + SESSION_TTL,
    };

    return replyThumb(conn, m, renderPaymentOptions(product, qty, subtotal, user.balance), 'invoice');
};

handler.before = async (m, { conn, usedPrefix }) => {
    const session = conn.buySession?.[m.sender];
    if (!session) return;

    const text = (m.text || '').trim().toLowerCase();
    const prefix = displayPrefix(usedPrefix);

    // Sesi kedaluwarsa → bersihkan diam-diam
    if (Date.now() > session.expires) {
        delete conn.buySession[m.sender];
        return;
    }

    if (text === 'batal' || text === 'cancel') {
        delete conn.buySession[m.sender];
        await m.reply(`✅ Pesanan dibatalkan.`);
        return true;
    }

    // Hanya reaksi ke pilihan 1/2 (atau kata kuncinya)
    const isManual = text === '1' || text === 'manual';
    const isAuto = text === '2' || text === 'otomatis';
    if (!isManual && !isAuto) return;

    // ── OPSI 2: OTOMATIS (PG BELUM JADI) ──
    if (isAuto) {
        await replyThumb(conn, m, `\`PAYMENT OTOMATIS\`\n\nMohon maaf, pembayaran otomatis belum tersedia saat ini.\nSilakan balas *1* untuk bayar manual via saldo.`, 'wait');
        return true; // sesi tetap hidup, user bisa pilih 1
    }

    // ── OPSI 1: MANUAL (POTONG SALDO) ──
    delete conn.buySession[m.sender];

    const product = storeDB.getProduct(session.productId);
    if (!product) {
        await replyThumb(conn, m, `❌ Produk sudah tidak tersedia. Silakan cek ${prefix}katalog.`, 'gagal');
        return true;
    }

    // Pastikan stok masih cukup (bisa keburu habis saat user milih opsi).
    const stockNow = product.type === 'manual' ? (product.manual_stock || 0) : storeDB.getStockCount(session.productId);
    if (stockNow < session.qty) {
        await replyThumb(conn, m, `\`STOK KOSONG / TIDAK CUKUP\`\n\n↳ 📦 *Produk:* ${product.name}\n↳ 🔢 *Permintaan:* ${session.qty}\n↳ 📊 *Sisa Stok:* ${stockNow}\n\n\n_Mohon maaf, stok produk keburu habis. Pesanan dibatalkan._`, 'gagal');
        return true;
    }

    const user = storeDB.getOrCreateUser(m.sender, m.pushName || 'User');

    // Saldo kurang → arahkan topup dengan thumbnail gagal.jpg
    if (user.balance < session.subtotal) {
        const kurang = session.subtotal - user.balance;
        const msg = `\`SALDO TIDAK CUKUP\`\n\n` +
            `↳ 📦 *Produk:* ${product.name}\n` +
            `↳ 💰 *Total Pesanan:* Rp ${rp(session.subtotal)}\n` +
            `↳ 💳 *Saldo Anda:* Rp ${rp(user.balance)}\n` +
            `↳ ⚠️ *Kekurangan:* Rp ${rp(kurang)}\n\n` +
            `Isi saldo dulu dengan ketik:\n` +
            `${copyable(`${prefix}topup ${kurang}`)}\n\n` +
            `Setelah saldo terisi, ulangi:\n` +
            `${copyable(`${prefix}buy ${session.productId}${session.qty > 1 ? ' ' + session.qty : ''}`)}\n\n\n` +
            `_Silakan melakukan topup terlebih dahulu ya kak!_`;
        await replyThumb(conn, m, msg, 'gagal');
        return true;
    }

    const deducted = storeDB.deductBalance(m.sender, session.subtotal);
    if (!deducted) {
        await m.reply(`❌ Gagal memotong saldo. Silakan coba lagi.`);
        return true;
    }

    // Produk manual: kurangi counter stok secara atomik. Kalau keburu habis
    // (race dengan order lain), balikin saldo & batalkan.
    if (product.type === 'manual') {
        const ok = storeDB.decrementManualStock(session.productId, session.qty);
        if (!ok) {
            storeDB.addBalance(m.sender, session.subtotal);
            await m.reply(`❌ Yah, stok keburu habis. Saldo Anda dikembalikan. Pesanan dibatalkan.`);
            return true;
        }
    }

    const invoiceId = generateInvoiceId();
    storeDB.createTransaction(invoiceId, m.sender, session.productId, session.qty, session.subtotal, 'saldo', session.subtotal, m.chat, 'product');

    // settlePaid: produk stock + stok ready → langsung kirim;
    // kalau tidak → status process + owner diminta siapkan produk.
    await settlePaid(conn, invoiceId, { source: 'saldo-user' });
    return true;
};

handler.help = ['buy <id>', 'buy <id> <qty>'];
handler.command = ['buy', 'beli', 'order'];
handler.tags = ['store'];
export default handler;
