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
        desc: 'Ubah status transaksi jadi "diproses" (bisa reply pesan invoice)',
        format: '<invoice>',
        examples: 'INV-K7P2',
        note: 'Atau cukup reply pesan bot yang memuat invoice, lalu ketik ' + (usedPrefix || '.') + command,
    }));

    let trx = storeDB.getTransaction(inv);
    if (!trx) return m.reply('Transaksi tidak ditemukan!');

    storeDB.updateTransactionStatus(inv, 'process');

    // Konfirmasi singkat ke owner.
    await m.reply(`✅ Invoice ${copyable(inv)} ditandai *Diproses*.`);

    // Kartu status ke grup asal + tag pembeli (fallback ke PC pembeli).
    await sendStatusCard(conn, {
        title: 'PESANAN DIPROSES',
        invoiceId: inv,
        buyerJid: trx.buyer_jid,
        productName: trx.product_name || trx.product_id,
        amount: trx.total_price,
        status: 'process',
        chatJid: trx.chat_jid,
    }, 'proses');
};
handler.help = ['proses'];
handler.command = ['proses', 'process'];
handler.tags = ['owner'];
handler.rowner = true;
export default handler;
