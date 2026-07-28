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

export function ownerJid() {
    let o = global.owner || global.info?.numberOwn;
    if (Array.isArray(o)) o = o[0];
    if (Array.isArray(o)) o = o[0];
    const num = String(o || '').replace(/[^0-9]/g, '');
    return num ? `${num}@s.whatsapp.net` : null;
}

/**
 * Teruskan bukti pembayaran (screenshot) dari pembeli ke PC owner, lengkap
 * dengan command .acc siap-copy. Dipakai auto-detect gambar saat ada trx pending.
 * Tidak pernah melempar error — gagal forward jangan bikin handler ikut gagal.
 *
 * @param {object} conn  koneksi baileys
 * @param {Buffer} buffer  isi gambar bukti transfer
 * @param {object} trx  baris transaksi (invoice_id, buyer_jid, product_name, total_price, type)
 * @param {string} prefix  prefix command aktif
 */
export async function forwardPaymentProof(conn, buffer, trx, prefix = '.') {
    const to = ownerJid();
    if (!to || !buffer) return false;

    const inv = trx.invoice_id || trx.invoiceId;
    const buyer = trx.buyer_jid || trx.buyerJid;
    const isTopup = (trx.type === 'topup') || (trx.product_id === 'TOPUP');
    const total = trx.total_price ?? trx.total ?? 0;

    let caption = `🧾 *BUKTI PEMBAYARAN MASUK*\n\n`;
    caption += `↳ *Invoice:* ${copyable(inv)}\n`;
    caption += `↳ *Pembeli:* @${String(buyer).split('@')[0]}\n`;
    caption += `↳ *Jenis:* ${isTopup ? 'Topup Saldo' : (trx.product_name || trx.product_id || '-')}\n`;
    caption += `↳ *Nominal:* Rp ${rp(total)}\n\n`;
    if (isTopup) {
        caption += `Konfirmasi & saldo masuk otomatis:\n${copyable(`${prefix}acc ${inv}`)}`;
    } else {
        caption += `Konfirmasi pembayaran:\n${copyable(`${prefix}acc ${inv}`)}\n\n`;
        caption += `Kirim pesanan ke buyer:\n${copyable(`${prefix}acc ${inv} <isi>`)}`;
    }

    try {
        await conn.sendMessage(to, { image: buffer, caption, mentions: [buyer] });
        return true;
    } catch (e) {
        console.error('[NOTIFY] Gagal forward bukti bayar:', e?.message || e);
        return false;
    }
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
 * Kirim pesan yang tahan-banting: coba dengan mentions dulu, kalau gagal
 * (mis. jid @lid tidak valid untuk mentions) ulang TANPA mentions supaya
 * teksnya tetap sampai. Owner wajib dapat notif walau mention-nya rewel.
 */
async function safeSend(conn, jid, text, mentions = []) {
    if (!conn || !jid || !text) return;
    try {
        await conn.sendMessage(jid, mentions.length ? { text, mentions } : { text });
    } catch (e1) {
        // Kemungkinan besar gara-gara mentions (@lid). Ulang tanpa mentions.
        try {
            await conn.sendMessage(jid, { text });
        } catch (e2) {
            console.error('[NOTIFY] Gagal kirim ke', jid, ':', e2?.message || e2);
        }
    }
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

    const to = ownerJid();
    const tasks = [];
    if (owner && to) {
        tasks.push(safeSend(conn, to, owner, mentions));
    }
    // Jangan kirim dua kali kalau owner kebetulan ada di grup tujuan —
    // dan jangan fallback ke teks owner, karena teks owner memuat data lengkap.
    if (groupJid && group && groupJid !== to) {
        tasks.push(safeSend(conn, groupJid, group));
    }

    await Promise.allSettled(tasks);
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
