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
