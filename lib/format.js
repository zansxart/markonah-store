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
 * Generate Invoice ID unik
 * @returns {string} e.g. "INV-A3F2K9"
 */
export function generateInvoiceId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = 'INV-';
    for (let i = 0; i < 6; i++) {
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
