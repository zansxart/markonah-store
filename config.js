/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */

import { watchFile, unwatchFile, existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import * as functions from './core/services/system/function.js';

global.Func = functions;

// ═══════════════════════════════════════
// │  OWNER & MODERATOR
// ═══════════════════════════════════════

global.owner = '6285802569316';

global.mods = [
    [global.owner, 'zansxart', 'Real Owner'],
    ['6285802569316', 'zansxart', 'Real Owner']
];

// ═══════════════════════════════════════
// │  BOT CONFIGURATION
// ═══════════════════════════════════════

global.opts = global.opts || {};

global.setting = {
    cTmp: true,
    typing: false,
    online: false,
    resetLimit: false,
    groupOnly: false,
};

global.config = {
    sessions: 'sessions',
    useQR: false,
    prefix: '.', // default prefix, bisa diubah: '.', '!', '#', atau 'noprefix'
};

global.info = {
    numberBot: '6288980871033',
    pairingNumber: '6288980871033',
    nameBot: 'MARKONAH-STORE',
    nameOwn: 'Izan',
    numberOwn: global.owner,
    author: 'zansxart',
    wm: '© markonah-store',
    jid: '@s.whatsapp.net',
};

// ═══════════════════════════════════════
// │  MEDIA & URLs
// ═══════════════════════════════════════

global.media = {
    logo: './storage/assets/logo.jpg',
    thumbnail: './storage/assets/thumbnail.jpg',
};

// Thumbnail per-aksi. Tinggal taruh file dengan nama sesuai di storage/assets/.
// Kalau file-nya belum ada, otomatis fallback ke global.media.thumbnail,
// jadi aman walau belum semua gambar dibuat.
global.thumb = {
    menu:     './storage/assets/menu.jpg',       // tampilan menu utama
    katalog:  './storage/assets/katalog.jpg',    // daftar kategori & produk
    invoice:  './storage/assets/invoice.jpg',    // tagihan / QRIS pembayaran
    wait:     './storage/assets/wait.jpg',       // "mohon ditunggu / diproses"
    proses:   './storage/assets/proses.jpg',     // pesanan sedang diproses
    done:     './storage/assets/done.jpg',       // pesanan selesai / terkirim
    topup:    './storage/assets/topup.jpg',      // topup saldo berhasil
    gagal:    './storage/assets/gagal.jpg',      // pembayaran/proses gagal
};

global.url = {
    web: 'https://zansxart.me',
    sig: 'https://instagram.com/zansxart',
    sgc: 'https://chat.whatsapp.com/FLq42dyLTlw7sH9OGMDoeI',
};

// ═══════════════════════════════════════
// │  PAYMENT (QRIS DABIS)
// ═══════════════════════════════════════

global.payment = {
    qris: '00020101021126610014COM.GO-JEK.WWW01189360091438534824440210G8534824440303UMI51440014ID.CO.QRIS.WWW0215ID10254585814570303UMI5204597053033605802ID5908zansxart6006BREBES61055227562070703A0163043BAB',
    dana: '085802569316',
};

// ═══════════════════════════════════════
// │  STORE SETTINGS
// ═══════════════════════════════════════

global.store = {
    autoPayment: false,     // Payment gateway otomatis (belum jadi → user lihat "dalam pengembangan")
    paymentTimeout: 300,    // Timeout pembayaran dalam detik (5 menit)
    notifGroup: '',         // Cadangan JID grup notif. Biarkan kosong: notif otomatis
                            // dikirim ke grup tempat transaksi dibuat. Isi hanya kalau
                            // mau SEMUA notif dipusatkan ke satu grup tertentu.
    welcomeMsg: true,       // Kirim pesan selamat datang ke pembeli baru
};

// ═══════════════════════════════════════
// │  MEDANPEDIA SMM API CONFIGURATION
// ═══════════════════════════════════════

global.medanpedia = {
    apiId: '45811',              // Masukkan API ID dari akun Medanpedia Anda
    apiKey: '9tgelv-sdi3wu-6cum5y-dmri4c-qkfzib',             // Masukkan API Key dari akun Medanpedia Anda
    profitPercent: 30,      // Margin keuntungan % (contoh: 20 = profit +20% dari harga dasar)
    profitNominal: 5000,       // Margin keuntungan tetap Rp (opsional, misal: 2000 = +Rp 2.000)
};

// ═══════════════════════════════════════
// │  GLOBAL HELPERS
// ═══════════════════════════════════════

global.fetchBuffer = async (url, options) => {
    try {
        if (typeof url === 'string' && existsSync(url)) {
            return readFileSync(url);
        }
        const res = await fetch(url, {
            method: 'GET',
            headers: { 'DNT': 1, 'Upgrade-Insecure-Requests': 1 },
            ...options
        });
        if (res.status >= 400) throw new Error(`Request failed with status ${res.status}`);
        return Buffer.from(await res.arrayBuffer());
    } catch (err) {
        console.error(err);
        return null;
    }
};

// ═══════════════════════════════════════
// │  HOT RELOAD
// ═══════════════════════════════════════

const file = fileURLToPath(import.meta.url);
watchFile(file, () => {
    unwatchFile(file);
    console.log(chalk.redBright(`[SYSTEM] config.js updated. Reloading...`));
    import(`${file}?update=${Date.now()}`);
});
