/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';
import { usage, copyable } from '../../lib/format.js';

let handler = async (m, { conn, args, usedPrefix, command }) => {
    let inv = args[0];
    if (!inv) return m.reply(usage({
        prefix: usedPrefix, command,
        desc: 'Ubah status transaksi jadi "diproses"',
        format: '<invoice>',
        examples: 'INV-A3F2K9',
    }));

    let trx = storeDB.getTransaction(inv);
    if (!trx) return m.reply('Transaksi tidak ditemukan!');

    storeDB.updateTransactionStatus(inv, 'process');

    m.reply(`┏━━━〔 ✅ STATUS DIPERBARUI 〕━⬣\n┃ ✦ Invoice : ${copyable(inv)}\n┃ ✦ Status  : Diproses\n┗━━━━━━━━━━━━━━━━⬣`);

    let teksBuyer = `┏━━━〔 ⏳ PESANAN DIPROSES 〕━⬣\n┃\n┃ 🧾 Invoice : ${copyable(inv)}\n┃ Pesanan Anda sedang diproses oleh admin...\n┃ Mohon ditunggu ya kak!\n┗━━━━━━━━━━━━━━━━⬣`;
    conn.sendMessage(trx.buyer_jid, { text: teksBuyer });
};
handler.help = ['proses'];
handler.command = ['proses', 'process'];
handler.tags = ['owner'];
handler.rowner = true;
export default handler;
