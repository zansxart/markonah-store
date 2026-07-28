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
import { rp, copyable, resolveInvoice } from '../../lib/format.js';
import { sendThumb, sendStatusCard } from '../../lib/ui.js';

let handler = async (m, { conn, args, text, usedPrefix, command, isOwner }) => {
    if (!isOwner) return m.reply(`❌ Perintah ini hanya untuk Owner.`);

    // Invoice: kalau reply pesan ber-invoice, ambil dari situ & SELURUH teks
    // yang diketik = isi pesanan. Kalau tidak reply, args[0] = invoice, sisanya isi.
    let repliedInvoice = m.quoted ? resolveInvoice(m, null) : null;
    let invoiceId, isiPesanan;
    if (repliedInvoice) {
        invoiceId = repliedInvoice;
        isiPesanan = args.join(' ').trim();
    } else {
        invoiceId = resolveInvoice(m, args[0]);
        isiPesanan = args.slice(1).join(' ').trim();
    }

    if (!invoiceId) {
        return m.reply(`❌ Masukkan Invoice ID atau reply pesan yang memuat invoice.\nContoh: *${usedPrefix}${command} INV-K7P2*\nKirim pesanan: *${usedPrefix}${command} INV-K7P2 email: xxx | pass: xxx*\nAtau reply pesan invoice + ketik isi akunnya.`);
    }

    let trx = storeDB.getTransaction(invoiceId);
    if (!trx) return m.reply(`❌ Transaksi ${invoiceId} tidak ditemukan.`);

    // ── MODE 2: .acc <invoice> <isi akun/produk> → kirim ke PC buyer ──
    if (isiPesanan) {
        if (trx.status === 'done' || trx.status === 'cancel') {
            return m.reply(`❌ Transaksi ${invoiceId} sudah berstatus '${trx.status}'.`);
        }

        storeDB.completeTransaction(invoiceId, [isiPesanan]);

        // DATA AKUN → cuma PC pembeli (rahasia).
        let teksBuyer = `\`PESANAN SELESAI\`\n\n`;
        teksBuyer += `↳ *Invoice:* ${copyable(invoiceId)}\n`;
        teksBuyer += `↳ *Produk:* ${trx.product_name || trx.product_id}\n`;
        teksBuyer += `↳ *Total:* Rp ${rp(trx.total_price)}\n\n`;
        teksBuyer += `*Detail Pesanan:*\n${isiPesanan}\n\n\n`;
        teksBuyer += `_Segera ganti password (jika akun). Terima kasih telah berbelanja!_`;

        await sendThumb(conn, trx.buyer_jid, teksBuyer, 'done').catch(() => {});

        // STATUS SELESAI → grup + tag pembeli (tanpa data akun).
        await sendStatusCard(conn, {
            title: 'PESANAN SELESAI',
            invoiceId,
            buyerJid: trx.buyer_jid,
            productName: trx.product_name || trx.product_id,
            amount: trx.total_price,
            status: 'done',
            chatJid: trx.chat_jid,
        }, 'done').catch(() => {});

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

    // Kirim status card dengan thumbnail diterima.jpg
    await sendStatusCard(conn, {
        title: 'PEMBAYARAN DITERIMA',
        invoiceId,
        buyerJid: trx.buyer_jid,
        productName: trx.product_name || trx.product_id,
        amount: trx.total_price,
        status: res.status,
        chatJid: trx.chat_jid,
    }, 'diterima').catch(() => {});

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
