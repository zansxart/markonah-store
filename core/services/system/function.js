import { watchFile, unwatchFile } from 'fs'
import chalk from 'chalk'
import { fileURLToPath } from 'url'
import fs from 'fs'
import axios from 'axios'
import fetch from 'node-fetch'
import crypto from 'crypto'
import path from 'path'
import { tmpdir } from 'os'
import webp from 'node-webpmux'
import util from "util"
import { fileTypeFromBuffer } from 'file-type'
import { ffmpeg as convertWithFfmpeg } from '../media/converter.js'

const getReadableMediaError = (error, fallback = 'Media tidak valid atau formatnya tidak didukung.') => {
const text = [error?.message, error?.stderr].filter(Boolean).join('\n').trim()
if (!text) return fallback
if (/invalid data found when processing input|cannot determine format|invalid argument|buffer media kosong|format media tidak dikenali/i.test(text)) {
return fallback
}
const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
return lines.slice(-2).join(' | ') || fallback
}

const validateMediaBuffer = async (media, expectedType) => {
if (!Buffer.isBuffer(media) || media.length === 0) throw new Error('Buffer media kosong.')
const detected = await fileTypeFromBuffer(media).catch(() => null)
if (expectedType === 'image' && detected?.mime && !/^image\//i.test(detected.mime)) {
throw new Error('Media gambar tidak valid.')
}
if (expectedType === 'video' && detected?.mime && !/^video\//i.test(detected.mime)) {
throw new Error('Media video tidak valid.')
}
return detected
}

export async function readmore(text) {
const more = String.fromCharCode(8206)
const readMore = more.repeat(4001)
   return `${text}${readMore}`
};
export async function maxSize(fileSize, maxSize) {
    return {
      oversize: fileSize > maxSize
    };
  }
export async function regex(string) {
        return string.replace(/[.*=+:\-?^${}()|[\]\\]|\s/g, '\\$&')
    }
export async function delay(ms) {
return new Promise(res => setTimeout(res, ms))
}
export async function random(ext) {
return `${Math.floor(Math.random() * 10000)}${ext}`
}
export async function isUrl(url) {
return url.match(new RegExp(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%.+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%+.~#?&/=]*)/, 'gi'))
}
export async function pickRandom(arr) {
return arr[Math.floor(Math.random() * arr.length)]
}

export async function toRupiah(x) {
x = x.toString()
var pattern = /(-?\d+)(\d{3})/;
while (pattern.test(x))
x = x.replace(pattern, "$1.$2");
return x;
}
export async function toSize(number) {
var SI_POSTFIXES = ["B", " KB", " MB", " GB", " TB", " PB", " EB"]
var tier = Math.log10(Math.abs(number)) / 3 | 0
if(tier == 0) return number
var postfix = SI_POSTFIXES[tier]
var scale = Math.pow(10, tier * 3)
var scaled = number / scale
var formatted = scaled.toFixed(1) + ''
if (/\.0$/.test(formatted))
formatted = formatted.substr(0, formatted.length - 2)
return formatted + postfix
}
export async function toTime(ms) {
let h = Math.floor(ms / 3600000)
let m = Math.floor(ms / 60000) % 60
let s = Math.floor(ms / 1000) % 60
return [h, m, s].map(v => v.toString().padStart(2, 0)).join(':')
}
export async function translate(query = "", lang) {
	if (!query.trim()) return "";
	const url = new URL("https://translate.googleapis.com/translate_a/single");
	url.searchParams.append("client", "gtx");
	url.searchParams.append("sl", "auto");
	url.searchParams.append("dt", "t");
	url.searchParams.append("tl", lang);
	url.searchParams.append("q", query);

	try {
		const response = await fetch(url.href);
		const data = await response.json();
		if (data) {
			return [data[0].map((item) => item[0].trim()).join("\n"), data[2]];
		} else {
			return "";
		}
	} catch (err) {
		throw err;
	}
}
 export async function hitungMundur(tanggal, bulan, tahun) {
let from = new Date(`${bulan} ${tanggal}, ${tahun} 00:00:00`).getTime();
let now = Date.now();
let distance = from - now;
let days = Math.floor(distance / (1000 * 60 * 60 * 24));
let hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
let minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
let seconds = Math.floor((distance % (1000 * 60)) / 1000);
return days + ' Hari ' + hours + ' Jam ' + minutes + ' Menit ' + seconds + ' Detik'
}

export async function styleText(type, text) {
if (type === 'bold') {
return '*' + text + '*'
} else if (type === 'italic') {
return '_' + text + '_'
} else if (type === 'monospace') {
return '```' + text + '```'
} else {
return '~' + text + '~'
}
}

export async function makeid(length) {
let result = '';
let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
let charactersLength = characters.length;
for (let i = 0; i < length; i++) {
result += characters.charAt(Math.floor(Math.random() *
charactersLength));
}
return result;
}

export async function randomNomor(min, max = null) {
if (max !== null) {
min = Math.ceil(min);
max = Math.floor(max);
return Math.floor(Math.random() * (max - min + 1)) + min;
} else {
return Math.floor(Math.random() * min) + 1
}
}

export async function resize(image, width = 200, height = 200) {
let img = await read(image);
let hasil = await img.resize(width, height).getBufferAsync(MIME_JPEG);
return hasil
}

export async function fetchText(url, options) {
     new Promise(async(resolve, reject) => {
fetch(url, options).then(response => response.text())
.then(text => {
resolve(text)
}).catch((err) => {
reject(err)
})
})
}

export async function fetchBuffer(url, options) {
	try {
		options ? options : {}
		const res = await axios({
			method: "GET",
			url,
			headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.70 Safari/537.36",
				'DNT': 1,
				'Upgrade-Insecure-Request': 1
			},
			...options,
			responseType: 'arraybuffer'
		})
		return res.data
	} catch (err) {
		return err
	}
}

export async function fetchJson(url, options) {
    try {
        options ? options : {}
        const res = await axios({
            method: 'GET',
            url: url,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.69 Safari/537.36'
            },
            ...options
        })
        return res.data
    } catch (err) {
        return err
    }
}

export async function jsonFormat(obj) {
try {
let print = (obj && (obj.constructor.name == 'Object' || obj.constructor.name == 'Array')) ? require('util').format(JSON.stringify(obj, null, 2)) : util.format(obj)
return print
} catch {
return util.format(obj)
}
}

export async function texted(type, text) {
if (type === 'bold') {
return '*' + text + '*'
} else if (type === 'italic') {
return '_' + text + '_'
} else if (type === 'monospace') {
return '```' + text + '```'
} else {
return '~' + text + '~'
}
}

export async function msToTime(ms) {
var milliseconds = parseInt((ms % 1000) / 100),
seconds = Math.floor((ms / 1000) % 60),
minutes = Math.floor((ms / (1000 * 60)) % 60),
hours = Math.floor((ms / (1000 * 60 * 60)) % 24)
let h = (hours < 10) ? '0' + hours : hours
let m = (minutes < 10) ? '0' + minutes : minutes
let s = (seconds < 10) ? '0' + seconds : seconds
return h + ':' + m + ':' + s
}

export async function clockString(ms) {
let h = isNaN(ms) ? '--' : Math.floor(ms / 3600000)
let m = isNaN(ms) ? '--' : Math.floor(ms / 60000) % 60
let s = isNaN(ms) ? '--' : Math.floor(ms / 1000) % 60
return [h, m, s].map(v => v.toString().padStart(2, 0)).join(':')
}

export async function uuid() {
var dt = new Date().getTime()
var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
var r = (dt + Math.random() * 16) % 16 | 0;
var y = Math.floor(dt / 16);
return (c == 'x' ? r : (r & 0x3 | 0x8)).toString(16);
});
return uuid
}

export async function deleteFolder(path) {
  if (fs.existsSync(path)) {
    fs.readdirSync(path).forEach((file, index) => {
      const curPath = path + '/' + file;
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolder(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(path);
    console.log('Folder berhasil dihapus.');
  } else {
    console.log('Folder tidak ditemukan.');
  }
}
export async function exam(prefix, cmd, txt) {
return `📮 [ *Example* ]\n\n- ${prefix + cmd} ${txt}`
}

var xStr = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
var yStr = Object.freeze({
1: ['ᴀ', 'ʙ', 'ᴄ', 'ᴅ', 'ᴇ', 'ꜰ', 'ɢ', 'ʜ', 'ɪ', 'ᴊ', 'ᴋ', 'ʟ', 'ᴍ', 'ɴ', 'ᴏ', 'ᴘ', 'q', 'ʀ', 'ꜱ', 'ᴛ', 'ᴜ', 'ᴠ', 'ᴡ', 'x', 'ʏ', 'ᴢ', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
2: ['𝑎', '𝑏', '𝑐', '𝑑', '𝑒', '𝑓', '𝑔', 'ℎ', '𝑖', '𝑗', '𝑘', '𝑙', '𝑚', '𝑛', '𝑜', '𝑝', '𝑞', '𝑟', '𝑠', '𝑡', '𝑢', '𝑣', '𝑤', '𝑥', '𝑦', '𝑧', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
3: ['𝐚', '𝐛', '𝐜', '𝐝', '𝐞', '𝐟', '𝐠', '𝐡', '𝐢', '𝐣', '𝐤', '𝐥', '𝐦', '𝐧', '𝐨', '𝐩', '𝐪', '𝐫', '𝐬', '𝐭', '𝐮', '𝐯', '𝐰', '𝐱', '𝐲', '𝐳', '𝟏', '𝟐', '𝟑', '𝟒', '𝟓', '𝟔', '𝟕', '𝟖', '𝟗', '𝟎'],
4: ['𝒂', '𝒃', '𝒄', '𝒅', '𝒆', '𝒇', '𝒈', '𝒉', '𝒊', '𝒋', '𝒌', '𝒍', '𝒎', '𝒏', '𝒐', '𝒑', '𝒒', '𝒓', '𝒔', '𝒕', '𝒖', '𝒗', '𝒘', '𝒙', '𝒚', '𝒛', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
5: ['𝗮', '𝗯', '𝗰', '𝗱', '𝗲', '𝗳', '𝗴', '𝗵', '𝗶', '𝗷', '𝗸', '𝗹', '𝗺', '𝗻', '𝗼', '𝗽', '𝗾', '𝗿', '𝘀', '𝘁', '𝘂', '𝘃', '𝘄', '𝘅', '𝘆', '𝘇', '𝟭', '𝟮', '𝟯', '𝟰', '𝟱', '𝟲', '𝟳', '𝟴', '𝟵', '𝟬'],
6: ['ᵃ', 'ᵇ', 'ᶜ', 'ᵈ', 'ᵉ', 'ᶠ', 'ᵍ', 'ʰ', 'ⁱ', 'ʲ', 'ᵏ', 'ˡ', 'ᵐ', 'ⁿ', 'ᵒ', 'ᵖ', 'ᵠ', 'ʳ', 'ˢ', 'ᵗ', 'ᵘ', 'ᵛ', 'ʷ', 'ˣ', 'ʸ', 'ᶻ', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹', '⁰'],
7: ['ᗩ', 'ᗷ', 'ᑕ', 'ᗪ', 'ᗴ', 'ᖴ', 'ᘜ', 'ᕼ', 'I', 'ᒍ', 'K', 'ᒪ', 'ᗰ', 'ᑎ', 'O', 'ᑭ', 'ᑫ', 'ᖇ', 'Տ', 'T', 'ᑌ', 'ᐯ', 'ᗯ', '᙭', 'Y', 'ᘔ', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
8: ['𝙖', '𝙗', '𝙘', '𝙙', '𝙚', '𝙛', '𝙜', '𝙝', '𝙞', '𝙟', '𝙠', '𝙡', '𝙢', '𝙣', '𝙤', '𝙥', '𝙦', '𝙧', '𝙨', '𝙩', '𝙪', '𝙫', '𝙬', '𝙭', '𝙮', '𝙯', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
9: ['𝘢', '𝘣', '𝘤', '𝘥', '𝘦', '𝘧', '𝘨', '𝘩', '𝘪', '𝘫', '𝘬', '𝘭', '𝘮', '𝘯', '𝘰', '𝘱', '𝘲', '𝘳', '𝘴', '𝘵', '𝘶', '𝘷', '𝘸', '𝘹', '𝘺', '𝘻', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
10: ['𝖺', '𝖻', '𝖼', '𝖽', '𝖾', '𝖿', '𝗀', '𝗁', '𝗂', '𝗃', '𝗄', '𝗅', '𝗆', '𝗇', '𝗈', '𝗉', '𝗊', '𝗋', '𝗌', '𝗍', '𝗎', '𝗏', '𝗐', '𝗑', '𝗒', '𝗓', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
11: ['Ⓐ︎', 'Ⓑ', '︎Ⓒ', '︎Ⓓ︎', 'Ⓔ︎', 'Ⓕ︎', 'Ⓖ︎', 'Ⓗ︎', 'Ⓘ︎', 'Ⓙ︎', 'Ⓚ︎', 'Ⓛ︎', 'Ⓜ︎', 'Ⓝ︎', 'Ⓞ︎', 'Ⓟ', '︎Ⓠ︎', 'Ⓡ︎', 'Ⓢ', '︎Ⓣ︎', 'Ⓤ︎', 'Ⓥ︎', 'Ⓦ︎', 'Ⓧ︎', 'Ⓨ︎', 'Ⓩ︎', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
12: ['🅐︎', '🅑︎', '🅒', '︎🅓︎', '🅔︎', '🅕︎', '🅖︎', '🅗', '︎🅘︎', '🅙︎', '🅚', '︎🅛︎', '🅜', '︎🅝︎', '🅞', '︎🅟', '︎🅠︎', '🅡︎', '🅢', '︎🅣', '︎🅤', '︎🅥︎', '🅦︎', '🅧︎', '🅨︎', '🅩︎', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
13: ['𝓪', '𝓫', '𝓬', '𝓭', '𝓮', '𝓯', '𝓰', '𝓱', '𝓲', '𝓳', '𝓴', '𝓵', '𝓶', '𝓷', '𝓸', '𝓹', '𝓺', '𝓻', '𝓼', '𝓽', '𝓾', '𝓿', '𝔀', '𝔁', '𝔂', '𝔃', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
14: ['ⓐ', 'ⓑ', 'ⓒ', 'ⓓ', 'ⓔ', 'ⓕ', 'ⓖ', 'ⓗ', 'ⓘ', 'ⓙ', 'ⓚ', 'ⓛ', 'ⓜ', 'ⓝ', 'ⓞ', 'ⓟ', 'ⓠ', 'ⓡ', 'ⓢ', 'ⓣ', 'ⓤ', 'ⓥ', 'ⓦ', 'ⓧ', 'ⓨ', 'ⓩ', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⓪'],
15: ['𝚊', '𝚋', '𝚌', '𝚍', '𝚎', '𝚏', '𝚐', '𝚑', '𝚒', '𝚓', '𝚔', '𝚕', '𝚖', '𝚗', '𝚘', '𝚙', '𝚚', '𝚛', '𝚜', '𝚝', '𝚞', '𝚟', '𝚠', '𝚡', '𝚢', '𝚣', '𝟷', '𝟸', '𝟹', '𝟺', '𝟻', '𝟼', '𝟽', '𝟾', '𝟿', '𝟶'],
16: ['🄰', '🄱', '🄲', '🄳', '🄴', '🄵', '🄶', '🄷', '🄸', '🄹', '🄺', '🄻', '🄼', '🄽', '🄾', '🄿', '🅀', '🅁', '🅂', '🅃', '🅄', '🅅', '🅆', '🅇', '🅈', '🅉', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⓪'],
17: ['𝕒', '𝕓', '𝕔', '𝕕', '𝕖', '𝕗', '𝕘', '𝕙', '𝕚', '𝕛', '𝕜', '𝕝', '𝕞', '𝕟', '𝕠', '𝕡', '𝕢', '𝕣', '𝕤', '𝕥', '𝕦', '𝕧', '𝕨', '𝕩', '𝕪', '𝕫', '𝟙', '𝟚', '𝟛', '𝟜', '𝟝', '𝟞', '𝟟', '𝟠', '𝟡', '𝟘'],
18: ['【a】', '【b】', '【c】', '【d】', '【e】', '【f】', '【g】', '【h】', '【i】', '【j】', '【k】', '【l】', '【m】', '【n】', '【o】', '【p】', '【q】', '【r】', '【s】', '【t】', '【u】', '【v】', '【w】', '【x】', '【y】', '【z】', '【1】', '【2】', '【3】', '【4】', '【5】', '【6】', '【7】', '【8】', '【9】', '【0】'],
19: ['ａ', 'ｂ', 'ｃ', 'ｄ', 'ｅ', 'ｆ', 'ｇ', 'ｈ', 'ｉ', 'ｊ', 'ｋ', 'ｌ', 'ｍ', 'ｎ', 'ｏ', 'ｐ', 'ｑ', 'ｒ', 'ｓ', 'ｔ', 'ｕ', 'ｖ', 'ｗ', 'ｘ', 'ｙ', 'ｚ', '１', '２', '３', '４', '５', '６', '７', '８', '９', '０'],
20: ['𝖆', '𝖇', '𝖈', '𝖉', '𝖊', '𝖋', '𝖌', '𝖍', '𝖎', '𝖏', '𝖐', '𝖑', '𝖒', '𝖓', '𝖔', '𝖕', '𝖖', '𝖗', '𝖘', '𝖙', '𝖚', '𝖛', '𝖜', '𝖝', '𝖞', '𝖟', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
})

export async function style(text, style = 1) {
var replacer = []
xStr.map((v, i) => replacer.push({
original: v,
convert: yStr[style][i]
}))
var str = text.toLowerCase().split('')
var output = []
str.map(v => {
const find = replacer.find(x => x.original == v)
find ? output.push(find.convert) : output.push(v)
})
return output.join('')
}

export async function imageToWebp(media) {
await validateMediaBuffer(media, 'image')
const converted = await convertWithFfmpeg(media, [
`-vcodec`,`libwebp`,`-vf`,`scale=512:512:force_original_aspect_ratio=increase,fps=15,crop=512:512`
], '', 'webp').catch(err => {
throw new Error(getReadableMediaError(err, 'Gagal mengubah gambar ke sticker.'))
})
try {
return converted.data
} finally {
await converted.delete().catch(() => {})
}
}

export async function videoToWebp(media) {
await validateMediaBuffer(media, 'video')
const converted = await convertWithFfmpeg(media, [
`-vcodec`,`libwebp`,`-vf`,`scale=512:512:force_original_aspect_ratio=increase,fps=15,crop=512:512`,
`-loop`,`0`,`-ss`,`00:00:00`,`-t`,`00:00:05`,`-preset`,`default`,`-an`,`-vsync`,`0`
], '', 'webp').catch(err => {
throw new Error(getReadableMediaError(err, 'Gagal mengubah video ke sticker.'))
})
try {
return converted.data
} finally {
await converted.delete().catch(() => {})
}
}

export async function writeExif(media, metadata) {
let wMedia = /webp/.test(media.mimetype) ? media.data : /image/.test(media.mimetype) ? await imageToWebp(media.data) : /video/.test(media.mimetype) ? await videoToWebp(media.data) : ""
if (!Buffer.isBuffer(wMedia) || wMedia.length === 0) throw new Error('Media tidak didukung untuk sticker.')
const tmpFileIn = path.join(tmpdir(), `${crypto.randomBytes(10).toString('hex')}.webp`)
const tmpFileOut = path.join(tmpdir(), `${crypto.randomBytes(10).toString('hex')}.webp`)
fs.writeFileSync(tmpFileIn, wMedia)

if (metadata.packname || metadata.author) {
let success = false
try {
const img = new webp.Image()
const json = { "sticker-pack-id": `zansxart - md`, "sticker-pack-name": metadata.packname, "sticker-pack-publisher": metadata.author, "emojis": metadata.categories ? metadata.categories : [""] }
const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00])
const jsonBuff = Buffer.from(JSON.stringify(json), "utf-8")
const exif = Buffer.concat([exifAttr, jsonBuff])
exif.writeUIntLE(jsonBuff.length, 14, 4)
await img.load(tmpFileIn)
img.exif = exif
await img.save(tmpFileOut)
success = true
return tmpFileOut
} catch (error) {
throw new Error(getReadableMediaError(error, 'Gagal membuat sticker.'))
} finally {
if (fs.existsSync(tmpFileIn)) fs.unlinkSync(tmpFileIn)
if (!success && fs.existsSync(tmpFileOut)) fs.unlinkSync(tmpFileOut)
}
}
}

let file = fileURLToPath(import.meta.url)
watchFile(file, () => {
  unwatchFile(file)
  console.log(chalk.redBright("Update 'function.js'"))
  import(`${file}?update=${Date.now()}`)
})
