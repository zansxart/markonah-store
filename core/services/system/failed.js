import fs from "fs";
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jsonMessagePath = path.resolve(__dirname, '../../../storage/json/message.json');

function loadJsonMessage() {
    try {
        if (!fs.existsSync(jsonMessagePath)) {
            const dir = path.dirname(jsonMessagePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            const defaultConfig = {
                message: {
                    owner: "⚠️ Fitur ini khusus untuk Owner Store.",
                    admin: "⚠️ Fitur ini hanya dapat digunakan oleh Admin Store.",
                    botAdmin: "⚠️ Bot harus menjadi Admin di grup ini.",
                    group: "🛒 Fitur ini hanya dapat digunakan di dalam Grup Store.",
                    private: "🔐 Demi keamanan & privasi, fitur ini hanya dapat digunakan di Chat Pribadi.",
                    unreg: "👤 Silakan daftar akun toko terlebih dahulu untuk bertransaksi.",
                    gconly: "👉 Silakan bergabung ke Grup Official Store kami terlebih dahulu:"
                }
            };
            fs.writeFileSync(jsonMessagePath, JSON.stringify(defaultConfig, null, 2), "utf-8");
            return defaultConfig;
        }
        return JSON.parse(fs.readFileSync(jsonMessagePath, "utf-8"));
    } catch (e) {
        console.error("[FAILED SERVICE] Error loading message.json:", e);
        return { message: {} };
    }
}

let jsonMessage = loadJsonMessage();

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
