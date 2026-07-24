/*
  Anti Dev Sampah
  Banyak bacot, minim berpikir 🫢
*/

const protect = async (m, { conn, dbChat, dbUser, dbBot, isAdmin, isBotAdmin, stubType }) => {
    if (!m.isGroup) return;

    // Writen total chat
    if (m.sender && m.mtype && m.mtype !== 'protocolMessage' && m.mtype !== 'senderKeyDistributionMessage') {
        dbChat[m.chat].totalChat[m.sender] = (dbChat[m.chat].totalChat[m.sender] || 0) + 1;

        // [PERF] Auto-prune totalChat agar tidak unbounded leak (Max 100 member)
        if (Math.random() < 0.05) {
            let tcKeys = Object.keys(dbChat[m.chat].totalChat);
            if (tcKeys.length > 150) {
                // Keep top 100 most active chatters
                tcKeys.sort((a, b) => dbChat[m.chat].totalChat[b] - dbChat[m.chat].totalChat[a]);
                for (let i = 100; i < tcKeys.length; i++) {
                    delete dbChat[m.chat].totalChat[tcKeys[i]];
                }
            }
        }

        if (dbUser && dbUser[m.sender]) {
            dbUser[m.sender].lastseen = Date.now();
        }
    }

    // Detect group changes
    if (dbChat[m.chat].detect) {
    
    if (stubType?.messageStubType) {
    
        const verif = {
            key: { participant: '13135550002@s.whatsapp.net', remoteJid: "13135550002@s.whatsapp.net" },
            message: { conversation: `[ INFORMATION ]` }
        };

        const messageTypes = {
  21: `
🏷️ *Perubahan Nama Grup*
➤ Nama grup sekarang: *${stubType.messageStubParameters[0]}*
  `.trim(),

  22: `
🎨 *Perubahan Icon Grup*
➤ Icon grup telah diperbarui!
  `.trim(),

  23: `
🔗 *Reset Tautan Grup*
➤ Link undangan grup telah *di-reset*.
  `.trim(),

  24: `
📜 *Perubahan Deskripsi Grup*
➤ Deskripsi baru:  
${stubType.messageStubParameters[0]}
  `.trim(),

  25: `
🛠️ *Perubahan Edit Info*
➤ Sekarang *${stubType.messageStubParameters[0] === 'on' ? 'hanya admin' : 'semua peserta'}*
   yang boleh mengubah info grup.
  `.trim(),

  26: `
🔐 *Perubahan Status Grup*
➤ Grup telah *${stubType.messageStubParameters[0] === 'on' ? 'DITUTUP' : 'DIBUKA'}*!
➤ Pengirim: *${stubType.messageStubParameters[0] === 'on' ? 'hanya admin' : 'semua peserta'}*
  `.trim(),

  72: `
⏱️ *Durasi Pesan Sementara*
➤ Durasi telah diubah menjadi *${stubType.messageStubParameters[0]}*.
  `.trim(),

  123: `
❎ *Pesan Sementara Dinonaktifkan*
➤ Fitur pesan sementara telah *dimatikan*.
  `.trim(),

  145: `
🚀 *Perubahan Accept Join*
➤ Accept join telah *${stubType.messageStubParameters[0] === 'on' ? 'diaktifkan' : 'dinonaktifkan'}*.
  `.trim(),

  171: `
🎯 *Perubahan Izin Grup*
➤ Grup sekarang mengizinkan: *${stubType.messageStubParameters[0]?.replace(/_/g, ' ')}*.
  `.trim(),
};
            if (!(stubType.messageStubType in messageTypes)) return;
            let edtr = `@${stubType.participant.split(`@`)[0]}`;
            await conn.sendMessage(m.chat, { text: `Admin: ${edtr}\n\n${messageTypes[stubType.messageStubType]}`, mentions: [stubType.participant] }, { quoted: verif });
        }
    }
};

export { protect };
