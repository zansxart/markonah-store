/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */
import { storeDB } from '../../lib/store-db.js';
import { usage } from '../../lib/format.js';

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) return m.reply(usage({
        prefix: usedPrefix, command,
        desc: 'Kirim pesan ke semua pembeli',
        format: '<pesan>',
        examples: 'Promo hari ini diskon 20%!',
    }));

    let trxs = storeDB.getAllTransactions();
    let buyers = [...new Set(trxs.map(t => t.buyer_jid))];
    
    if (buyers.length === 0) return m.reply('Belum ada pembeli!');
    
    let teksBc = `\`ANNOUNCEMENT STORE\`\n\n${text}\n\n\n_Pesan resmi dari Markonah Store_`;
    
    let count = 0;
    for (let jid of buyers) {
        try {
            await conn.sendMessage(jid, { text: teksBc });
            count++;
        } catch (e) {}
    }
    
    m.reply(`\`BROADCAST SUKSES\`\n\n↳ *Pesan dikirim ke:* ${count} pengguna`);
};
handler.help = ['broadcast'];
handler.command = ['broadcast', 'bc'];
handler.tags = ['owner'];
handler.rowner = true;
export default handler;
