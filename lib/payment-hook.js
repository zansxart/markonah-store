/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 *
 * Webhook penerima notifikasi pembayaran GoPay Merchant (GoBiz).
 * HP standby (MacroDroid/Tasker) baca notif app GoBiz → POST ke sini →
 * cocokin nominal ke transaksi pending → settlePaid otomatis.
 *
 * Tanpa dependency tambahan (http bawaan Node) supaya ringan di VPS.
 */
import http from 'http';
import { storeDB } from './store-db.js';
import { settlePaid } from './settle.js';
import { notifyUnmatched, notifyLatePayment } from './store-notify.js';
import { rp } from './format.js';

let server = null;
let retry = 0;

const MAX_RETRY = 5;
const RETRY_DELAY_MS = 3000;

/**
 * Ambil semua kandidat nominal dari teks notif.
 * Contoh notif: "Pembayaran Rp 15.007 berhasil", "menerima Rp15.007", dst.
 * Nominal ber-"Rp" diprioritaskan; kalau tidak ada sama sekali, baru angka
 * polos dipakai sebagai cadangan (jaga-jaga format notif GoBiz berubah).
 * Return array integer (titik ribuan dibuang).
 */
function parseAmounts(text) {
    if (!text || typeof text !== 'string') return [];

    // Buang desimal ",00"/".00" di akhir dulu, baru buang pemisah ribuan.
    const toInt = (s) => parseInt(s.replace(/[.,]\d{2}$/, '').replace(/[.,]/g, ''), 10);
    const collect = (re) => {
        const out = [];
        let m;
        while ((m = re.exec(text)) !== null) {
            const n = toInt(m[1]);
            if (!isNaN(n) && n > 0) out.push(n);
        }
        return out;
    };

    const withRp = collect(/rp\.?\s*([\d.,]+)/gi);
    if (withRp.length) return withRp;

    // Cadangan: angka polos, tapi abaikan yang nempel jam (12:30) atau tanggal.
    return collect(/(?<![\d:\/-])(\d[\d.,]*)(?![\d:\/-])/g);
}

function readBody(req) {
    return new Promise((resolve) => {
        let data = '';
        req.on('data', (chunk) => {
            data += chunk;
            if (data.length > 1e6) req.destroy(); // guard payload kegedean
        });
        req.on('end', () => resolve(data));
        req.on('error', () => resolve(''));
    });
}

function parsePayload(raw, contentType = '') {
    // Dukung JSON, x-www-form-urlencoded, maupun teks polos.
    // Teks polos dipakai kalau notif GoBiz mengandung tanda kutip/newline —
    // JSON-nya bakal jebol, jadi lebih aman kirim mentah + token via query.
    const trimmed = (raw || '').trim();
    try {
        if (trimmed.startsWith('{')) return JSON.parse(trimmed);
        if (contentType.includes('x-www-form-urlencoded')) {
            return Object.fromEntries(new URLSearchParams(raw).entries());
        }
    } catch { /* JSON rusak → jatuh ke teks polos di bawah */ }
    return { text: raw };
}

export function startPaymentHook() {
    if (server) return server; // guard: jangan dobel-listen saat reconnect
    if (global.store?.autoConfirm === false) {
        console.log('[PAYHOOK] autoConfirm dimatikan, webhook tidak dijalankan.');
        return null;
    }

    const port = global.payment?.webhookPort || 3939;
    const secret = global.payment?.webhookToken || '';

    server = http.createServer(async (req, res) => {
        try {
            if (req.method !== 'POST') {
                res.writeHead(405, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
            }
            const url = (req.url || '').split('?')[0];
            if (url !== '/gopay' && url !== '/paid') {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ ok: false, error: 'not_found' }));
            }

            const raw = await readBody(req);
            const body = parsePayload(raw, req.headers['content-type'] || '');

            // ── Auth ──
            // Token boleh lewat body JSON, header, atau query string.
            // Query string dipakai kalau body-nya teks notif polos.
            const qs = new URLSearchParams((req.url || '').split('?')[1] || '');
            const token = body.token || req.headers['x-webhook-token'] || qs.get('token');
            if (!secret || token !== secret) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
            }

            const text = body.text || body.notification || body.message || '';
            const amounts = parseAmounts(text);
            const conn = global.conn;

            if (!amounts.length) {
                // Deteksi magic text yang lolos mentah: user ngetik tangan, bukan
                // pilih dari tombol {} di MacroDroid, jadi placeholder ga diganti.
                if (/^\s*\{[a-z_]+\}\s*$/i.test(text)) {
                    console.log(`[PAYHOOK] ⚠️  Magic text MENTAH: "${text.trim()}" — di MacroDroid, isi Badan konten harus dipilih lewat tombol {} / "...", jangan diketik tangan.`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ ok: true, matched: false, reason: 'raw_magic_text' }));
                }
                console.log('[PAYHOOK] Notif masuk tapi tidak ada nominal terbaca:', JSON.stringify(text));
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ ok: true, matched: false, reason: 'no_amount' }));
            }

            // ── Matcher berlapis ──
            // 1) pending  → jalur normal, auto-settle & kirim stok.
            // 2) settled  → notif dobel, diamkan (HP standby suka retry POST).
            // 3) cancel   → pembayaran telat, ke jalur manual (tidak auto).
            let trx = null, matchedAmount = null, matchType = null;
            for (const amt of amounts) {
                const pending = storeDB.getPendingByAmount(amt);
                if (pending) { trx = pending; matchedAmount = amt; matchType = 'pending'; break; }

                const settled = storeDB.getSettledByAmount(amt);
                if (settled) { trx = settled; matchedAmount = amt; matchType = 'settled'; break; }

                const cancelled = storeDB.getCancelledByAmount(amt);
                if (cancelled) { trx = cancelled; matchedAmount = amt; matchType = 'cancel'; break; }
            }

            if (!trx) {
                console.log('[PAYHOOK] Tak ada transaksi cocok utk nominal:', amounts.join(', '));
                await notifyUnmatched(conn, amounts[0]);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ ok: true, matched: false, reason: 'no_match' }));
            }

            // Notif dobel: diam-diam saja, jangan spam owner ulang.
            if (matchType === 'settled') {
                console.log(`[PAYHOOK] Notif dobel Rp ${rp(matchedAmount)} → ${trx.invoice_id} (status: ${trx.status}) — abaikan.`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ ok: true, matched: false, invoice: trx.invoice_id, reason: 'duplicate' }));
            }

            // Pembayaran telat: uang mungkin masuk, tapi invoice sudah cancel.
            // JANGAN auto-settle. Suruh pembeli kirim SS, owner yang verifikasi
            // via .done / .batal (jalur manual yang sudah ada).
            if (matchType === 'cancel') {
                const minutesLate = Math.max(0, Math.round((Date.now() - new Date(trx.updated_at || trx.created_at).getTime()) / 60000));
                console.log(`[PAYHOOK] Rp ${rp(matchedAmount)} cocok ke ${trx.invoice_id} (CANCEL, telat ${minutesLate}m) → jalur manual.`);

                // Sapa pembeli langsung; owner + grup dikabari lewat notifyLatePayment.
                if (conn && trx.buyer_jid) {
                    await conn.sendMessage(trx.buyer_jid, {
                        text: `🕗 Pembayaran Rp ${rp(matchedAmount)} kami terima untuk invoice ${trx.invoice_id}, `
                            + `tapi invoicenya sudah kedaluwarsa dan otomatis dibatalkan.\n\n`
                            + `Tolong *kirim bukti transfer (screenshot mutasi)* ke chat ini biar admin bisa verifikasi manual. `
                            + `Kalau valid, pesanan akan tetap dikirim.`,
                        mentions: [trx.buyer_jid],
                    }).catch(() => {});
                }

                await notifyLatePayment(conn, {
                    invoiceId: trx.invoice_id,
                    buyerJid: trx.buyer_jid,
                    productName: trx.product_name,
                    amount: matchedAmount,
                    minutesLate,
                    chatJid: trx.chat_jid,
                    prefix: global.config?.prefix || '.',
                });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ ok: true, matched: true, invoice: trx.invoice_id, status: 'late_manual' }));
            }

            // matchType === 'pending' → jalur normal
            const result = await settlePaid(conn, trx.invoice_id, { source: 'gopay-webhook' });
            console.log(`[PAYHOOK] Rp ${rp(matchedAmount)} → ${trx.invoice_id} → ${result.ok ? result.status : result.reason}`);
            // Notif owner+grup sudah ditangani settlePaid(), jangan dobel di sini.

            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: true, matched: result.ok, invoice: trx.invoice_id, status: result.status || result.reason }));
        } catch (err) {
            console.error('[PAYHOOK] Error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: false, error: 'internal' }));
        }
    });

    server.on('error', (err) => {
        server = null;
        // EADDRINUSE biasanya cuma sesaat: proses lama belum lepas port saat
        // restart. Kalau tidak di-retry, auto-confirm mati diam-diam sampai
        // bot di-restart manual — pembayaran masuk tapi tidak pernah ke-settle.
        if (err.code === 'EADDRINUSE' && retry < MAX_RETRY) {
            retry++;
            console.error(`[PAYHOOK] Port ${port} masih dipakai, coba lagi ${retry}/${MAX_RETRY} dalam ${RETRY_DELAY_MS / 1000}s...`);
            setTimeout(() => startPaymentHook(), RETRY_DELAY_MS).unref?.();
            return;
        }
        console.error('[PAYHOOK] Server error:', err.message);
        if (err.code === 'EADDRINUSE') {
            console.error(`[PAYHOOK] ⛔ Webhook TIDAK aktif — auto-confirm pembayaran mati. Cek proses lain yang pakai port ${port}: ss -tlnp | grep ${port}`);
        }
    });

    server.listen(port, () => {
        retry = 0;
        console.log(`[PAYHOOK] Webhook pembayaran aktif di port ${port} (POST /gopay)`);
    });

    return server;
}

export function stopPaymentHook() {
    retry = MAX_RETRY; // batalkan retry yang masih terjadwal
    if (server) { server.close(); server = null; }
}
