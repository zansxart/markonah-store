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
    logo: './assets/logo.jpg',
    thumbnail: './assets/thumbnail.jpg',
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
    // ── Webhook auto-confirm GoPay Merchant (baca notif GoBiz via HP standby) ──
    webhookToken: 'A2AxnnhkVOTg-gxoZ1gFEK_ieUvyJge8',  // token acak rahasia (jangan disebar)
    webhookPort: 3939,                        // port webhook (buka di firewall VPS)
};

// ═══════════════════════════════════════
// │  STORE SETTINGS
// ═══════════════════════════════════════

global.store = {
    autoSend: true,         // Otomatis kirim stok setelah bayar (jika stok tersedia)
    autoConfirm: true,      // Aktifkan webhook auto-confirm GoPay (false = manual acc saja)
    paymentTimeout: 300,    // Timeout pembayaran dalam detik (5 menit)
    notifGroup: '',         // Cadangan JID grup notif. Biarkan kosong: notif otomatis
                            // dikirim ke grup tempat transaksi dibuat. Isi hanya kalau
                            // mau SEMUA notif dipusatkan ke satu grup tertentu.
    welcomeMsg: true,       // Kirim pesan selamat datang ke pembeli baru
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
