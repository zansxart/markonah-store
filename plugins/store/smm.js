/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 *
 * Plugin Katalog & Pemesanan Jasa Sosial Media (Dengan Platform Aliases & Direct Command)
 */

import { storeDB } from '../../lib/store-db.js';
import { rp, generateInvoiceId, usage, copyable } from '../../lib/format.js';
import { createQRIS } from '../../lib/qris.js';
import { notifyNewOrder } from '../../lib/store-notify.js';
import medanpedia from '../../lib/medanpedia.js';
import QRCode from 'qrcode';

// Cache untuk layanan
let servicesCache = null;
let lastCacheTime = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 menit

async function getCachedServices() {
    const now = Date.now();
    if (servicesCache && (now - lastCacheTime < CACHE_TTL)) {
        return { ok: true, data: servicesCache };
    }
    const res = await medanpedia.getServices();
    if (res.ok && Array.isArray(res.data)) {
        servicesCache = res.data;
        lastCacheTime = now;
        return { ok: true, data: servicesCache };
    }
    return res;
}

const PLATFORMS = [
    { key: 'instagram', aliases: ['ig', 'instagram'], name: 'INSTAGRAM', emoji: '📸' },
    { key: 'tiktok', aliases: ['tt', 'tiktok'], name: 'TIKTOK', emoji: '🎵' },
    { key: 'youtube', aliases: ['yt', 'youtube'], name: 'YOUTUBE', emoji: '🎬' },
    { key: 'facebook', aliases: ['fb', 'facebook'], name: 'FACEBOOK', emoji: '📘' },
    { key: 'twitter', aliases: ['tw', 'twitter', 'x'], name: 'TWITTER / X', emoji: '🐦' },
    { key: 'telegram', aliases: ['tg', 'telegram'], name: 'TELEGRAM', emoji: '✈️' },
    { key: 'whatsapp', aliases: ['wa', 'whatsapp'], name: 'WHATSAPP', emoji: '🟢' },
    { key: 'ecommerce', aliases: ['shop', 'shopee', 'tokopedia'], name: 'SHOPEE & TOKOPEDIA', emoji: '🛒' },
    { key: 'other', aliases: ['lainnya', 'other'], name: 'LAINNYA (Spotify, Discord, Threads, dll)', emoji: '⚡' },
];

function getMasterPlatformKey(catName = '') {
    const name = catName.toLowerCase();
    if (name.includes('instagram') || name.includes('ig')) return 'instagram';
    if (name.includes('tiktok') || name.includes('tt')) return 'tiktok';
    if (name.includes('youtube') || name.includes('yt')) return 'youtube';
    if (name.includes('facebook') || name.includes('fb')) return 'facebook';
    if (name.includes('twitter') || name.includes('tweet') || name.includes('x ')) return 'twitter';
    if (name.includes('telegram') || name.includes('tg')) return 'telegram';
    if (name.includes('whatsapp') || name.includes('wa')) return 'whatsapp';
    if (name.includes('shopee') || name.includes('tokopedia') || name.includes('bukalapak') || name.includes('lazada')) return 'ecommerce';
    return 'other';
}

function findPlatform(input = '') {
    if (!input) return null;
    const str = input.toLowerCase().trim();
    const idx = parseInt(str) - 1;
    if (!isNaN(idx) && idx >= 0 && idx < PLATFORMS.length) {
        return PLATFORMS[idx];
    }
    return PLATFORMS.find(pf => pf.key === str || pf.aliases.includes(str) || pf.name.toLowerCase().includes(str));
}

let handler = async (m, { conn, args, usedPrefix, command, isOwner }) => {
    const cmd = command.toLowerCase();
    const p = usedPrefix !== undefined && usedPrefix !== null ? usedPrefix : '';

    // ── 1. CEK SALDO PROVIDER OWNER (.medansaldo) ──
    if (cmd === 'medansaldo' || cmd === 'ceksaldomedan') {
        if (!isOwner) return m.reply(`❌ Perintah ini hanya untuk Owner.`);
        let prof = await medanpedia.getProfile();
        if (!prof.ok) return m.reply(`❌ ${prof.msg}`);

        let data = prof.data;
        let txt = `\`SALDO DEPOSIT PROVIDER OWNER\`\n\n`;
        txt += `↳ *Akun Provider:* ${data.username || data.name || 'Owner'}\n`;
        txt += `↳ *Sisa Saldo:* *Rp ${rp(data.balance)}*\n`;
        return m.reply(txt);
    }

    // ── 2. CEK STATUS ORDER SOSMED (.ceksosmed <order_id>) ──
    if (cmd === 'ceksosmed' || cmd === 'smmstatus' || cmd === 'cekordersmm') {
        if (!args[0]) return m.reply(`❌ Masukkan ID Pesanan Sosmed Anda.\nContoh: *${p}${command} 102938*`);
        let orderId = args[0].replace(/[^0-9]/g, '');

        m.reply(`🔄 Sedang mengecek status pesanan #${orderId}...`);
        let res = await medanpedia.checkStatus(orderId);
        if (!res.ok) return m.reply(`❌ ${res.msg}`);

        let d = res.data;
        let statusEmoji = d.status === 'Success' ? '✅' : (d.status === 'Pending' ? '⏳' : (d.status === 'Processing' ? '🔄' : 'ℹ️'));
        let txt = `\`STATUS PESANAN JASA SOSMED\`\n\n`;
        txt += `↳ *ID Pesanan:* #${d.id}\n`;
        txt += `↳ *Status:* ${statusEmoji} ${d.status}\n`;
        txt += `↳ *Jumlah Awal:* ${d.start_count || 0}\n`;
        txt += `↳ *Sisa Pengerjaan:* ${d.remaint || d.remains || 0}\n`;

        return m.reply(txt);
    }

    // ── 3. UBAH SETTING PROFIT SOSMED OWNER (.setsmmprofit <persen>) ──
    if (cmd === 'setsmmprofit') {
        if (!isOwner) return m.reply(`❌ Perintah ini hanya untuk Owner.`);
        if (!args[0]) return m.reply(`❌ Masukkan margin persentase profit.\nContoh: *${p}${command} 25* (untuk profit 25%)`);
        let pct = parseFloat(args[0]);
        if (isNaN(pct) || pct < 0) return m.reply(`❌ Margin profit harus angka >= 0.`);

        if (!global.medanpedia) global.medanpedia = {};
        global.medanpedia.profitPercent = pct;
        return m.reply(`✅ Profit Jasa Sosmed berhasil diubah menjadi *+${pct}%* dari harga modal.`);
    }

    // ── 4. CARI JASA SOSMED (.carisosmed <keyword>) ──
    if (cmd === 'carisosmed' || cmd === 'smmcari') {
        if (!args[0]) return m.reply(`❌ Masukkan kata kunci pencarian.\nContoh: *${p}${command} instagram followers*`);
        let query = args.join(' ').toLowerCase();

        m.reply(`🔎 Sedang mencari layanan "${query}"...`);
        let res = await getCachedServices();
        if (!res.ok) return m.reply(`❌ ${res.msg}`);

        let matches = res.data.filter(s =>
            (s.name && s.name.toLowerCase().includes(query)) ||
            (s.category && s.category.toLowerCase().includes(query)) ||
            (s.id && String(s.id) === query)
        );

        if (!matches.length) return m.reply(`❌ Tidak ditemukan layanan sosmed yang cocok dengan kata kunci "${query}".`);

        let txt = `\`HASIL PENCARIAN JASA SOSMED (${matches.length})\`\n\n`;
        matches.slice(0, 15).forEach((s) => {
            let sellPrice = medanpedia.calculatePrice(s.price, 1000);
            txt += `↳ 🛍️ *[ID ${s.id}]* ${s.name}\n`;
            txt += `  Harga: *Rp ${rp(sellPrice)}* / 1.000  |  Min: ${s.min}  Max: ${s.max}\n`;
            txt += `  Order: *${p}belisosmed ${s.id} <target> <jumlah>*\n\n`;
        });

        if (matches.length > 15) txt += `_Menampilkan 15 dari ${matches.length} hasil pencarian._\n\n\n`;
        txt += `_Tertarik dengan layanan di atas? Yuk langsung pesan dengan format di atas kak!_`;
        return m.reply(txt);
    }

    // ── 5. KATALOG JASA SOSIAL MEDIA TERSTRUKTUR (.sosmed / .instagram / .facebook / .tiktok / dll) ──
    let isDirectPlatformCmd = ['instagram', 'ig', 'tiktok', 'tt', 'youtube', 'yt', 'facebook', 'fb', 'telegram', 'tg', 'twitter', 'tw'].includes(cmd);

    let res = await getCachedServices();
    if (!res.ok) return m.reply(`❌ ${res.msg}`);

    let services = res.data;

    // Grouping berdasarkan Master Platform
    let platformMap = {};
    PLATFORMS.forEach(pf => { platformMap[pf.key] = []; });

    services.forEach(s => {
        let pKey = getMasterPlatformKey(s.category);
        if (!platformMap[pKey]) platformMap[pKey] = [];
        platformMap[pKey].push(s);
    });

    // Jika dipanggil via direct command (misal: .facebook 15 atau .fb 15 atau .ig 2)
    let effectiveArgs = isDirectPlatformCmd ? [cmd, ...args] : args;

    // ── TINGKAT 1: JIKA TANPA ARGUMEN → TAMPILKAN 9 PLATFORM UTAMA ──
    if (!effectiveArgs[0]) {
        let txt = `\`KATALOG JASA SOSIAL MEDIA\`\n\n`;
        txt += `Pilihan Platform Sosial Media terlengkap (balas angkanya):\n\n`;

        PLATFORMS.forEach((pf, i) => {
            let count = platformMap[pf.key]?.length || 0;
            txt += `${i + 1}. ${pf.emoji} *${pf.name}* _(${count} Layanan)_\n`;
        });

        txt += `\n*Cara Akses:* Ketik *${p}${command} <nomor_atau_nama_platform>*\n`;
        txt += `Bisa juga ketik *${p}instagram*, *${p}tiktok*, *${p}youtube*, dll.\n\n\n`;
        txt += `_Mau optimasi sosmed yang mana nih kak? Silakan pilih platform di atas ya!_`;

        return m.reply(txt);
    }

    // ── TINGKAT 2: PILIH PLATFORM (misal: .sosmed facebook, .fb, .sosmed 4) ──
    let userPfInput = effectiveArgs[0];
    let selectedPlatform = findPlatform(userPfInput);

    if (!selectedPlatform) {
        return m.reply(`❌ Platform "${userPfInput}" tidak ditemukan. Ketik *${p}sosmed* untuk melihat daftar platform.`);
    }

    let pfServices = platformMap[selectedPlatform.key] || [];
    if (!pfServices.length) return m.reply(`ℹ️ Belum ada layanan tersedia untuk platform ${selectedPlatform.name}.`);

    // Dapatkan sub-kategori unik dari platform terpilih
    let subCategories = [...new Set(pfServices.map(s => s.category))].filter(Boolean);

    // Jika user cuma ngetik .sosmed facebook atau .fb -> tampilkan daftar Sub-Kategori di Platform tsb
    if (effectiveArgs.length === 1) {
        let displayCmd = isDirectPlatformCmd ? `${p}${userPfInput}` : `${p}${command} ${userPfInput}`;

        let txt = `\`JASA ${selectedPlatform.name}\` ${selectedPlatform.emoji}\n\n`;
        txt += `Silakan pilih sub-kategori layanan di bawah (balas angkanya):\n\n`;

        subCategories.forEach((cat, idx) => {
            let catCount = pfServices.filter(s => s.category === cat).length;
            txt += `${idx + 1}. 🏷️ *${cat}* _(${catCount} Layanan)_\n`;
        });

        txt += `\n*Cara Pilih:* Ketik *${displayCmd} <nomor_subkategori>*\n\n\n`;
        txt += `_Mau tambah followers, likes, atau views kak? Pilih kategorinya di atas ya!_`;

        return m.reply(txt);
    }

    // Jika user ngetik .sosmed facebook 15 atau .fb 15 (buka sub-kategori 15)
    let subInput = effectiveArgs[1];
    let subIndex = parseInt(subInput) - 1;
    let selectedSubCat = null;

    if (!isNaN(subIndex) && subIndex >= 0 && subIndex < subCategories.length) {
        selectedSubCat = subCategories[subIndex];
    } else {
        let subSearch = effectiveArgs.slice(1).join(' ').toLowerCase();
        selectedSubCat = subCategories.find(c => c.toLowerCase().includes(subSearch));
    }

    if (!selectedSubCat) {
        let displayCmd = isDirectPlatformCmd ? `${p}${userPfInput}` : `${p}${command} ${userPfInput}`;
        return m.reply(`❌ Sub-kategori "${effectiveArgs.slice(1).join(' ')}" tidak ditemukan.\nKetik *${displayCmd}* untuk melihat daftar sub-kategori.`);
    }

    let targetServices = pfServices.filter(s => s.category === selectedSubCat);

    let txt = `\`${selectedSubCat.toUpperCase()}\`\n\n`;
    txt += `Daftar Layanan Tersedia (${targetServices.length}):\n\n`;

    targetServices.forEach((s, idx) => {
        let sellPrice = medanpedia.calculatePrice(s.price, 1000);
        txt += `↳ 🏷️ *[ID ${s.id}]* ${s.name}\n`;
        txt += `  Harga: *Rp ${rp(sellPrice)}* / 1.000  |  Min: ${s.min}  Max: ${s.max}\n`;
        txt += `  Order: *${p}belisosmed ${s.id} <target> <jumlah>*\n\n`;
    });

    txt += `*Cara Pemesanan:* Ketik *${p}belisosmed <id> <target> <jumlah>*\n`;
    txt += `Contoh: *${p}belisosmed ${targetServices[0]?.id || '102'} @target 1000*\n\n\n`;
    txt += `_Siap melesatkan sosmed kamu kak! Langsung ketik format pemesanan di atas ya!_`;

    return m.reply(txt);

    return m.reply(txt);
};

handler.help = [
    'sosmed [platform] [subkategori]',
    'facebook [subkategori]',
    'instagram [subkategori]',
    'tiktok [subkategori]',
    'youtube [subkategori]',
    'telegram [subkategori]',
    'carisosmed <keyword>',
    'belisosmed <id_layanan> <target> <jumlah>',
    'ceksosmed <order_id>'
];
handler.command = [
    'sosmed', 'jasasosmed', 'sosmedkatalog',
    'facebook', 'fb',
    'instagram', 'ig',
    'tiktok', 'tt',
    'youtube', 'yt',
    'telegram', 'tg',
    'twitter', 'tw',
    'carisosmed', 'smmcari',
    'belisosmed', 'ordersosmed', 'ordersmm', 'belismm', 'smmorder',
    'ceksosmed', 'smmstatus', 'cekordersmm',
    'smm', 'medanpedia', 'smmkatalog',
    'medansaldo', 'ceksaldomedan',
    'setsmmprofit'
];
handler.tags = ['store'];
export default handler;
