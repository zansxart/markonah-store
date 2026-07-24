/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';

let handler = async (m, { conn }) => {
    conn.storeTrx = conn.storeTrx || {};
    
    let activeTrx = conn.storeTrx[m.sender];
    
    if (!activeTrx) {
        return m.reply(`❌ Anda tidak memiliki transaksi aktif yang bisa dibatalkan.`);
    }
    
    clearTimeout(activeTrx.timer);
    
    let trx = storeDB.getTransaction(activeTrx.invoiceId);
    if (trx && trx.status === 'pending') {
        storeDB.updateTransactionStatus(activeTrx.invoiceId, 'cancel');
    }
    
    delete conn.storeTrx[m.sender];
    
    m.reply(`✅ Transaksi ${activeTrx.invoiceId} berhasil dibatalkan.`);
};

handler.help = ['bataltrx'];
handler.command = ['bataltrx', 'canceltrx'];
handler.tags = ['store'];
export default handler;
