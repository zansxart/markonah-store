/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 *
 * Diagnosa JID: cek apakah bot memegang nomor asli atau @lid.
 * WhatsApp mulai memakai LID (nomor acak) di grup; kalau resolusi LID meleset,
 * pesan terkirim "sukses" tapi nyasar ke JID yang tidak ada orangnya.
 *
 * Pakai: .cekjid  (di grup DAN di PC, lalu bandingkan hasilnya)
 */
let handler = async (m, { conn, usedPrefix, command }) => {
    const dec = (j) => { try { return conn.decodeJid ? conn.decodeJid(j) : j; } catch { return j; } };

    const senderRaw = m.sender || '-';
    const senderDec = dec(senderRaw);
    const isLid = String(senderDec).endsWith('@lid');

    const info = [
        `┏━━━〔 🔍 DIAGNOSA JID 〕━⬣`,
        `┃ Chat  : ${m.chat}`,
        `┃ Grup? : ${String(m.chat).endsWith('@g.us') ? 'YA' : 'TIDAK (PC)'}`,
        `┃`,
        `┃ sender mentah : ${senderRaw}`,
        `┃ sender decode : ${senderDec}`,
        `┃ participant   : ${m.key?.participant || '-'}`,
        `┃ LID?          : ${isLid ? '⚠️ YA — ini biang masalahnya' : '✅ TIDAK (nomor asli)'}`,
        `┃`,
        `┃ owner config  : ${Array.isArray(global.owner) ? global.owner[0] : global.owner}`,
        `┃ bot id        : ${dec(conn.user?.id)}`,
        `┃ bot lid       : ${conn.authState?.creds?.me?.lid || '-'}`,
        `┗━━━━━━━━━━━━━━━━⬣`,
    ].join('\n');

    await m.reply(info);

    // Tes kirim ke JID yang persis dipakai transaksi (m.sender), seperti settle.js.
    try {
        await conn.sendMessage(senderDec, {
            text: `🧪 Tes kirim ke: ${senderDec}\n\nKalau pesan ini masuk ke chat pribadi kamu, berarti JID-nya BENAR.\nKalau tidak masuk, JID ini salah alamat.`,
        });
        await m.reply(`✅ Tes kirim ke ${senderDec} → tidak error.\n\nSekarang cek chat pribadi bot: pesan tesnya masuk atau tidak?`);
    } catch (e) {
        await m.reply(`❌ Tes kirim ke ${senderDec} GAGAL: ${e.message}`);
    }
};

handler.help = ['cekjid'];
handler.command = ['cekjid', 'jid'];
handler.tags = ['owner'];
handler.owner = true;

export default handler;
