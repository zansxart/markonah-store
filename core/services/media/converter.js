import {
    promises
} from 'fs'
import {
    join
} from 'path'
import {
    spawn
} from 'child_process'
import { fileTypeFromBuffer } from 'file-type'

const getReadableFfmpegError = (stderr = '', fallback = 'Media tidak valid atau format tidak didukung.') => {
    const text = String(stderr || '').trim()
    if (!text) return fallback

    if (/invalid data found when processing input|cannot determine format|invalid argument/i.test(text)) {
        return 'Media tidak valid atau formatnya tidak didukung ffmpeg.'
    }

    const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)

    return lines.slice(-3).join(' | ') || fallback
}

function ffmpeg(buffer, args = [], ext = '', ext2 = '') {
    return new Promise(async (resolve, reject) => {
        try {
            if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
                return reject(new Error('Buffer media kosong.'))
            }

            const detectedType = await fileTypeFromBuffer(buffer).catch(() => null)
            const inputExt = detectedType?.ext || ext || 'bin'

            if (inputExt === 'bin') {
                return reject(new Error('Format media tidak dikenali.'))
            }

            let tmp = join(process.cwd(), 'tmp', +new Date + '.' + inputExt)
            let out = tmp + '.' + ext2
            await promises.writeFile(tmp, buffer)
            let stderr = ''
            const child = spawn('ffmpeg', [
                    '-y',
                    '-i', tmp,
                    ...args,
                    out
                ])
            child.stderr?.on('data', (chunk) => {
                stderr += chunk.toString()
            })
            child
                .on('error', reject)
                .on('close', async (code) => {
                    try {
                        await promises.unlink(tmp).catch(() => {})
                        if (code !== 0) return reject(new Error(getReadableFfmpegError(stderr)))
                        resolve({
                            data: await promises.readFile(out),
                            filename: out,
                            delete() {
                                return promises.unlink(out)
                            }
                        })
                    } catch (e) {
                        reject(e)
                    }
                })
        } catch (e) {
            reject(e)
        }
    })
}

/**
 * Convert Audio to Playable WhatsApp Audio
 * @param {Buffer} buffer Audio Buffer
 * @param {String} ext File Extension 
 * @returns {Promise<{data: Buffer, filename: String, delete: Function}>}
 */
function toPTT(buffer, ext) {
    return ffmpeg(buffer, [
        '-vn',
        '-c:a', 'libopus',
        '-b:a', '128k',
        '-vbr', 'on',
    ], ext, 'ogg')
}

/**
 * Convert Audio to Playable WhatsApp PTT
 * @param {Buffer} buffer Audio Buffer
 * @param {String} ext File Extension 
 * @returns {Promise<{data: Buffer, filename: String, delete: Function}>}
 */
function toAudio(buffer, ext) {
    return ffmpeg(buffer, [
        '-vn',
        '-c:a', 'libopus',
        '-b:a', '128k',
        '-vbr', 'on',
        '-compression_level', '10'
    ], ext, 'opus')
}

/**
 * Convert Audio to Playable WhatsApp Video
 * @param {Buffer} buffer Video Buffer
 * @param {String} ext File Extension 
 * @returns {Promise<{data: Buffer, filename: String, delete: Function}>}
 */
function toVideo(buffer, ext) {
    return ffmpeg(buffer, [
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-ab', '128k',
        '-ar', '44100',
        '-crf', '32',
        '-preset', 'slow'
    ], ext, 'mp4')
}

/**
 * Mengkonversi video ke resolusi dan bitrate yang diinginkan.
 * @param {Buffer} buffer Buffer video input.
 * @param {string} resolution Resolusi video (contoh: '1280x720').
 * @param {string} videoBitrate Bitrate video (contoh: '2000k').
 * @returns {Promise<Buffer>} Buffer video hasil konversi.
 */
function videoConvert(buffer, input = []) {
    return new Promise(async (resolve, reject) => {
        try {
            if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
                return reject(new Error('Buffer video kosong.'))
            }

            const detectedType = await fileTypeFromBuffer(buffer).catch(() => null)
            const inputExt = detectedType?.ext || 'mp4'
            if (inputExt === 'bin') {
                return reject(new Error('Format video tidak dikenali.'))
            }

            const tmp = join(process.cwd(), 'tmp', `${+new Date()}.${inputExt}`);
            await promises.writeFile(tmp, buffer);
            const out = `${tmp}_converted.mp4`;
            const args = [
                '-y',
                '-i', tmp,
                ...input,
                out
            ];

            let stderr = ''
            const child = spawn('ffmpeg', args)
            child.stderr?.on('data', (chunk) => {
                stderr += chunk.toString()
            })

            child
                .on('error', reject)
                .on('close', async (code) => {
                    try {
                        await promises.unlink(tmp).catch(() => {});
                        if (code !== 0) return reject(new Error(getReadableFfmpegError(stderr)));
                        const outputVideoBuffer = await promises.readFile(out);
                        await promises.unlink(out);
                        resolve(outputVideoBuffer);
                    } catch (e) {
                        reject(e);
                    }
                });
        } catch (e) {
            reject(e);
        }
    });
}


export {
    toAudio,
    toPTT,
    toVideo,
    ffmpeg,
    videoConvert
}

import {
    fileURLToPath,
    URL
} from 'url'
import chalk from 'chalk'
import fs from 'fs'
const __filename = new URL('', import.meta.url).pathname
const __dirname = new URL('.', import.meta.url).pathname
let file = fileURLToPath(import.meta.url)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log(chalk.bgGreen(chalk.black("[  UPDATE ]")), chalk.white(`${__filename}`))
    import(`${file}?update=${Date.now()}`)
})
