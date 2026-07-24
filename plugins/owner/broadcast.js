/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';

let handler = async (m, { conn, text }) => {
    if (!text) return m.reply('Masukkan pesan broadcast!');
    
    let trxs = storeDB.getAllTransactions();
    let buyers = [...new Set(trxs.map(t => t.buyer_jid))];
    
    if (buyers.length === 0) return m.reply('Belum ada pembeli!');
    
    let teksBc = `┏━━━〔 📢 BROADCAST STORE 〕━⬣\n┃\n┃ ${text.split('\n').join('\n┃ ')}\n┃\n┗━━━━━━━━━━━━━━━━⬣`;
    
    let count = 0;
    for (let jid of buyers) {
        try {
            await conn.sendMessage(jid, { text: teksBc });
            count++;
        } catch (e) {}
    }
    
    m.reply(`┏━━━〔 ✅ BROADCAST SUKSES 〕━⬣\n┃ ✦ Pesan dikirim ke ${count} pengguna\n┗━━━━━━━━━━━━━━━━⬣`);
};
handler.help = ['broadcast'];
handler.command = ['broadcast', 'bc'];
handler.tags = ['owner'];
handler.rowner = true;
export default handler;
