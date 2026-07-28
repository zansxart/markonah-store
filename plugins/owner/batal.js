/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';
import { usage, copyable, resolveInvoice } from '../../lib/format.js';
import { sendStatusCard } from '../../lib/ui.js';

let handler = async (m, { conn, args, usedPrefix, command }) => {
    let inv = resolveInvoice(m, args[0]);
    if (!inv) return m.reply(usage({
        prefix: usedPrefix, command,
        desc: 'Batalkan transaksi pembeli (bisa reply pesan invoice)',
        format: '<invoice>',
        examples: 'INV-K7P2',
        note: 'Atau cukup reply pesan bot yang memuat invoice, lalu ketik ' + (usedPrefix || '.') + command,
    }));

    let trx = storeDB.getTransaction(inv);
    if (!trx) return m.reply('Transaksi tidak ditemukan!');

    storeDB.updateTransactionStatus(inv, 'cancel');

    await m.reply(`✅ Invoice ${copyable(inv)} *Dibatalkan*.\n_Catatan: stok yang terlanjur diambil tidak dikembalikan otomatis._`);

    // Status dibatalkan → grup + tag pembeli (fallback ke PC pembeli).
    await sendStatusCard(conn, {
        title: 'PESANAN DIBATALKAN',
        invoiceId: inv,
        buyerJid: trx.buyer_jid,
        productName: trx.product_name || trx.product_id,
        amount: trx.total_price,
        status: 'cancel',
        chatJid: trx.chat_jid,
    }, 'gagal');
};
handler.help = ['batal'];
handler.command = ['batal', 'cancel', 'reject'];
handler.tags = ['owner'];
handler.rowner = true;
export default handler;
