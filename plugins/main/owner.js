/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */

let handler = async (m, { conn }) => {
    let rawOwner = global.owner || global.info?.numberOwn || '6285802569316';
    if (Array.isArray(rawOwner)) rawOwner = rawOwner[0];
    if (Array.isArray(rawOwner)) rawOwner = rawOwner[0];
    let cleanOwnerNum = String(rawOwner).replace(/[^0-9]/g, '');
    
    let waLink = `https://wa.me/${cleanOwnerNum}`;
    let igLink = global.url?.ig || 'https://instagram.com/zansxart';
    
    let text = `\`INFORMASI OWNER & CONTACT\`

↳ *Nomor:* +${cleanOwnerNum}
↳ *WhatsApp:* ${waLink}
↳ *Instagram:* ${igLink}


_Silakan hubungi kontak di atas jika ada pertanyaan / kendala!_`;

    let vcard = `BEGIN:VCARD
VERSION:3.0
N:;Owner;;;
FN:Owner
TEL;type=CELL;type=VOICE;waid=${cleanOwnerNum}:+${cleanOwnerNum}
END:VCARD`;

    await conn.sendMessage(m.chat, {
        contacts: {
            displayName: 'Owner',
            contacts: [{ vcard }]
        }
    }, { quoted: m });
    
    await m.reply(text);
};

handler.help = ['owner', 'admin', 'cs'];
handler.command = ['owner', 'admin', 'cs'];
handler.tags = ['main'];
export default handler;
