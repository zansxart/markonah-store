/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 *
 * Sweeper transaksi kedaluwarsa.
 *
 * Kenapa perlu: timer setTimeout di buy.js cuma hidup di memori, jadi hilang
 * setiap bot restart/reconnect — pending lama nyangkut selamanya. Nominal unik
 * jalan urut (501, 502, 503...), kalau pending numpuk ada risiko nominal
 * kepakai ulang dan pembayaran nyocok ke invoice yang salah.
 *
 * Sweeper baca umur transaksi dari SQL, jadi restart berapa kali pun tetap akurat.
 */
import { storeDB } from './store-db.js';
import { notifyExpired } from './store-notify.js';

let timer = null;

const SWEEP_INTERVAL_MS = 60 * 1000; // cek tiap menit, cukup ringan buat VPS lemah

/**
 * Batalkan semua pending yang sudah lewat batas bayar.
 * @param {object} [conn] koneksi baileys; default ambil global.conn saat dipanggil
 *                        (socket bisa berganti tiap reconnect, jadi jangan di-cache)
 * @returns {Promise<number>} jumlah transaksi yang dibatalkan
 */
export async function sweepExpired(conn = global.conn, { notify = true } = {}) {
    const timeoutSec = global.store?.paymentTimeout || 300;
    let expired = [];
    try {
        expired = storeDB.getExpiredPending(timeoutSec);
    } catch (err) {
        console.error('[SWEEPER] Gagal baca pending kedaluwarsa:', err.message);
        return 0;
    }
    if (!expired.length) return 0;

    for (const trx of expired) {
        try {
            storeDB.updateTransactionStatus(trx.invoice_id, 'cancel');
            console.log(`[SWEEPER] ${trx.invoice_id} (Rp ${trx.unique_amount}) kedaluwarsa → cancel`);

            // Bersihkan timer in-memory kalau kebetulan masih ada, biar tidak
            // dobel-cancel saat setTimeout-nya nyusul jalan.
            const entry = conn?.storeTrx?.[trx.buyer_jid];
            if (entry?.invoiceId === trx.invoice_id) {
                if (entry.timer) clearTimeout(entry.timer);
                delete conn.storeTrx[trx.buyer_jid];
            }

            if (notify && conn) {
                await conn.sendMessage(trx.buyer_jid, {
                    text: `❌ Transaksi ${trx.invoice_id} dibatalkan karena melebihi batas waktu pembayaran.`,
                }).catch(() => {});
                await notifyExpired(conn, {
                    invoiceId: trx.invoice_id,
                    buyerJid: trx.buyer_jid,
                    amount: trx.unique_amount || trx.total_price,
                    chatJid: trx.chat_jid,
                });
            }
        } catch (err) {
            console.error(`[SWEEPER] Gagal batalkan ${trx.invoice_id}:`, err.message);
        }
    }
    return expired.length;
}

export function startTrxSweeper() {
    if (timer) return timer; // guard: jangan dobel-jalan saat reconnect
    // conn sengaja tidak di-cache: socket berganti tiap reconnect, jadi
    // sweepExpired() ambil global.conn yang terbaru setiap kali jalan.
    timer = setInterval(() => { void sweepExpired(); }, SWEEP_INTERVAL_MS);
    if (timer.unref) timer.unref();
    console.log(`[SWEEPER] Auto-cancel transaksi kedaluwarsa aktif (cek tiap ${SWEEP_INTERVAL_MS / 1000} detik).`);
    return timer;
}

export function stopTrxSweeper() {
    if (timer) { clearInterval(timer); timer = null; }
}
