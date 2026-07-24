import fs from "fs";
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jsonMessagePath = path.resolve(__dirname, '../../../storage/json/message.json');
const jsonMessage = JSON.parse(fs.readFileSync(jsonMessagePath, "utf-8"));

// Cache buffers in memory to avoid repeating slow synchronous disk I/O on every failed message
const bufferCache = new Map();
function getCachedBuffer(filePath) {
    if (!filePath) return null;
    if (!bufferCache.has(filePath)) {
        try {
            if (fs.existsSync(filePath)) {
                bufferCache.set(filePath, fs.readFileSync(filePath));
            } else {
                bufferCache.set(filePath, null);
            }
        } catch (e) {
            console.error('[FAILED BUFFER CACHE ERROR]', e);
            bufferCache.set(filePath, null);
        }
    }
    return bufferCache.get(filePath);
}

export async function failed(type, m, conn) {
    let msg = jsonMessage.message[type]
        
    if (msg) {
        const thumbnail = getCachedBuffer(global.media.sistem["akses"]);
        const textContent = `${msg}${type === "joinonly" ?  "\n\n> " + global.url.sgc : ""}${type === "gconly" ?  "\n\n👉 *Silakan bergabung ke Grup Official kami terlebih dahulu untuk mendapatkan izin PC:*\n" + global.url.sgc : ""}`;
        
        if (thumbnail) {
            return conn.sendMessage(m.chat, {
                image: thumbnail,
                caption: textContent
            }, { quoted: m })
        } else {
            return conn.sendMessage(m.chat, { text: textContent }, { quoted: m })
        }
    }
        
    let daftar = {
        unreg: `❞Untuk menggunakan Bot silahkan daftar ke database terlebih dahulu, dengan cara:❞ 

*METHOD 1*
- Cara pertama bisa dengan ketik *.daftar*
*METHOD 2*
- Cara kedua cukup dengan ketik *@verify*

🧾 *Noted*
> ➦ Menggunakan *@verify* status umur random oleh Bot
> ➦ Jika ada kesalahan Nama atau Umur, silahkan ketik *.unreg _paste SN kalian_*
> ➦ Cara cek SN kalian dengan cara ketik *.ceksn*`
    }[type]
  
    if (daftar) {
        const thumbnail = getCachedBuffer(global.media.sistem["register"]);
        
        if (thumbnail) {
            return conn.sendMessage(m.chat, {
                image: thumbnail,
                caption: daftar
            }, { quoted: m })
        } else {
            return conn.sendMessage(m.chat, { text: daftar }, { quoted: m })
        }
    }
}
