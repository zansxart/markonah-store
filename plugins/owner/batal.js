/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';
import { usage, copyable, resolveInvoice } from '../../lib/format.js';

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

    let teksAdmin = `\`TRANSAKSI DIBATALKAN\`\n\n↳ *Invoice:* ${copyable(inv)}\n↳ *Status:* Dibatalkan\n\n_Catatan: Stok yang diambil tidak dikembalikan otomatis._`;
    m.reply(teksAdmin);

    let teksBuyer = `\`PESANAN DIBATALKAN\`\n\n↳ *Invoice:* ${copyable(inv)}\n\n_Mohon maaf, pesanan Anda telah dibatalkan oleh admin. Silakan hubungi admin untuk informasi lebih lanjut._`;
    conn.sendMessage(trx.buyer_jid, { text: teksBuyer });
};
handler.help = ['batal'];
handler.command = ['batal', 'cancel', 'reject'];
handler.tags = ['owner'];
handler.rowner = true;
export default handler;
