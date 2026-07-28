/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 *
 * Manajer sesi interaktif terpusat. Bot punya beberapa flow yang sama-sama
 * bereaksi ke balasan angka (katalog, buy, topup, smm). Kalau dua sesi aktif
 * bersamaan untuk user yang sama, balasan angka bisa nyantol ke dua-duanya
 * (mis. "1" buat topup malah ikut buka katalog).
 *
 * Solusi: HANYA satu flow aktif per user. Begitu user memulai flow baru,
 * flow lain untuk user itu otomatis dibersihkan.
 */

// Semua penampung sesi interaktif yang berbasis balasan angka.
const FLOW_KEYS = ['katalogSession', 'buySession', 'topupSession', 'smmSession'];

/**
 * Mulai flow baru untuk user: bersihkan SEMUA sesi flow lain miliknya,
 * sisakan hanya `keepKey`. Panggil ini tepat sebelum menyimpan sesi flow baru.
 * @param {object} conn
 * @param {string} sender  jid user
 * @param {string} keepKey nama penampung sesi yang dipertahankan (mis. 'buySession')
 */
export function startFlow(conn, sender, keepKey) {
    if (!conn || !sender) return;
    for (const k of FLOW_KEYS) {
        if (k === keepKey) continue;
        if (conn[k] && conn[k][sender]) {
            // Bersihkan timer kalau ada (jaga-jaga sesi menyimpan setTimeout).
            const s = conn[k][sender];
            if (s && s.timer) { try { clearTimeout(s.timer); } catch {} }
            delete conn[k][sender];
        }
    }
}
