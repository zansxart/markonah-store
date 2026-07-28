/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';
import { rp, usage, copyable } from '../../lib/format.js';

let handler = async (m, { conn, args, text, usedPrefix, command }) => {
    let inv = args[0];
    let dataAkun = text.replace(inv, '').trim();
    if (m.quoted && m.quoted.text) {
        dataAkun = m.quoted.text;
    }

    if (!inv || !dataAkun) return m.reply(usage({
        prefix: usedPrefix, command,
        desc: 'Kirim data akun ke pembeli & tandai selesai',
        format: '<invoice> <data_akun>',
        examples: 'INV-A3F2K9 email@gmail.com:pass',
        note: 'Bisa juga reply pesan berisi data akun sambil ketik: ' + (usedPrefix || '.') + command + ' <invoice>',
    }));

    let trx = storeDB.getTransaction(inv);
    if (!trx) return m.reply('Transaksi tidak ditemukan!');

    storeDB.completeTransaction(inv, dataAkun);
    let product = storeDB.getProduct(trx.product_id);

    m.reply(`\`DATA DIKIRIM\`\n\n↳ *Invoice:* ${copyable(inv)}\n↳ *Status:* Selesai`);

    let productName = product ? product.name : (trx.product_name || trx.product_id);
    let totalPrice = trx.total_price || 0;

    let teksBuyer = `\`PESANAN SELESAI\`\n\n` +
        `↳ *Invoice:* ${copyable(inv)}\n` +
        `↳ *Produk:* ${productName}\n` +
        `↳ *Total Harga:* Rp ${rp(totalPrice)}\n\n` +
        `*Data Akun / Pesanan:*\n${dataAkun}\n\n\n` +
        `_Segera ganti password (jika akun). Terima kasih telah berbelanja!_`;
    conn.sendMessage(trx.buyer_jid, { text: teksBuyer });
};
handler.help = ['kirim'];
handler.command = ['kirim', 'send', 'deliver'];
handler.tags = ['owner'];
handler.rowner = true;
export default handler;
