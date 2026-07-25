/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 *
 * Logika settle pembayaran (dipakai bareng oleh konfirmasi manual `acc`/`confirm`
 * di plugins/store/buy.js DAN webhook auto GoPay di lib/payment-hook.js).
 * Idempotent: aman dipanggil dua kali untuk invoice yang sama.
 */
import { storeDB } from './store-db.js';
import { notifyPaid } from './store-notify.js';

/**
 * Bersihkan timer timeout pending (kalau ada) untuk pembeli tertentu.
 */
function clearTrxTimer(conn, buyerJid, invoiceId) {
    const entry = conn?.storeTrx?.[buyerJid];
    if (entry && entry.invoiceId === invoiceId) {
        if (entry.timer) clearTimeout(entry.timer);
        delete conn.storeTrx[buyerJid];
    }
}

/**
 * Proses pembayaran sebuah invoice → potong stok → kirim ke pembeli.
 * @returns {Promise<{ok:boolean, status?:string, reason?:string, trx?:object, items?:string[]}>}
 */
export async function settlePaid(conn, invoiceId, { source = 'manual' } = {}) {
    const trx = storeDB.getTransaction(invoiceId);
    if (!trx) return { ok: false, reason: 'not_found' };

    // Idempotency: hanya boleh diproses kalau masih pending/process.
    if (trx.status !== 'pending' && trx.status !== 'process') {
        return { ok: false, reason: 'already_settled', status: trx.status, trx };
    }

    clearTrxTimer(conn, trx.buyer_jid, invoiceId);
    storeDB.updateTransactionStatus(invoiceId, 'paid');

    // Auto-kirim stok kalau diaktifkan & stok cukup.
    if (global.store?.autoSend) {
        const stock = storeDB.getStockCount(trx.product_id);
        if (stock >= trx.qty) {
            const items = storeDB.takeStock(trx.product_id, trx.qty, trx.buyer_jid, invoiceId);
            storeDB.completeTransaction(invoiceId, items);

            let resultText = `✅ *PEMBAYARAN DITERIMA*\nInvoice: ${invoiceId}\n\nBerikut adalah pesanan Anda:\n\n`;
            items.forEach((item, i) => {
                resultText += `${i + 1}. ${item}\n`;
            });
            resultText += `\nTerima kasih telah berbelanja!`;

            await conn.sendMessage(trx.buyer_jid, { text: resultText });
            // Notif owner+grup: isi stok TIDAK ikut, itu cuma buat pembeli.
            await notifyPaid(conn, {
                invoiceId,
                buyerJid: trx.buyer_jid,
                productName: trx.product_name,
                amount: trx.unique_amount || trx.total_price,
                status: 'done',
                source,
                chatJid: trx.chat_jid,
            });
            return { ok: true, status: 'done', trx, items, source };
        }
    }

    // Stok kurang / autoSend mati → tandai process, kabari pembeli, biar owner kirim manual.
    storeDB.updateTransactionStatus(invoiceId, 'process');
    await conn.sendMessage(trx.buyer_jid, {
        text: `✅ Pembayaran untuk invoice ${invoiceId} telah diterima.\nPesanan Anda sedang diproses.`
    });
    await notifyPaid(conn, {
        invoiceId,
        buyerJid: trx.buyer_jid,
        productName: trx.product_name,
        amount: trx.unique_amount || trx.total_price,
        status: 'process',
        source,
        chatJid: trx.chat_jid,
    });
    return { ok: true, status: 'process', trx, source };
}
