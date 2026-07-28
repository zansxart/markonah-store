/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 *
 * Plugin Reset Riwayat Transaksi Store (.resettrx / .rt)
 */
import { storeDB } from '../../lib/store-db.js';

let handler = async (m, { conn, isOwner }) => {
    if (!isOwner) return m.reply(`❌ Perintah ini hanya untuk Owner.`);

    storeDB.resetTransactions();
    storeDB.resetRekap();
    return m.reply(`✅ *RIWAYAT TRANSAKSI BERHASIL DI-RESET!*\n\nSeluruh data transaksi di database telah dibersihkan.`);
};

handler.help = ['resettrx'];
handler.command = ['resettrx', 'rt', 'cleartrx'];
handler.tags = ['owner'];
handler.rowner = true;
export default handler;
