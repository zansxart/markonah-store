/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */

import { watchFile, unwatchFile, existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import * as functions from './core/services/system/function.js';

global.Func = functions;

global.owner = '6285802569316';

global.mods = [
    [global.owner, 'zansxart', 'Real Owner'],
    ['6285802569316', 'zansxart', 'Real Owner']
];

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
    prefix: '.',
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

global.media = {
    logo: './storage/assets/logo.jpg',
    thumbnail: './storage/assets/thumbnail.jpg',
};

global.thumb = {
    menu:      './storage/assets/menu.jpg',
    katalog:   './storage/assets/katalog.jpg',
    invoice:   './storage/assets/invoice.jpg',
    wait:      './storage/assets/wait.jpg',
    proses:    './storage/assets/proses.jpg',
    done:      './storage/assets/done.jpg',
    topup:     './storage/assets/topup.jpg',
    gagal:     './storage/assets/gagal.jpg',
    diterima:  './storage/assets/diterima.jpg',
    sosmed:    './storage/assets/sosmed.jpg',
    instagram: './storage/assets/instagram.jpg',
    tiktok:    './storage/assets/tiktok.jpg',
    youtube:   './storage/assets/youtube.jpg',
    facebook:  './storage/assets/facebook.jpg',
    twitter:   './storage/assets/twitter.jpg',
    telegram:  './storage/assets/telegram.jpg',
    whatsapp:  './storage/assets/whatsapp.jpg',
    ecommerce: './storage/assets/ecommerce.jpg',
};

global.url = {
    web: 'https://zansxart.me',
    sig: 'https://instagram.com/zansxart',
    sgc: 'https://chat.whatsapp.com/FLq42dyLTlw7sH9OGMDoeI',
};

global.payment = {
    qris: '00020101021126610014COM.GO-JEK.WWW01189360091438534824440210G8534824440303UMI51440014ID.CO.QRIS.WWW0215ID10254585814570303UMI5204597053033605802ID5908zansxart6006BREBES61055227562070703A0163043BAB',
    dana: '085802569316',
};

global.store = {
    autoPayment: false,
    paymentTimeout: 300,
    notifGroup: '',
    welcomeMsg: true,
};

global.medanpedia = {
    apiId: '45811',
    apiKey: '9tgelv-sdi3wu-6cum5y-dmri4c-qkfzib',
    profitPercent: 30,
    profitNominal: 5000,
};

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

const file = fileURLToPath(import.meta.url);
watchFile(file, () => {
    unwatchFile(file);
    console.log(chalk.redBright(`[SYSTEM] config.js updated. Reloading...`));
    import(`${file}?update=${Date.now()}`);
});
