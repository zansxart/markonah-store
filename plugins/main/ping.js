/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */

let handler = async (m, { conn }) => {
    let start = Date.now();
    let uptime = process.uptime();
    
    let days = Math.floor(uptime / 86400);
    let hours = Math.floor(uptime % 86400 / 3600);
    let minutes = Math.floor(uptime % 3600 / 60);
    let seconds = Math.floor(uptime % 60);
    
    let uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    let end = Date.now();
    let ping = end - start;
    
    let text = `┏━━━〔 🏓 PING 〕━⬣
┃ ✦ Response: ${ping} ms
┃ ✦ Uptime: ${uptimeStr}
┗━━━━━━━━━━━━━━━━⬣`;
    
    m.reply(text);
};

handler.help = ['ping', 'alive', 'bot'];
handler.command = ['ping', 'alive', 'bot'];
handler.tags = ['main'];
export default handler;
