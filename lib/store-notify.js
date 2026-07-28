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
// Catatan circular import: ui.js juga import buildStatusCard & resolveGroupJid
// dari file ini. Aman karena kedua sisi hanya memakai binding-nya DI DALAM
// fungsi (bukan saat evaluasi modul), jadi live-binding ES module resolve benar.
import { sendThumb } from './ui.js';

/** Samarkan nomor: 6285802569316 → 62858****9316 */
export function maskJid(jid = '') {
    const num = String(jid).split('@')[0].replace(/[^0-9]/g, '');
    if (num.length <= 8) return num;
    return `${num.slice(0, 5)}****${num.slice(-4)}`;
}

/**
 * JID owner yang benar-benar bisa dikirimi pesan.
 * Prioritas: global.ownerJidResolved (jid asli owner yang ditangkap saat owner
 * chat bot — bisa @lid atau @s.whatsapp.net) → baru nomor dari config.
 *
 * Kenapa: di WhatsApp baru, akun yang di grup muncul sebagai @lid kadang TIDAK
 * bisa dikirimi lewat jid @s.whatsapp.net hasil tebak dari nomor config —
 * pesannya hilang diam-diam. Jid asli yang ditangkap saat interaksi paling andal.
 */
export function ownerJid() {
    if (global.ownerJidResolved) return global.ownerJidResolved;
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
        // Mentions @lid bisa bikin gagal → ulang tanpa mentions.
        try {
            await conn.sendMessage(to, { image: buffer, caption });
            return true;
        } catch (e2) {
            console.error('[NOTIFY] Gagal forward bukti bayar:', e2?.message || e2);
            return false;
        }
    }
}

/**
 * Tentukan grup tujuan notif untuk sebuah transaksi.
 * Prioritas: chat asal transaksi (kalau grup) → notifGroup di config.
 * Chat pribadi tidak dianggap tujuan notif grup, karena pembeli sudah
 * menerima pesan transaksinya langsung di chat itu (nanti jadi dobel).
 */
export function resolveGroupJid(chatJid) {
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
 * Label status transaksi buat ditampilkan ke user.
 */
export function statusText(status) {
    const map = {
        pending: '⏳ Pending',
        paid: '✅ Sukses',
        process: '🔄 Diproses',
        done: '✅ Sukses',
        cancel: '❌ Dibatalkan',
    };
    return map[status] || status || '-';
}

/**
 * Bangun kartu status transaksi (dengan tanggal, jam, status) — dipakai
 * untuk notif grup & buyer. TIDAK memuat data akun/stok (itu privat, cuma
 * dikirim ke PC pembeli).
 */
export function buildStatusCard({ title = 'STATUS PESANAN', invoiceId, buyerJid, productName, amount, status }) {
    const now = new Date();
    const tgl = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
    const jam = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) + ' WIB';

    let t = `\`${title}\`\n\n`;
    t += `↳ *Invoice:* ${copyable(invoiceId)}\n`;
    if (buyerJid) t += `↳ *Pembeli:* @${String(buyerJid).split('@')[0]}\n`;
    if (productName) t += `↳ *Produk:* ${productName}\n`;
    if (amount != null) t += `↳ *Nominal:* Rp ${rp(amount)}\n`;
    t += `↳ *Tanggal:* ${tgl}\n`;
    t += `↳ *Jam:* ${jam}\n`;
    t += `↳ *Status:* ${statusText(status)}`;
    return t;
}

/**
 * Notif status transaksi ke GRUP asal transaksi, sambil TAG pembeli.
 * Kalau transaksi lahir di PC (tidak ada grup), dilewati — pembeli sudah
 * dapat pesan lengkap langsung di PC-nya. Data akun tidak pernah masuk sini.
 */
export async function notifyStatus(conn, { invoiceId, buyerJid, productName, amount, status, chatJid, title, key, fallbackToBuyer = true }) {
    if (!conn) return;
    const card = buildStatusCard({ title, invoiceId, buyerJid, productName, amount, status });
    const groupJid = resolveGroupJid(chatJid);
    const target = groupJid || (fallbackToBuyer ? buyerJid : null);
    if (!target) return;
    const thumbKey = key || (status === 'done' ? 'done' : status === 'process' ? 'proses' : (status === 'paid' || title === 'PEMBAYARAN DITERIMA') ? 'diterima' : 'invoice');
    await sendThumb(conn, target, card, thumbKey, buyerJid ? { mentions: [buyerJid] } : {});
}

/**
 * Notif pesanan baru (pending). Owner dapat teks lengkap; GRUP dapat kartu
 * status + tag pembeli (dengan tanggal/jam/status), tanpa data akun.
 */
export function notifyNewOrder(conn, { invoiceId, buyerJid, productName, total, chatJid }) {
    const to = ownerJid();
    const ownerText = `🔔 *PESANAN BARU*\nInvoice: ${copyable(invoiceId)}\nPembeli: @${String(buyerJid).split('@')[0]}\nProduk: ${productName}\nTotal: Rp ${rp(total)}\nStatus: Pending`;
    return Promise.allSettled([
        to ? safeSend(conn, to, ownerText, [buyerJid]) : Promise.resolve(),
        notifyStatus(conn, { title: 'PESANAN BARU', invoiceId, buyerJid, productName, amount: total, status: 'pending', chatJid, key: 'invoice' }),
    ]);
}

/**
 * Notif pembayaran masuk & sudah di-settle.
 * Owner dapat teks lengkap; GRUP dapat kartu status + tag pembeli.
 * Data akun/stok TIDAK pernah masuk sini — itu cuma buat PC pembeli.
 */
export function notifyPaid(conn, { invoiceId, buyerJid, productName, amount, status, source = 'manual', chatJid }) {
    const to = ownerJid();
    const label = status === 'done' ? 'terkirim/selesai' : 'perlu dikirim manual';
    const ownerText = `\`PEMBAYARAN DITERIMA\`\n\n` +
        `↳ *Invoice:* ${copyable(invoiceId)}\n` +
        `↳ *Pembeli:* @${String(buyerJid).split('@')[0]}\n` +
        `↳ *Produk:* ${productName || '-'}\n` +
        `↳ *Nominal:* Rp ${rp(amount)}\n` +
        `↳ *Status:* ${status} (${label})\n\n\n` +
        `_Pembayaran telah berhasil diterima!_`;
    const title = status === 'done' ? 'PESANAN SELESAI' : 'PEMBAYARAN DITERIMA';
    const thumbKey = status === 'done' ? 'done' : 'diterima';
    return Promise.allSettled([
        to ? safeSend(conn, to, ownerText, [buyerJid]) : Promise.resolve(),
        notifyStatus(conn, { title, invoiceId, buyerJid, productName, amount, status, chatJid, key: thumbKey }),
    ]);
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
