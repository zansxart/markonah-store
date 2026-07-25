import fs from "fs";
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jsonMessagePath = path.resolve(__dirname, '../../../storage/json/message.json');
const jsonMessage = JSON.parse(fs.readFileSync(jsonMessagePath, "utf-8"));

export async function failed(type, m, conn) {
    let msg = jsonMessage.message?.[type];
        
    if (msg) {
        const textContent = `${msg}${type === "joinonly" ? "\n\n> " + (global.url?.sgc || '') : ""}${type === "gconly" ? "\n\n👉 *Silakan bergabung ke Grup Official kami terlebih dahulu:*\n" + (global.url?.sgc || '') : ""}`;
        return conn.sendMessage(m.chat, { text: textContent }, { quoted: m });
    }
        
    let daftar = {
        unreg: `❞Untuk menggunakan Bot, silakan hubungi Admin/Owner terlebih dahulu.❞`
    }[type];
  
    if (daftar) {
        return conn.sendMessage(m.chat, { text: daftar }, { quoted: m });
    }
}
