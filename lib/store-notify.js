/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 *
 * Notifikasi transaksi terpusat: owner + grup asal transaksi.
 * Sengaja dipisah biar buy.js / settle.js pakai format yang sama.
 *
 * Grup tujuan diambil dari chat tempat transaksi dimulai (kolom chat_jid), jadi
 * kalau jualan di banyak grup, notif nyamperin grup yang bener sendiri. Kalau
 * transaksi lahir di PC (bukan grup), notif grup dilewati — pembeli sudah dapat
 * pesannya langsung. global.store.notifGroup dipakai sebagai cadangan saja.
 *
 * Isi notif grup DISENSOR: tanpa isi stok (email/password) dan nomor pembeli
 * disamarkan, karena anggota grup belum tentu boleh lihat data itu.
 */
import { rp, copyable } from './format.js';

/** Samarkan nomor: 6285802569316 → 62858****9316 */
export function maskJid(jid = '') {
    const num = String(jid).split('@')[0].replace(/[^0-9]/g, '');
    if (num.length <= 8) return num;
    return `${num.slice(0, 5)}****${num.slice(-4)}`;
}

function ownerJid() {
    let o = global.owner || global.info?.numberOwn;
    if (Array.isArray(o)) o = o[0];
    if (Array.isArray(o)) o = o[0];
    const num = String(o || '').replace(/[^0-9]/g, '');
    return num ? `${num}@s.whatsapp.net` : null;
}

/**
 * Tentukan grup tujuan notif untuk sebuah transaksi.
 * Prioritas: chat asal transaksi (kalau grup) → notifGroup di config.
 * Chat pribadi tidak dianggap tujuan notif grup, karena pembeli sudah
 * menerima pesan transaksinya langsung di chat itu (nanti jadi dobel).
 */
function resolveGroupJid(chatJid) {
    if (chatJid && String(chatJid).endsWith('@g.us')) return chatJid;
    return global.store?.notifGroup || '';
}

/**
 * Kirim teks ke owner dan/atau grup notif. Kegagalan satu tujuan tidak
 * membatalkan yang lain, dan tidak pernah melempar error ke pemanggil —
 * notif gagal jangan sampai bikin transaksi ikut gagal.
 *
 * @param {object} conn koneksi baileys
 * @param {object} opts
 * @param {string} opts.owner   teks untuk owner (kosong = skip)
 * @param {string} opts.group   teks untuk grup (kosong = skip, TIDAK fallback ke teks owner)
 * @param {string} opts.chatJid chat asal transaksi, penentu grup tujuan
 * @param {string[]} opts.mentions JID yang di-mention di pesan owner
 */
export async function notifyTrx(conn, { owner = '', group = '', chatJid = '', mentions = [] } = {}) {
    if (!conn) return;
    const groupJid = resolveGroupJid(chatJid);
    const tasks = [];

    const to = ownerJid();
    if (owner && to) {
        tasks.push(conn.sendMessage(to, { text: owner, mentions }));
    }
    // Jangan kirim dua kali kalau owner kebetulan ada di grup tujuan —
    // dan jangan fallback ke teks owner, karena teks owner memuat data lengkap.
    if (groupJid && group && groupJid !== to) {
        tasks.push(conn.sendMessage(groupJid, { text: group }));
    }

    const results = await Promise.allSettled(tasks);
    for (const r of results) {
        if (r.status === 'rejected') {
            console.error('[NOTIFY] Gagal kirim notif:', r.reason?.message || r.reason);
        }
    }
}

/**
 * Notif pesanan baru (masih pending) — OWNER SAJA.
 * Pending belum tentu jadi (bisa kedaluwarsa 5 menit lagi), jadi jangan
 * ramaikan grup dengan notif yang belum ada hasilnya. Grup baru dikabari
 * kalau pembayaran benar-benar masuk (notifyPaid).
 */
export function notifyNewOrder(conn, { invoiceId, buyerJid, productName, total, chatJid }) {
    return notifyTrx(conn, {
        owner: `🔔 *Pesanan Baru*\nInvoice: ${copyable(invoiceId)}\nPembeli: @${String(buyerJid).split('@')[0]}\nProduk: ${productName}\nTotal: Rp ${rp(total)}\nStatus: Pending`,
        mentions: [buyerJid],
        chatJid,
    });
}

/**
 * Notif pembayaran masuk & sudah di-settle.
 * Isi stok TIDAK pernah masuk teks grup — itu cuma buat pembeli.
 */
export function notifyPaid(conn, { invoiceId, buyerJid, productName, amount, status, source = 'manual', chatJid }) {
    const via = 'PEMBAYARAN DITERIMA';
    const label = status === 'done' ? 'terkirim otomatis' : 'perlu dikirim manual';
    return notifyTrx(conn, {
        owner: `✅ *${via}*\nInvoice: ${copyable(invoiceId)}\nPembeli: @${String(buyerJid).split('@')[0]}\nProduk: ${productName || '-'}\nNominal: Rp ${rp(amount)}\nStatus: ${status} (${label})`,
        group: `✅ *${via}*\nInvoice: ${copyable(invoiceId)}\nPembeli: ${maskJid(buyerJid)}\nProduk: ${productName || '-'}\nNominal: Rp ${rp(amount)}\nStatus: ${status} (${label})`,
        mentions: [buyerJid],
        chatJid,
    });
}

/**
 * PC owner: pembayaran sudah masuk (saldo terpotong) tapi produk perlu
 * disiapkan manual. Kasih command siap-copy biar owner tinggal tap.
 * Alur: .proses <inv> → kabari buyer "sedang diproses",
 *       .acc <inv> <isi akun> → bot PC buyer & kirim pesanannya.
 */
export function notifyFulfillOrder(conn, { invoiceId, buyerJid, productName, qty, amount, prefix = '.' }) {
    return notifyTrx(conn, {
        owner: `📦 *SIAPKAN PESANAN — SALDO SUDAH TERPOTONG*\n`
            + `Invoice: ${copyable(invoiceId)}\n`
            + `Pembeli: @${String(buyerJid).split('@')[0]}\n`
            + `Produk: ${productName || '-'}\n`
            + `Qty: ${qty || 1}\n`
            + `Nominal: Rp ${rp(amount)}\n\n`
            + `Tandai sedang diproses (buyer dikabari):\n${copyable(`${prefix}proses ${invoiceId}`)}\n\n`
            + `Kirim pesanan ke buyer (ganti <isi> dengan data akun/produk):\n${copyable(`${prefix}acc ${invoiceId} <isi>`)}`,
        mentions: [buyerJid],
    });
}

/**
 * Notif transaksi kedaluwarsa (dibatalkan sweeper) — OWNER SAJA.
 * Sama seperti notifyNewOrder: transaksi yang gagal tidak perlu diumumkan
 * ke grup. Pembeli sudah dikabari langsung oleh sweeper.
 */
export function notifyExpired(conn, { invoiceId, buyerJid, amount, chatJid }) {
    return notifyTrx(conn, {
        owner: `⌛ *Transaksi Kedaluwarsa*\nInvoice: ${copyable(invoiceId)}\nPembeli: @${String(buyerJid).split('@')[0]}\nNominal: Rp ${rp(amount)}\nStatus: cancel`,
        mentions: [buyerJid],
        chatJid,
    });
}
