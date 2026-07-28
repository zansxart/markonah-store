/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 *
 * Plugin Perintah Owner untuk Konfirmasi Pembayaran & Kirim Pesanan (.acc / .confirm)
 *
 * Dua mode:
 * 1. .acc <invoice>            → konfirmasi pembayaran (topup / QRIS / SMM)
 * 2. .acc <invoice> <isi akun> → kirim isi akun/produk langsung ke PC buyer
 *    (dipakai setelah saldo terpotong & owner sudah siapkan produknya)
 */

import { storeDB } from '../../lib/store-db.js';
import { settlePaid } from '../../lib/settle.js';
import { rp, copyable } from '../../lib/format.js';
import { sendThumb } from '../../lib/ui.js';

let handler = async (m, { conn, args, text, usedPrefix, command, isOwner }) => {
    if (!isOwner) return m.reply(`❌ Perintah ini hanya untuk Owner.`);

    let invoiceId = args[0];

    // Jika pesan mereply invoice
    if (!invoiceId && m.quoted) {
        let quotedText = m.quoted.text || m.quoted.caption || '';
        let match = quotedText.match(/Invoice(?:\s*ID)?\s*:\s*(INV-[\w-]+)/i);
        if (match) invoiceId = match[1];
    }

    if (!invoiceId) {
        return m.reply(`❌ Masukkan Invoice ID atau reply pesan tagihan invoice.\nContoh: *${usedPrefix}${command} INV-102938*\nAtau kirim pesanan: *${usedPrefix}${command} INV-102938 email: xxx | pass: xxx*`);
    }

    let trx = storeDB.getTransaction(invoiceId);
    if (!trx) return m.reply(`❌ Transaksi ${invoiceId} tidak ditemukan.`);

    // ── MODE 2: .acc <invoice> <isi akun/produk> → kirim ke PC buyer ──
    let isiPesanan = args.slice(1).join(' ').trim();
    if (isiPesanan) {
        if (trx.status === 'done' || trx.status === 'cancel') {
            return m.reply(`❌ Transaksi ${invoiceId} sudah berstatus '${trx.status}'.`);
        }

        storeDB.completeTransaction(invoiceId, [isiPesanan]);

        let teksBuyer = `\`PESANAN SELESAI\`\n\n`;
        teksBuyer += `↳ *Invoice:* ${copyable(invoiceId)}\n`;
        teksBuyer += `↳ *Produk:* ${trx.product_name || trx.product_id}\n`;
        teksBuyer += `↳ *Total:* Rp ${rp(trx.total_price)}\n\n`;
        teksBuyer += `*Detail Pesanan:*\n${isiPesanan}\n\n\n`;
        teksBuyer += `_Segera ganti password (jika akun). Terima kasih telah berbelanja!_`;

        await sendThumb(conn, trx.buyer_jid, teksBuyer, 'done').catch(() => {});
        return m.reply(`✅ Pesanan ${invoiceId} selesai & sudah dikirim ke PC pembeli (@${trx.buyer_jid.split('@')[0]}).`, null, { mentions: [trx.buyer_jid] });
    }

    // ── MODE 1: .acc <invoice> → konfirmasi pembayaran ──
    if (trx.status !== 'pending' && trx.status !== 'process') {
        return m.reply(`❌ Transaksi ${invoiceId} sudah berstatus '${trx.status}'.`);
    }

    m.reply(`🔄 Mengonfirmasi pembayaran invoice ${invoiceId}...`);
    let res = await settlePaid(conn, invoiceId, { source: 'manual-owner' });

    if (!res.ok) {
        return m.reply(`❌ Gagal memproses transaksi: ${res.reason}`);
    }

    if (res.status === 'done') {
        if (trx.trx_type === 'topup') {
            return m.reply(`✅ Topup invoice ${invoiceId} berhasil dikonfirmasi. Saldo user telah ditambahkan.`);
        }
        if (trx.trx_type === 'smm') {
            return m.reply(`✅ Pesanan SMM invoice ${invoiceId} berhasil dikonfirmasi & dikirim ke Server Sosmed! (Order ID: #${res.smmOrderId || 'N/A'})`);
        }
        return m.reply(`✅ Pembayaran invoice ${invoiceId} dikonfirmasi & produk telah dikirim ke pembeli.`);
    }

    return m.reply(`✅ Pembayaran dikonfirmasi. Status pesanan: ${res.status}.\nKirim pesanannya dengan: ${copyable(`${usedPrefix}acc ${invoiceId} <isi>`)}`);
};

handler.help = ['acc <invoice_id>', 'acc <invoice_id> <isi_pesanan>'];
handler.command = ['acc', 'confirm', 'accpay'];
handler.tags = ['store'];
export default handler;
