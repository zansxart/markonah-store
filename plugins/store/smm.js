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
import { replyThumb } from '../../lib/ui.js';
import { startFlow } from '../../lib/session.js';
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
    { key: 'ecommerce', aliases: ['shop', 'shopee', 'tokopedia'], name: 'SHOPEE & TOKOPEDIA', emoji: '🛒' },
    { key: 'facebook', aliases: ['fb', 'facebook'], name: 'FACEBOOK', emoji: '📘' },
    { key: 'instagram', aliases: ['ig', 'instagram'], name: 'INSTAGRAM', emoji: '📸' },
    { key: 'telegram', aliases: ['tg', 'telegram'], name: 'TELEGRAM', emoji: '✈️' },
    { key: 'tiktok', aliases: ['tt', 'tiktok'], name: 'TIKTOK', emoji: '🎵' },
    { key: 'twitter', aliases: ['tw', 'twitter', 'x'], name: 'TWITTER / X', emoji: '🐦' },
    { key: 'whatsapp', aliases: ['wa', 'whatsapp'], name: 'WHATSAPP', emoji: '🟢' },
    { key: 'youtube', aliases: ['yt', 'youtube'], name: 'YOUTUBE', emoji: '🎬' },
    { key: 'other', aliases: ['lainnya', 'other'], name: 'LAINNYA (Spotify, Discord, Threads, dll)', emoji: '⚡' },
];

function getMasterPlatformKey(catName = '') {
    const name = catName.toLowerCase();

    // 1. Cek nama platform lengkap terlebih dahulu
    if (name.includes('instagram')) return 'instagram';
    if (name.includes('tiktok')) return 'tiktok';
    if (name.includes('youtube')) return 'youtube';
    if (name.includes('facebook')) return 'facebook';
    if (name.includes('twitter') || name.includes('tweet') || /\bx\b/.test(name)) return 'twitter';
    if (name.includes('telegram')) return 'telegram';
    if (name.includes('whatsapp')) return 'whatsapp';
    if (name.includes('shopee') || name.includes('tokopedia') || name.includes('bukalapak') || name.includes('lazada')) return 'ecommerce';

    // 2. Cek singkatan dengan Word Boundary (\b) agar 'twitter' tidak kena 'tt'
    if (/\b(ig)\b/i.test(name)) return 'instagram';
    if (/\b(tt)\b/i.test(name)) return 'tiktok';
    if (/\b(yt)\b/i.test(name)) return 'youtube';
    if (/\b(fb)\b/i.test(name)) return 'facebook';
    if (/\b(tw)\b/i.test(name)) return 'twitter';
    if (/\b(tg)\b/i.test(name)) return 'telegram';
    if (/\b(wa)\b/i.test(name)) return 'whatsapp';

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
        return replyThumb(conn, m, txt, 'katalog');
    }

    // ── 2. CEK STATUS ORDER SOSMED (.ceksosmed <order_id>) ──
    if (cmd === 'ceksosmed' || cmd === 'smmstatus' || cmd === 'cekordersmm') {
        if (!args[0]) return m.reply(`❌ Masukkan ID Pesanan Sosmed Anda.\nContoh: *${p}${command} 102938*`);
        let orderId = args[0].replace(/[^0-9]/g, '');

        m.reply(`🔎 Sedang mengecek status pesanan #${orderId}...`);
        let res = await medanpedia.checkStatus(orderId);
        if (!res.ok) return m.reply(`❌ ${res.msg}`);

        let d = res.data;
        let statusEmoji = d.status === 'Success' ? '✅' : (d.status === 'Pending' ? '⏳' : (d.status === 'Processing' ? '🔄' : 'ℹ️'));
        let txt = `\`STATUS PESANAN JASA SOSMED\`\n\n`;
        txt += `↳ *ID Pesanan:* #${d.id}\n`;
        txt += `↳ *Status:* ${statusEmoji} ${d.status}\n`;
        txt += `↳ *Jumlah Awal:* ${d.start_count || 0}\n`;
        txt += `↳ *Sisa Pengerjaan:* ${d.remaint || d.remains || 0}\n`;

        return replyThumb(conn, m, txt, 'katalog');
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

        let services = res.data;
        let matches = services.filter((s) =>
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
        return replyThumb(conn, m, txt, 'katalog');
    }

    // ── 5. BELI JASA SOSMED (.belisosmed <id_layanan> <target> <jumlah>) ──
    if (['belisosmed', 'ordersosmed', 'ordersmm', 'belismm', 'smmorder'].includes(cmd)) {
        if (!args[0] || !args[1] || !args[2]) {
            return replyThumb(conn, m, usage({
                prefix: p, command,
                desc: 'Order Jasa Sosial Media (Followers, Likes, Views, dll)',
                format: '<id_layanan> <target> <jumlah>',
                examples: ['102 @username 1000', '450 https://instagram.com/p/xxx 500'],
                note: 'Cari ID layanan di katalog dengan *' + p + 'sosmed* atau *' + p + 'carisosmed <keyword>*.',
            }), 'katalog');
        }

        let serviceId = args[0].trim();
        let target = args[1].trim();
        let qty = parseInt(args[2].replace(/[^0-9]/g, ''));

        if (isNaN(qty) || qty < 1) {
            return replyThumb(conn, m, `❌ Jumlah pesanan harus berupa angka murni minimal 1.`, 'gagal');
        }

        let sRes = await getCachedServices();
        if (!sRes.ok) return replyThumb(conn, m, `❌ Gagal mengambil data layanan provider: ${sRes.msg}`, 'gagal');

        let service = sRes.data.find(s => String(s.id) === String(serviceId));
        if (!service) {
            return replyThumb(conn, m, `❌ Layanan Sosmed dengan ID #${serviceId} tidak ditemukan! Ketik *${p}carisosmed <keyword>* untuk mencari ID layanan.`, 'gagal');
        }

        let min = parseInt(service.min || 1);
        let max = parseInt(service.max || 1000000);
        if (qty < min || qty > max) {
            return replyThumb(conn, m, `❌ Jumlah pesanan untuk *${service.name}* minimal *${rp(min)}* dan maksimal *${rp(max)}*.`, 'gagal');
        }

        let totalPrice = medanpedia.calculatePrice(service.price, qty);
        let user = storeDB.getOrCreateUser(m.sender, m.pushName || 'User');
        let platformKey = getMasterPlatformKey(service.category);

        if (user.balance < totalPrice) {
            let kurang = totalPrice - user.balance;
            let txt = `\`SALDO TIDAK CUKUP\`\n\n` +
                `↳ 🛍️ *Layanan:* ${service.name}\n` +
                `↳ 🔢 *Jumlah:* ${rp(qty)}\n` +
                `↳ 💰 *Total Harga:* Rp ${rp(totalPrice)}\n` +
                `↳ 💳 *Saldo Anda:* Rp ${rp(user.balance)}\n` +
                `↳ ⚠️ *Kekurangan:* Rp ${rp(kurang)}\n\n` +
                `Isi saldo dulu dengan ketik:\n` +
                `${copyable(`${p}topup ${kurang}`)}\n\n\n` +
                `_Silakan melakukan topup saldo deposit terlebih dahulu ya kak!_`;
            return replyThumb(conn, m, txt, 'gagal');
        }

        // Potong saldo user
        storeDB.updateUserBalance(m.sender, -totalPrice);

        let invId = generateInvoiceId();
        storeDB.createTransaction({
            invoice_id: invId,
            buyer_jid: m.sender,
            chat_jid: m.chat,
            product_id: `smm_${service.id}`,
            product_name: service.name,
            qty: qty,
            price_per_item: totalPrice / qty,
            total_price: totalPrice,
            status: 'paid',
            trx_type: 'smm',
        });

        await replyThumb(conn, m, `🔄 Sedang mengirim pesanan *${service.name}* ke server provider...`, platformKey);

        let orderRes = await medanpedia.createOrder(service.id, target, qty);

        if (orderRes.ok) {
            let orderId = orderRes.data?.id || orderRes.data?.order_id || 'OK';
            let txtSuccess = `\`PESANAN SOSMED DIPROSES\`\n\n` +
                `↳ 🧾 *Invoice:* ${copyable(invId)}\n` +
                `↳ 🛍️ *Layanan:* ${service.name}\n` +
                `↳ 🎯 *Target:* ${target}\n` +
                `↳ 🔢 *Jumlah:* ${rp(qty)}\n` +
                `↳ 💰 *Total Harga:* Rp ${rp(totalPrice)}\n` +
                `↳ 🆔 *Order ID:* #${orderId}\n` +
                `↳ 📊 *Status:* 🔄 Diproses\n\n\n` +
                `_Cek status pengerjaan kapan saja dengan ketik *${p}ceksosmed ${orderId}*_`;

            await replyThumb(conn, m, txtSuccess, platformKey);

            // Notif owner & grup
            notifyNewOrder(conn, { invoiceId: invId, buyerJid: m.sender, productName: service.name, total: totalPrice, chatJid: m.chat });
            return;
        } else {
            // Refund saldo jika order provider gagal
            storeDB.updateUserBalance(m.sender, totalPrice);
            storeDB.updateTransactionStatus(invId, 'cancel');

            let txtFail = `\`PESANAN GAGAL - SALDO DI-REFUND\`\n\n` +
                `↳ 🛍️ *Layanan:* ${service.name}\n` +
                `↳ ❌ *Alasan Gagal:* ${orderRes.msg}\n` +
                `↳ 💳 *Saldo:* Dikembalikan (Rp ${rp(totalPrice)})\n\n\n` +
                `_Saldo Anda telah dikembalikan secara otomatis kak._`;
            return replyThumb(conn, m, txtFail, 'gagal');
        }
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
            txt += `${i + 1}. 🛍️ *${pf.name}* ${pf.emoji} _(${count} Layanan)_\n`;
        });

        txt += `\n*Cara Akses:* Balas angka di atas (contoh: *1*) atau ketik *${p}${command} <nomor_atau_nama_platform>*\n`;
        txt += `Bisa juga ketik *${p}instagram*, *${p}tiktok*, *${p}youtube*, dll.\n\n\n`;
        txt += `_Mau optimasi sosmed yang mana nih kak? Silakan pilih platform di atas ya!_`;

        // Simpan sesi level 1
        conn.smmSession = conn.smmSession || {};
        startFlow(conn, m.sender, 'smmSession');
        conn.smmSession[m.sender] = {
            level: 1,
            expires: Date.now() + 5 * 60 * 1000,
        };

        return replyThumb(conn, m, txt, 'sosmed');
    }

    // ── TINGKAT 2: PILIH PLATFORM (misal: .sosmed facebook, .fb, .sosmed 4) ──
    let userPfInput = effectiveArgs[0];
    let selectedPlatform = findPlatform(userPfInput);

    if (!selectedPlatform) {
        return m.reply(`❌ Platform "${userPfInput}" tidak ditemukan. Ketik *${p}sosmed* untuk melihat daftar platform.`);
    }

    let pfServices = platformMap[selectedPlatform.key] || [];
    if (!pfServices.length) return m.reply(`ℹ️ Belum ada layanan tersedia untuk platform ${selectedPlatform.name}.`);

    // Dapatkan sub-kategori unik dari platform terpilih (diurutkan A-Z)
    let subCategories = [...new Set(pfServices.map(s => s.category))].filter(Boolean);
    subCategories.sort((a, b) => a.trim().toLowerCase().localeCompare(b.trim().toLowerCase(), 'id'));

    // Jika user cuma ngetik .sosmed facebook atau .fb -> tampilkan daftar Sub-Kategori di Platform tsb
    if (effectiveArgs.length === 1) {
        let displayCmd = isDirectPlatformCmd ? `${p}${userPfInput}` : `${p}${command} ${userPfInput}`;

        let txt = `\`JASA ${selectedPlatform.name}\` ${selectedPlatform.emoji}\n\n`;
        txt += `Silakan pilih sub-kategori layanan di bawah (balas angkanya):\n\n`;

        subCategories.forEach((cat, idx) => {
            let catCount = pfServices.filter(s => s.category === cat).length;
            txt += `${idx + 1}. 🏷️ *${cat}* _(${catCount} Layanan)_\n`;
        });

        txt += `\n*Cara Pilih:* Balas angka di atas (contoh: *1*) atau ketik *${displayCmd} <nomor_subkategori>*\n\n\n`;
        txt += `_Mau tambah followers, likes, atau views kak? Pilih kategorinya di atas ya!_`;

        // Simpan sesi level 2
        conn.smmSession = conn.smmSession || {};
        startFlow(conn, m.sender, 'smmSession');
        conn.smmSession[m.sender] = {
            level: 2,
            platform: selectedPlatform,
            subCategories,
            expires: Date.now() + 5 * 60 * 1000,
        };

        return replyThumb(conn, m, txt, selectedPlatform.key);
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

    // Hapus sesi SMM begitu membuka detail layanan
    if (conn.smmSession?.[m.sender]) delete conn.smmSession[m.sender];

    let targetServices = pfServices.filter(s => s.category === selectedSubCat);
    targetServices.sort((a, b) => (a.name || '').trim().toLowerCase().localeCompare((b.name || '').trim().toLowerCase(), 'id'));

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

    return replyThumb(conn, m, txt, selectedPlatform.key);
};

// Tangkap balasan angka murni untuk sesi SMM Level 1 & Level 2
handler.before = async (m, { conn, usedPrefix }) => {
    const text = (m.text || '').trim();
    if (!/^\d+$/.test(text)) return; // Hanya untuk balasan murni angka

    const session = conn.smmSession?.[m.sender];
    if (!session) return; // Tidak ada sesi aktif → lewati

    if (Date.now() > session.expires) {
        delete conn.smmSession[m.sender];
        return;
    }

    const num = parseInt(text, 10);

    // LEVEL 1: User membalas angka platform (misal 1 untuk Instagram, 4 untuk Facebook)
    if (session.level === 1) {
        let pf = PLATFORMS[num - 1];
        if (!pf) {
            await m.reply(`❌ Nomor platform tidak valid. Silakan pilih 1-${PLATFORMS.length}.`);
            return true;
        }
        delete conn.smmSession[m.sender];
        return handler(m, { conn, args: [pf.key], usedPrefix, command: 'sosmed' });
    }

    // LEVEL 2: User membalas angka subkategori (misal 1 untuk Facebook Page Likes, 2 untuk Post Likes)
    if (session.level === 2 && Array.isArray(session.subCategories)) {
        let subCat = session.subCategories[num - 1];
        if (!subCat) {
            await m.reply(`❌ Nomor sub-kategori tidak valid. Silakan pilih 1-${session.subCategories.length}.`);
            return true;
        }
        delete conn.smmSession[m.sender];
        return handler(m, { conn, args: [session.platform.key, String(num)], usedPrefix, command: 'sosmed' });
    }
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
