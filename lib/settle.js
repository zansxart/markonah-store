/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 *
 * Logika settle pembayaran (dipakai konfirmasi manual `acc`/`confirm`/`done`
 * oleh owner, dan pembayaran via saldo user).
 * Idempotent: aman dipanggil dua kali untuk invoice yang sama.
 */
import { storeDB } from './store-db.js';
import { notifyPaid, notifyFulfillOrder } from './store-notify.js';
import { copyable, rp } from './format.js';
import { sendThumb } from './ui.js';
import { displayPrefix } from './prefix-util.js';
import medanpedia from './medanpedia.js';

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
 * Proses pembayaran sebuah invoice → potong stok/topup/proses SMM → kirim ke pembeli.
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

    // ── CASE 1: TOPUP SALDO ───────────────────
    if (trx.trx_type === 'topup') {
        const user = storeDB.addBalance(trx.buyer_jid, trx.total_price);
        storeDB.completeTransaction(invoiceId, [`Topup Saldo ${rp(trx.total_price)}`]);

        let msg = `✅ *TOPUP SALDO BERHASIL*\n`;
        msg += `Invoice: ${copyable(invoiceId)}\n`;
        msg += `Nominal Topup: ${rp(trx.total_price)}\n`;
        msg += `Saldo Anda Sekarang: *${rp(user.balance)}*\n\n`;
        msg += `Terima kasih telah melakukan pengisian saldo!`;

        await sendThumb(conn, trx.buyer_jid, msg, 'topup');
        await notifyPaid(conn, {
            invoiceId,
            buyerJid: trx.buyer_jid,
            productName: `Topup Saldo ${rp(trx.total_price)}`,
            amount: trx.unique_amount || trx.total_price,
            status: 'done',
            source,
            chatJid: trx.chat_jid,
        });
        return { ok: true, status: 'done', trx, source };
    }

    // ── CASE 2: SMM MEDANPEDIA ────────────────
    if (trx.trx_type === 'smm') {
        // Tembak API Medanpedia
        const smmRes = await medanpedia.createOrder({
            service: trx.smm_service_id,
            target: trx.smm_target,
            quantity: trx.qty
        });

        if (smmRes.ok) {
            const orderId = smmRes.orderId;
            storeDB.updateSmmOrderId(invoiceId, String(orderId));
            storeDB.completeTransaction(invoiceId, [`Order ID Sosmed: ${orderId}`]);

            let msg = `✅ *PESANAN JASA SOSMED DIPROSES*\n`;
            msg += `Invoice: ${copyable(invoiceId)}\n`;
            msg += `Layanan: ${trx.product_name}\n`;
            msg += `Target: ${trx.smm_target}\n`;
            msg += `Jumlah: ${trx.qty}\n`;
            msg += `ID Pesanan: *#${orderId}*\n\n`;
            msg += `Anda dapat mengecek status pengerjaan kapan saja dengan mengetik:\n`;
            msg += `*.ceksosmed ${orderId}*`;

            await sendThumb(conn, trx.buyer_jid, msg, 'done');
            await notifyPaid(conn, {
                invoiceId,
                buyerJid: trx.buyer_jid,
                productName: `${trx.product_name} (ID: ${orderId})`,
                amount: trx.unique_amount || trx.total_price,
                status: 'done',
                source,
                chatJid: trx.chat_jid,
            });
            return { ok: true, status: 'done', trx, smmOrderId: orderId, source };
        } else {
            // Gagal request API Medanpedia -> tandai process
            storeDB.updateTransactionStatus(invoiceId, 'process');
            let errorMsg = `⚠️ *PEMBAYARAN DITERIMA TAPI PROSES SMM GAGAL*\n`;
            errorMsg += `Invoice: ${copyable(invoiceId)}\n`;
            errorMsg += `Penyebab: ${smmRes.msg}\n\n`;
            errorMsg += `Mohon tunggu, admin akan memproses pesanan ini secara manual.`;

            await sendThumb(conn, trx.buyer_jid, errorMsg, 'gagal');
            await notifyPaid(conn, {
                invoiceId,
                buyerJid: trx.buyer_jid,
                productName: `${trx.product_name} [ERR: ${smmRes.msg}]`,
                amount: trx.unique_amount || trx.total_price,
                status: 'process',
                source,
                chatJid: trx.chat_jid,
            });
            return { ok: true, status: 'process', trx, reason: smmRes.msg, source };
        }
    }

    // ── CASE 3: PRODUK STOK LOKAL ─────────────
    // Tipe produk yang nentuin, bukan saklar global:
    //  - 'stock'  → auto-kirim kalau stok ada
    //  - 'manual' → selalu lewat owner (Pre-Order), tidak pernah auto-kirim
    const product = storeDB.getProduct(trx.product_id);
    const isManualProduct = product?.type === 'manual';
    if (!isManualProduct) {
        const stock = storeDB.getStockCount(trx.product_id);
        if (stock >= trx.qty) {
            const items = storeDB.takeStock(trx.product_id, trx.qty, trx.buyer_jid, invoiceId);
            storeDB.completeTransaction(invoiceId, items);

            let resultText = `✅ *PEMBAYARAN DITERIMA*\nInvoice: ${copyable(invoiceId)}\n\nBerikut adalah pesanan Anda:\n\n`;
            items.forEach((item, i) => {
                resultText += `${i + 1}. ${item}\n`;
            });
            resultText += `\nTerima kasih telah berbelanja!`;

            await sendThumb(conn, trx.buyer_jid, resultText, 'done');
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

    // Produk manual, atau stok kurang → tandai process, kabari pembeli,
    // lalu PC owner: minta siapkan produk & kasih command siap-copy.
    storeDB.updateTransactionStatus(invoiceId, 'process');
    await sendThumb(conn, trx.buyer_jid, `✅ Pembayaran untuk invoice ${copyable(invoiceId)} telah diterima.\nPesanan Anda sedang disiapkan oleh admin, mohon ditunggu ya kak!`, 'wait');

    const prefix = displayPrefix();
    await notifyPaid(conn, {
        invoiceId,
        buyerJid: trx.buyer_jid,
        productName: trx.product_name,
        amount: trx.unique_amount || trx.total_price,
        status: 'process',
        source,
        chatJid: trx.chat_jid,
    });
    await notifyFulfillOrder(conn, {
        invoiceId,
        buyerJid: trx.buyer_jid,
        productName: trx.product_name,
        qty: trx.qty,
        amount: trx.total_price,
        prefix,
    });
    return { ok: true, status: 'process', trx, source };
}
