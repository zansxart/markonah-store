/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';
import { usage, copyable } from '../../lib/format.js';
import { replyThumb, sendThumb } from '../../lib/ui.js';

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

    await replyThumb(conn, m, `\`STATUS DIPERBARUI\`\n\n↳ *Invoice:* ${copyable(inv)}\n↳ *Status:* Diproses`, 'proses');

    let teksBuyer = `\`PESANAN DIPROSES\`\n\n` +
        `↳ *Invoice:* ${copyable(inv)}\n` +
        `↳ *Pembeli:* @${trx.buyer_jid.split('@')[0]}\n` +
        `↳ *Produk:* ${trx.product_name || trx.product_id}\n\n\n` +
        `_Pesanan Anda sedang diproses oleh admin. Mohon ditunggu ya kak!_`;

    // Tag buyer di chat asal transaksi (grup), plus PC langsung.
    if (trx.chat_jid && trx.chat_jid.endsWith('@g.us')) {
        await sendThumb(conn, trx.chat_jid, teksBuyer, 'proses', { mentions: [trx.buyer_jid] }).catch(() => {});
    }
    await sendThumb(conn, trx.buyer_jid, teksBuyer, 'proses', { mentions: [trx.buyer_jid] }).catch(() => {});
};
handler.help = ['proses'];
handler.command = ['proses', 'process'];
handler.tags = ['owner'];
handler.rowner = true;
export default handler;
