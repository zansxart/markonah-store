/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 *
 * Plugin Reset Rekap Penjualan Store (.resetrekap / .rr)
 */
import { storeDB } from '../../lib/store-db.js';

let handler = async (m, { conn, isOwner }) => {
    if (!isOwner) return m.reply(`❌ Perintah ini hanya untuk Owner.`);

    storeDB.resetRekap();
    return m.reply(`✅ *REKAP PENJUALAN BERHASIL DI-RESET!*\n\nSejak saat ini, laporan omset & perhitungan penjualan di *.rekap* dimulai kembali dari awal (Rp 0).`);
};

handler.help = ['resetrekap'];
handler.command = ['resetrekap', 'rr', 'clearrekap'];
handler.tags = ['owner'];
handler.rowner = true;
export default handler;
