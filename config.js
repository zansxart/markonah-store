/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */

import { watchFile, unwatchFile } from 'fs';
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
    numberBot: '6282328640486',
    pairingNumber: '6282328640486',
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
    logo: 'https://files.catbox.moe/k8fxoj.jpg',
    thumbnail: 'https://files.catbox.moe/9ibkfl.jpg',
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
    qris: '00020101021126570011ID.DANA.WWW011893600915357326135802095732613580303UMI51440014ID.CO.QRIS.WWW0215ID10233079409090303UMI5204899953033605802ID5907zansart6011Kab. Brebes6105522756304BB99',
    dana: '085802569316',
};

// ═══════════════════════════════════════
// │  STORE SETTINGS
// ═══════════════════════════════════════

global.store = {
    autoSend: true,         // Otomatis kirim stok setelah bayar (jika stok tersedia)
    paymentTimeout: 300,    // Timeout pembayaran dalam detik (5 menit)
    notifGroup: '120363235158363450@g.us',         // JID grup untuk notifikasi transaksi (kosong = ke owner)
    welcomeMsg: true,       // Kirim pesan selamat datang ke pembeli baru
};

// ═══════════════════════════════════════
// │  GLOBAL HELPERS
// ═══════════════════════════════════════

global.fetchBuffer = async (url, options) => {
    try {
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
