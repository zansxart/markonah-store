/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 *
 * Plugin Tutorial / Panduan Cara Penggunaan Bot (.tutorial / .caraorder / .guide)
 */

import { copyable } from '../../lib/format.js';
import { replyThumb } from '../../lib/ui.js';

let handler = async (m, { conn, usedPrefix }) => {
    const p = usedPrefix !== undefined && usedPrefix !== null ? usedPrefix : '.';

    let teks = `\`TUTORIAL & PANDUAN PENGGUNAAN BOT\`\n\n` +
        `Selamat datang di store bot! Berikut adalah langkah mudah belanja di bot kami:\n\n` +
        `1️⃣ *LIHAT PRODUK & LAYANAN*\n` +
        `   ↳ Produk Digital: Ketik ${copyable(`${p}katalog`)}\n` +
        `   ↳ Jasa Sosmed: Ketik ${copyable(`${p}sosmed`)}\n\n` +
        `2️⃣ *ISI SALDO DEPOSIT*\n` +
        `   ↳ Ketik ${copyable(`${p}topup <nominal>`)} (Contoh: ${copyable(`${p}topup 20000`)})\n` +
        `   ↳ Lakukan pembayaran QRIS yang dikirimkan bot.\n` +
        `   ↳ Saldo otomatis masuk setelah pembayaran terverifikasi.\n\n` +
        `3️⃣ *PEMBELIAN PRODUK / JASA*\n` +
        `   ↳ Pembelian Produk Ready: Ketik ${copyable(`${p}buy <kode_produk>`)} (Contoh: ${copyable(`${p}buy gdrive1`)})\n` +
        `   ↳ Pembelian Jasa Sosmed: Ketik ${copyable(`${p}belisosmed <id> <target> <jumlah>`)}\n` +
        `   ↳ Atau cukup balas angka di menu katalog sosmed!\n\n` +
        `4️⃣ *CEK TRANSAKSI & RIWAYAT*\n` +
        `   ↳ Cek Riwayat Belanja: Ketik ${copyable(`${p}riwayat`)}\n` +
        `   ↳ Cek Status Invoice: Ketik ${copyable(`${p}cektrx <invoice>`)}\n` +
        `   ↳ Cek Sisa Saldo: Ketik ${copyable(`${p}saldo`)}\n\n` +
        `5️⃣ *BANTUAN & CS OWNER*\n` +
        `   ↳ Ada kendala atau pertanyaan? Ketik ${copyable(`${p}owner`)}\n\n\n` +
        `_Nikmati kemudahan belanja otomatis 24 jam bersama kami kak!_`;

    return replyThumb(conn, m, teks, 'katalog');
};

handler.help = ['tutorial', 'caraorder', 'guide'];
handler.command = ['tutorial', 'caraorder', 'guide', 'carapakai', 'bantuan', 'panduan'];
handler.tags = ['main'];

export default handler;
