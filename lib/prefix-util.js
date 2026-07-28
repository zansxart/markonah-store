/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 *
 * Util resolusi prefix — satu sumber kebenaran untuk setprefix.js, main.js, dan handler.js
 * biar nilai "noprefix" / "multi" nggak diperlakukan sebagai regex literal yang bikin bot diem.
 */

// Multi-prefix: cocokkan bila pesan diawali salah satu simbol umum ini.
export const MULTI_PREFIX_REGEX = /^[°•π÷×¶∆£¢€¥®™+✓_=|~!?@#$%^&.©^]/;

/**
 * @param {string} raw nilai mentah dari user / DB
 * @returns {{ mode: 'noprefix'|'multi'|'single', prefix: string|RegExp, store: string }}
 *   - prefix : nilai runtime untuk global.prefix / conn.prefix
 *   - store  : string yang disimpan permanen ke SQLite
 */
export function resolvePrefix(raw) {
    const value = String(raw ?? '').trim();
    const lower = value.toLowerCase();

    if (lower === 'noprefix') {
        return { mode: 'noprefix', prefix: 'noprefix', store: 'noprefix' };
    }
    if (lower === 'multi') {
        return { mode: 'multi', prefix: MULTI_PREFIX_REGEX, store: 'multi' };
    }

    const single = value || '.';
    return { mode: 'single', prefix: single, store: single };
}

/**
 * True bila mode aktif adalah "tanpa prefix" — command boleh dijalankan tanpa awalan.
 */
export function isNoPrefixMode(source) {
    return typeof source === 'string' && source.toLowerCase() === 'noprefix';
}

/**
 * Prefix untuk DITAMPILKAN ke user (di contoh command / tombol copy).
 * Aman untuk semua mode:
 *   - noprefix → '' (command diketik tanpa awalan)
 *   - multi    → '.' (contoh pakai titik, salah satu simbol yang diterima)
 *   - single   → prefix-nya sendiri
 * Jangan pakai `global.config.prefix` mentah untuk contoh — di mode noprefix/multi
 * isinya string 'noprefix' / regex, bikin output jadi `noprefixtopup`.
 * @param {string} [used] usedPrefix dari context (kalau ada, itu yang paling akurat)
 */
export function displayPrefix(used) {
    if (typeof used === 'string' && used) return used; // prefix yang benar-benar dipakai user
    const raw = String(global.config?.prefix ?? '');
    if (isNoPrefixMode(raw) || used === '') return '';   // mode tanpa prefix
    if (raw === 'multi' || global.config?.prefix instanceof RegExp) return '.';
    return raw || '.';
}
