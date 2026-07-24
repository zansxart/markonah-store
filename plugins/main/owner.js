/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */

let handler = async (m, { conn }) => {
    let ownerNum = (Array.isArray(global.owner) && global.owner[0]) ? global.owner[0] : '6281234567890';
    if (Array.isArray(ownerNum)) ownerNum = ownerNum[0];
    let cleanOwnerNum = String(ownerNum).replace(/[^0-9]/g, '');
    
    let waLink = `https://wa.me/${cleanOwnerNum}`;
    let igLink = global.url?.ig || 'https://instagram.com/zansxart';
    
    let text = `┏━━━〔 👑 OWNER INFO 〕━⬣
┃
┃ ✦ Nomor: ${cleanOwnerNum}
┃ ✦ WhatsApp: ${waLink}
┃ ✦ Instagram: ${igLink}
┃
┗━━━━━━━━━━━━━━━━⬣`;

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
