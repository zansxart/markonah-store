import fs from'fs'
import { tmpdir } from"os"
import Crypto from "crypto"
import webp from "node-webpmux"
import path from "path"
import { fileTypeFromBuffer } from 'file-type'
import { ffmpeg as convertWithFfmpeg } from './converter.js'

const getReadableMediaError = (error, fallback = 'Media tidak valid atau formatnya tidak didukung.') => {
    const text = [error?.message, error?.stderr].filter(Boolean).join('\n').trim()
    if (!text) return fallback
    if (/invalid data found when processing input|cannot determine format|invalid argument|buffer media kosong|format media tidak dikenali/i.test(text)) {
        return fallback
    }
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
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
}

async function imageToWebp(media) {
    await validateMediaBuffer(media, 'image')
    const converted = await convertWithFfmpeg(media, [
        "-vcodec",
        "libwebp",
        "-vf",
        "scale='min(320,iw)':min'(320,ih)':force_original_aspect_ratio=decrease,fps=15, pad=320:320:-1:-1:color=white@0.0, split [a][b]; [a] palettegen=reserve_transparent=on:transparency_color=ffffff [p]; [b][p] paletteuse"
    ], '', 'webp').catch((err) => {
        throw new Error(getReadableMediaError(err, 'Gagal mengubah gambar ke webp.'))
    })
    try {
        return converted.data
    } finally {
        await converted.delete().catch(() => {})
    }
}

async function videoToWebp(media) {
    await validateMediaBuffer(media, 'video')
    const converted = await convertWithFfmpeg(media, [
        "-vcodec",
        "libwebp",
        "-vf",
        "scale='min(320,iw)':min'(320,ih)':force_original_aspect_ratio=decrease,fps=15, pad=320:320:-1:-1:color=white@0.0, split [a][b]; [a] palettegen=reserve_transparent=on:transparency_color=ffffff [p]; [b][p] paletteuse",
        "-loop",
        "0",
        "-ss",
        "00:00:00",
        "-t",
        "00:00:05",
        "-preset",
        "default",
        "-an",
        "-vsync",
        "0"
    ], '', 'webp').catch((err) => {
        throw new Error(getReadableMediaError(err, 'Gagal mengubah video ke webp.'))
    })
    try {
        return converted.data
    } finally {
        await converted.delete().catch(() => {})
    }
}

async function writeExifImg(media, metadata) {
    let wMedia = await imageToWebp(media)
    const tmpFileIn = path.join(tmpdir(), `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`)
    const tmpFileOut = path.join(tmpdir(), `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`)
    fs.writeFileSync(tmpFileIn, wMedia)
    if (metadata.packname || metadata.author) {
        let success = false
        try {
            const img = new webp.Image()
            const json = { "sticker-pack-id": `https://github.com/DikaArdnt/Hisoka-Morou`, "sticker-pack-name": metadata.packname, "sticker-pack-publisher": metadata.author, "emojis": metadata.categories ? metadata.categories : [""] }
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

async function writeExifVid(media, metadata) {
    let wMedia = await videoToWebp(media)
    const tmpFileIn = path.join(tmpdir(), `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`)
    const tmpFileOut = path.join(tmpdir(), `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`)
    fs.writeFileSync(tmpFileIn, wMedia)
    if (metadata.packname || metadata.author) {
        let success = false
        try {
            const img = new webp.Image()
            const json = { "sticker-pack-id": `https://dikode-team.com`, "sticker-pack-name": metadata.packname, "sticker-pack-publisher": metadata.author, "emojis": metadata.categories ? metadata.categories : [""] }
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

export default { imageToWebp, videoToWebp, writeExifImg, writeExifVid }
