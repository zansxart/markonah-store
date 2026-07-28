/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';
import { rp } from '../../lib/format.js';

let handler = async (m, { conn }) => {
    let trxs = storeDB.getAllTransactions();
    let resetAt = storeDB.getRekapResetAt();
    if (resetAt) {
        trxs = trxs.filter(t => t.created_at >= resetAt);
    }
    let products = storeDB.getAllProducts();
    
    let pending = trxs.filter(t => t.status === 'pending').length;
    let process = trxs.filter(t => t.status === 'process').length;
    let done = trxs.filter(t => t.status === 'done');
    let cancel = trxs.filter(t => t.status === 'cancel').length;
    
    let revenue = done.reduce((acc, t) => acc + (t.total_price || 0), 0);
    
    let topProducts = products.map(p => {
        let sold = done.filter(t => t.product_id === p.id).reduce((a, b) => a + (b.qty || 1), 0);
        return { ...p, sold };
    }).sort((a, b) => b.sold - a.sold).slice(0, 3);
    
    let teks = `\`REKAP PENJUALAN STORE\`\n\n`;
    if (resetAt) {
        teks += `_Periode Rekap Sejak: ${resetAt}_\n\n`;
    }
    teks += `↳ *Total Selesai:* ${done.length}\n`;
    teks += `↳ *Pending:* ${pending}\n`;
    teks += `↳ *Proses:* ${process}\n`;
    teks += `↳ *Batal:* ${cancel}\n\n`;
    teks += `↳ *Total Omset:* Rp ${rp(revenue)}\n`;
    teks += `↳ *Produk Aktif:* ${products.length}\n`;
    
    if (topProducts.length > 0 && topProducts[0].sold > 0) {
        teks += `\n\`PRODUK TERLARIS\`\n`;
        topProducts.forEach((p, i) => {
            if (p.sold > 0) teks += `${i+1}. *${p.name}* (${p.sold} terjual)\n`;
        });
    }
    m.reply(teks);
};
handler.help = ['rekap'];
handler.command = ['rekap', 'stats', 'dashboard'];
handler.tags = ['owner'];
handler.rowner = true;
export default handler;
