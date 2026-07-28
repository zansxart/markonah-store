/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 *
 * Plugin Manajemen Saldo User (Cek Saldo, TopUp Deposit, Admin Saldo)
 */

import { storeDB } from '../../lib/store-db.js';
import { rp, generateInvoiceId, usage, copyable } from '../../lib/format.js';
import { createQRIS } from '../../lib/qris.js';
import { notifyNewOrder } from '../../lib/store-notify.js';
import { replyThumb } from '../../lib/ui.js';
import { getRandomIntro, getRandomFooter } from '../../lib/random-msg.js';
import QRCode from 'qrcode';

const TOPUP_SESSION_TTL = 5 * 60 * 1000; // opsi pembayaran topup berlaku 5 menit

let handler = async (m, { conn, args, usedPrefix, command, isOwner }) => {
    const cmd = command.toLowerCase();

    // ── 1. CEK SALDO USER (.saldo / .mybalance / .ceksaldo) ──
    if (cmd === 'saldo' || cmd === 'mybalance' || cmd === 'ceksaldo') {
        let userJid = m.sender;
        let userName = m.pushName || 'User';

        // Admin bisa cek saldo user lain: .saldo @user atau .saldo 628xxx
        if (isOwner && args[0]) {
            let target = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
            let u = storeDB.getUser(target);
            if (!u) return m.reply(`❌ User ${args[0]} belum terdaftar di database.`);
            return m.reply(
                `💳 *SALDO USER*\n` +
                `User: @${target.split('@')[0]}\n` +
                `Nama: ${u.name || 'User'}\n` +
                `Saldo: *${rp(u.balance)}*`,
                null,
                { mentions: [target] }
            );
        }

        let user = storeDB.getOrCreateUser(userJid, userName);
        let intro = getRandomIntro('saldo');
        let footer = getRandomFooter('saldo');
        let txt = `\`INFORMASI SALDO AKUN\`\n\n${intro}\n\n`;
        txt += `↳ 👤 *Nama:* ${userName}\n`;
        txt += `↳ 📱 *Nomor:* @${userJid.split('@')[0]}\n`;
        txt += `↳ 💳 *Saldo:* *Rp ${rp(user.balance)}*\n\n\n`;
        txt += `${footer}`;

        return replyThumb(conn, m, txt, 'topup', { mentions: [userJid] });
    }

    // ── 2. TOPUP DEPOSIT (.topup / .deposit) ──
    if (cmd === 'topup' || cmd === 'deposit') {
        if (!args[0]) return m.reply(usage({
            prefix: usedPrefix, command,
            desc: 'Topup / Isi Saldo Bot',
            format: '<nominal>',
            examples: ['10000', '50000'],
            note: 'Minimal topup: Rp 1.000',
        }));

        let nominal = parseInt(args[0].replace(/[^0-9]/g, ''));
        if (isNaN(nominal) || nominal < 1000) {
            return m.reply(`❌ Nominal topup minimal adalah Rp 1.000.`);
        }

        // Simpan sesi opsi metode topup (satu sesi aktif per user)
        conn.topupSession = conn.topupSession || {};
        conn.topupSession[m.sender] = {
            nominal,
            expires: Date.now() + TOPUP_SESSION_TTL,
        };

        let intro = getRandomIntro('topup');
        let footer = getRandomFooter('topup');
        let txt = `\`TOPUP SALDO DEPOSIT\`\n\n${intro}\n\n`;
        txt += `↳ 💰 *Nominal:* Rp ${rp(nominal)}\n\n`;
        txt += `Silakan pilih metode pembayaran (balas angkanya):\n\n`;
        txt += `1. *Manual (QRIS + Konfirmasi Admin)*\n`;
        txt += `   _Dikonfirmasi admin saat online._\n\n`;
        txt += `2. *Otomatis (Payment Gateway)*\n`;
        txt += `   _On 24 jam, saldo otomatis masuk._\n\n\n`;
        txt += `${footer}`;
        return replyThumb(conn, m, txt, 'topup');
    }

    // ── 3. OWNER COMMANDS (ADD, MIN, SET SALDO, LIST) ──
    if (!isOwner) return m.reply(`❌ Perintah ini hanya untuk Owner.`);

    if (cmd === 'addsaldo') {
        if (args.length < 2) return m.reply(`❌ Format: ${usedPrefix}addsaldo <@user/nomor> <nominal>\nContoh: ${usedPrefix}addsaldo 628123456789 20000`);
        let target = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : (args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net');
        let amount = parseInt(args[1].replace(/[^0-9]/g, ''));
        if (isNaN(amount) || amount <= 0) return m.reply(`❌ Nominal harus berupa angka positif.`);

        let user = storeDB.addBalance(target, amount);
        let txt = `\`BERHASIL TAMBAH SALDO\`\n\n`;
        txt += `↳ *Target:* @${target.split('@')[0]}\n`;
        txt += `↳ *Tambah:* +${rp(amount)}\n`;
        txt += `↳ *Saldo Sekarang:* *Rp ${rp(user.balance)}*`;
        await m.reply(txt, null, { mentions: [target] });
        return conn.sendMessage(target, { text: `\`SALDO DITAMBAHKAN\`\n\nOwner telah mengisikan saldo sebesar *Rp ${rp(amount)}* ke akun Anda.\nSaldo Anda sekarang: *Rp ${rp(user.balance)}*\n\n\n_Terima kasih telah menggunakan layanan kami!_` }).catch(() => {});
    }

    if (cmd === 'minsaldo') {
        if (args.length < 2) return m.reply(`❌ Format: ${usedPrefix}minsaldo <@user/nomor> <nominal>\nContoh: ${usedPrefix}minsaldo 628123456789 5000`);
        let target = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : (args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net');
        let amount = parseInt(args[1].replace(/[^0-9]/g, ''));
        if (isNaN(amount) || amount <= 0) return m.reply(`❌ Nominal harus berupa angka positif.`);

        let user = storeDB.getUser(target);
        if (!user) return m.reply(`❌ User tidak ditemukan di database.`);
        storeDB.setBalance(target, Math.max(0, user.balance - amount));
        let updated = storeDB.getUser(target);

        let txt = `\`BERHASIL POTONG SALDO\`\n\n`;
        txt += `↳ *Target:* @${target.split('@')[0]}\n`;
        txt += `↳ *Potong:* -${rp(amount)}\n`;
        txt += `↳ *Saldo Sekarang:* *Rp ${rp(updated.balance)}*`;
        return m.reply(txt, null, { mentions: [target] });
    }

    if (cmd === 'setsaldo') {
        if (args.length < 2) return m.reply(`❌ Format: ${usedPrefix}setsaldo <@user/nomor> <nominal>\nContoh: ${usedPrefix}setsaldo 628123456789 100000`);
        let target = (m.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : (args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net');
        let amount = parseInt(args[1].replace(/[^0-9]/g, ''));
        if (isNaN(amount) || amount < 0) return m.reply(`❌ Nominal harus angka valid >= 0.`);

        let user = storeDB.setBalance(target, amount);
        let txt = `\`BERHASIL SET SALDO\`\n\n`;
        txt += `↳ *Target:* @${target.split('@')[0]}\n`;
        txt += `↳ *Saldo Baru:* *Rp ${rp(user.balance)}*`;
        return m.reply(txt, null, { mentions: [target] });
    }

    if (cmd === 'listsaldo' || cmd === 'topskor') {
        let users = storeDB.getAllUsers();
        if (!users || !users.length) return m.reply(`ℹ️ Belum ada user dengan saldo.`);

        let txt = `\`DAFTAR SALDO PENGGUNA\`\n\n`;
        let mentions = [];
        users.slice(0, 30).forEach((u, i) => {
            txt += `${i + 1}. @${u.jid.split('@')[0]} - *Rp ${rp(u.balance)}*\n`;
            mentions.push(u.jid);
        });
        return m.reply(txt, null, { mentions });
    }
};

// Tangkap balasan pilihan metode topup (sesi aktif & belum expired).
handler.before = async (m, { conn, usedPrefix }) => {
    const session = conn.topupSession?.[m.sender];
    if (!session) return;

    const text = (m.text || '').trim().toLowerCase();
    const prefix = usedPrefix || global.config?.prefix || '.';

    if (Date.now() > session.expires) {
        delete conn.topupSession[m.sender];
        return;
    }

    if (text === 'batal' || text === 'cancel') {
        delete conn.topupSession[m.sender];
        await m.reply(`✅ Topup dibatalkan.`);
        return true;
    }

    const isManual = text === '1' || text === 'manual';
    const isAuto = text === '2' || text === 'otomatis';
    if (!isManual && !isAuto) return;

    // ── OPSI 2: OTOMATIS (PG BELUM JADI) ──
    if (isAuto) {
        await m.reply(`\`TOPUP OTOMATIS\`\n\nMohon maaf, topup otomatis belum tersedia saat ini.\nSilakan balas *1* untuk topup manual via QRIS.`);
        return true; // sesi tetap hidup, user bisa pilih 1
    }

    // ── OPSI 1: MANUAL (QRIS + KONFIRMASI ADMIN) ──
    delete conn.topupSession[m.sender];

    const nominal = session.nominal;
    const qrisString = global.payment?.qris || '';
    if (!qrisString) {
        await m.reply(`❌ QRIS belum diatur oleh Owner.`);
        return true;
    }

    const invoiceId = generateInvoiceId();
    storeDB.createTransaction(invoiceId, m.sender, 'TOPUP', 1, nominal, 'qris', nominal, m.chat, 'topup');
    const qrisPayload = createQRIS(qrisString, nominal);

    const timeoutSec = global.store?.paymentTimeout || 300;
    const minutes = Math.floor(timeoutSec / 60);

    let caption = `\`INVOICE TOPUP SALDO (MANUAL)\`\n\n`;
    caption += `↳ *Invoice:* ${copyable(invoiceId)}\n`;
    caption += `↳ *Pembeli:* @${m.sender.split('@')[0]}\n`;
    caption += `↳ *Total Transfer:* *Rp ${rp(nominal)}*\n\n`;
    caption += `*Petunjuk Pembayaran:*\n`;
    caption += `1. Scan QRIS di atas menggunakan GoPay, OVO, DANA, ShopeePay, BCA, atau m-Banking.\n`;
    caption += `2. Batas waktu transfer: *${minutes} menit*.\n`;
    caption += `3. Setelah transfer, *kirim bukti pembayaran (screenshot)* di chat ini.\n\n\n`;
    caption += `_Admin akan mengonfirmasi & saldo Anda otomatis bertambah. Mohon ditunggu ya kak!_`;

    const qrBuffer = await QRCode.toBuffer(qrisPayload, { margin: 2, scale: 8 });
    await conn.sendMessage(m.chat, { image: qrBuffer, caption, mentions: [m.sender] }, { quoted: m });

    await notifyNewOrder(conn, {
        invoiceId,
        buyerJid: m.sender,
        productName: `Topup Saldo ${rp(nominal)}`,
        total: nominal,
        chatJid: m.chat,
    });

    // Set timer cancel jika tidak dibayar
    if (!conn.storeTrx) conn.storeTrx = {};
    const timer = setTimeout(async () => {
        let trx = storeDB.getTransaction(invoiceId);
        if (trx && trx.status === 'pending') {
            storeDB.updateTransactionStatus(invoiceId, 'cancel');
            await conn.sendMessage(m.sender, { text: `❌ Topup invoice ${copyable(invoiceId)} kedaluwarsa karena tidak dibayar dalam ${minutes} menit.` }).catch(() => {});
        }
        delete conn.storeTrx[m.sender];
    }, timeoutSec * 1000);

    conn.storeTrx[m.sender] = { invoiceId, timer };
    return true;
};

handler.help = [
    'saldo',
    'topup <nominal>',
    'addsaldo <@user> <nominal>',
    'minsaldo <@user> <nominal>',
    'setsaldo <@user> <nominal>',
    'listsaldo'
];
handler.command = ['saldo', 'mybalance', 'ceksaldo', 'topup', 'deposit', 'addsaldo', 'minsaldo', 'setsaldo', 'listsaldo', 'topskor'];
handler.tags = ['store'];
export default handler;
