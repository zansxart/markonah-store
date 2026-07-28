/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 *
 * Auto-detect bukti pembayaran: kalau pembeli yang punya transaksi PENDING
 * (nunggu bayar manual) kirim gambar/screenshot, bot otomatis teruskan ke PC
 * owner lengkap dengan command .acc siap-copy. Jadi owner nggak perlu minta
 * user forward manual — buktinya nyamperin sendiri.
 */
import { storeDB } from '../../lib/store-db.js';
import { forwardPaymentProof } from '../../lib/store-notify.js';
import { displayPrefix } from '../../lib/prefix-util.js';

// Plugin ini murni reaktif (tidak dipanggil lewat command), jadi handler-nya
// no-op; semua logika ada di handler.before.
let handler = async () => {};

handler.before = async (m, { conn, usedPrefix }) => {
    // Hanya reaksi ke pesan gambar.
    if (m.mediaType !== 'imageMessage') return;

    // Pembeli harus punya transaksi aktif yang masih nunggu pembayaran.
    const active = conn.storeTrx?.[m.sender];
    if (!active) return;

    const trx = storeDB.getTransaction(active.invoiceId);
    if (!trx || trx.status !== 'pending') return;

    // Unduh gambar & teruskan ke owner. Gagal unduh → diamkan, jangan ganggu.
    let buffer = null;
    try {
        buffer = await m.download();
    } catch (e) {
        console.error('[BUKTI] Gagal unduh gambar bukti:', e?.message || e);
        return;
    }
    if (!buffer) return;

    const prefix = displayPrefix(usedPrefix);
    const ok = await forwardPaymentProof(conn, buffer, trx, prefix);

    if (ok) {
        await m.reply(`✅ Bukti pembayaran Anda sudah diteruskan ke admin.\nMohon tunggu konfirmasi ya kak! 🙏`);
    }
    // Tidak return true: biarkan plugin lain tetap bisa proses kalau perlu.
};

handler.help = [];
handler.command = [];
handler.tags = ['store'];
export default handler;
