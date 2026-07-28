/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */

/**
 * Format angka dengan titik pemisah ribuan
 * @param {number|string} x
 * @returns {string} e.g. 50000 -> "50.000"
 */
export function rp(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Bungkus teks jadi inline monospace WhatsApp (```teks```). Di WA klien modern
 * ini bikin teks bisa di-tap-hold → Copy tanpa perlu seleksi manual — jauh
 * lebih enak daripada ngetik ulang invoice ID / command.
 * @param {string|number} x
 * @returns {string}
 */
export function copyable(x) {
    return '```' + String(x) + '```';
}

/**
 * Ambil Invoice ID dari argumen command ATAU dari pesan yang di-reply.
 * Biar owner nggak perlu ngetik kode invoice — tinggal reply pesan bot yang
 * memuat invoice (mis. notif "SIAPKAN PESANAN"), lalu ketik .proses / .done / .batal.
 * @param {object} m       objek pesan (butuh m.quoted)
 * @param {string} [arg]   argumen pertama command (args[0]), diprioritaskan kalau ada
 * @returns {string|null}  invoice ID (uppercase) atau null kalau tidak ketemu
 */
export function resolveInvoice(m, arg) {
    const pick = (s) => {
        const match = String(s || '').match(/INV-[A-Z0-9]+/i);
        return match ? match[0].toUpperCase() : null;
    };
    // Argumen eksplisit menang; kalau kosong, cari di teks pesan yang di-reply.
    if (arg) return pick(arg) || arg.toUpperCase();
    if (m?.quoted) return pick(m.quoted.text || m.quoted.caption || '');
    return null;
}

/**
 * Generate Invoice ID unik & pendek (biar gampang diketik/dicari)
 * @returns {string} e.g. "INV-K7P2"
 */
export function generateInvoiceId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // tanpa 0/O/1/I biar tidak ambigu
    let id = 'INV-';
    for (let i = 0; i < 4; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

/**
 * Format tanggal ke bahasa Indonesia
 * @param {Date} date 
 * @returns {string} e.g. "24 Juli 2026"
 */
export function formatDate(date = new Date()) {
    return date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Jakarta'
    });
}

/**
 * Format waktu WIB
 * @param {Date} date
 * @returns {string} e.g. "07:42 WIB"
 */
export function formatTime(date = new Date()) {
    return date.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Jakarta'
    }) + ' WIB';
}

/**
 * Format durasi dari detik
 * @param {number} seconds
 * @returns {string} e.g. "5 menit"
 */
export function formatDuration(seconds) {
    if (seconds < 60) return `${seconds} detik`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} menit`;
    return `${Math.floor(seconds / 3600)} jam ${Math.floor((seconds % 3600) / 60)} menit`;
}

/**
 * Emoji status berdasarkan status transaksi
 * @param {string} status
 * @returns {string}
 */
export function statusEmoji(status) {
    const map = {
        'pending': '⏳',
        'paid': '💰',
        'process': '🔄',
        'done': '✅',
        'cancel': '❌',
    };
    return map[status] || '❓';
}

/**
 * Bikin pesan panduan pemakaian command yang seragam.
 * Dipakai saat command dipanggil tanpa/dengan argumen yang salah.
 * @param {object} opt
 * @param {string} opt.prefix   Prefix aktif (fallback '.')
 * @param {string} opt.command  Nama command yang dipakai
 * @param {string} opt.desc     Fungsi singkat command
 * @param {string} opt.format   Pola argumen, mis. "<id>|<nama>|<harga>"
 * @param {string|string[]} opt.examples  Satu/lebih contoh argumen
 * @param {string} [opt.note]   Catatan tambahan (opsional)
 * @returns {string}
 */
export function usage({ prefix = '.', command = '', desc = '', format = '', examples = [], note = '' }) {
    const p = prefix !== undefined && prefix !== null ? prefix : '.';
    const ex = (Array.isArray(examples) ? examples : [examples])
        .filter(e => e !== undefined && e !== null)
        .map(e => `↳ ${p}${command}${e ? ' ' + e : ''}`)
        .join('\n');
    return `\`PETUNJUK PENGGUNAAN\`\n\n` +
        `↳ *Deskripsi:* ${desc}\n` +
        `↳ *Format:* ${p}${command}${format ? ' ' + format : ''}\n\n` +
        `*Contoh:* \n${ex}${note ? `\n\n_Catatan: ${note}_` : ''}\n\n\n` +
        `_Silakan ikuti format di atas ya!_`;
}
