/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';
import { copyable } from '../../lib/format.js';

async function cancelActive(m, conn) {
    conn.storeTrx = conn.storeTrx || {};
    let activeTrx = conn.storeTrx[m.sender];
    if (!activeTrx) return false;

    clearTimeout(activeTrx.timer);

    let trx = storeDB.getTransaction(activeTrx.invoiceId);
    if (trx && trx.status === 'pending') {
        storeDB.updateTransactionStatus(activeTrx.invoiceId, 'cancel');
    }
    delete conn.storeTrx[m.sender];

    await m.reply(`✅ Transaksi ${copyable(activeTrx.invoiceId)} berhasil dibatalkan.`);
    return true;
}

let handler = async (m, { conn }) => {
    let ok = await cancelActive(m, conn);
    if (!ok) return m.reply(`❌ Anda tidak memiliki transaksi aktif yang bisa dibatalkan.`);
};

// User cukup ketik "batal" / "cancel" (tanpa prefix) buat batalin trx aktif.
// buy.js & saldo.js menangani sesi opsi bayar duluan; ini hanya kena kalau
// tidak ada sesi opsi tapi ADA transaksi pending yang nunggu pembayaran.
handler.before = async (m, { conn }) => {
    const text = (m.text || '').trim().toLowerCase();
    if (text !== 'batal' && text !== 'cancel') return;
    if (!conn.storeTrx?.[m.sender]) return; // tidak ada trx aktif → jangan ganggu chat biasa
    return await cancelActive(m, conn);
};

handler.help = ['bataltrx'];
handler.command = ['bataltrx', 'canceltrx'];
handler.tags = ['store'];
export default handler;
