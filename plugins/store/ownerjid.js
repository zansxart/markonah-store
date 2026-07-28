/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 *
 * Tangkap JID asli owner saat owner chat bot lewat PC (private chat), lalu
 * simpan ke global + DB. Dipakai semua notif owner (lihat lib/store-notify.js).
 *
 * Kenapa perlu: di WhatsApp baru, jid @s.whatsapp.net hasil tebak dari nomor
 * di config kadang TIDAK bisa dikirimi pesan (akun muncul sebagai @lid), jadi
 * notif owner hilang diam-diam. Jid asli dari chat PC dijamin bisa dikirimi.
 */
import { storeDB } from '../../lib/store-db.js';

// Pulihkan jid owner tersimpan saat plugin di-load (survive restart).
if (!global.ownerJidResolved) {
    try {
        const saved = storeDB.getSetting('owner_jid');
        if (saved) global.ownerJidResolved = saved;
    } catch { /* DB belum siap, abaikan */ }
}

let handler = async () => {};

handler.before = async (m, { conn, isOwner }) => {
    if (!isOwner) return;
    // Hanya tangkap dari private chat (bukan grup) — jid PC dijamin messageable.
    const chat = m.chat || '';
    if (!chat.endsWith('@s.whatsapp.net') && !chat.endsWith('@lid')) return;
    if (chat.endsWith('@g.us')) return;

    if (global.ownerJidResolved !== chat) {
        global.ownerJidResolved = chat;
        try { storeDB.setSetting('owner_jid', chat); } catch { /* abaikan */ }
    }
};

handler.help = [];
handler.command = [];
handler.tags = ['store'];
export default handler;
