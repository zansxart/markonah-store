import crypto from 'crypto'
import path from 'path'
import zlib from 'zlib'
import javascriptObfuscator from 'javascript-obfuscator'
import * as JsConfuser from 'js-confuser'

const ARMOR_PREFIX = '/*__MARKONAH_MD__:'
const ARMOR_SUFFIX = ':__MARKONAH_MD__*/'
const DEFAULT_PASSWORD_LENGTH = 24

const MODE_VALUES = new Set(['safe', 'hard', 'extreme'])
const STYLE_VALUES = new Set(['plain', 'mixed', 'cn', 'arab'])

function toBase64(value) {
    return Buffer.from(value).toString('base64')
}

function fromBase64(value) {
    return Buffer.from(String(value || ''), 'base64')
}

function stripWrappedQuotes(value) {
    const input = String(value || '')
    if (
        (input.startsWith('"') && input.endsWith('"')) ||
        (input.startsWith("'") && input.endsWith("'")) ||
        (input.startsWith('`') && input.endsWith('`'))
    ) {
        return input.slice(1, -1)
    }
    return input
}

export function normalizeArmorMode(value) {
    const mode = String(value || '').toLowerCase()
    return MODE_VALUES.has(mode) ? mode : 'hard'
}

export function normalizeArmorStyle(value) {
    const style = String(value || '').toLowerCase()
    return STYLE_VALUES.has(style) ? style : 'mixed'
}

export function looksLikeModuleCode(code = '') {
    const input = String(code || '')
    return /^\s*(import|export)\s/m.test(input)
}

export function generateArmorPassword(length = DEFAULT_PASSWORD_LENGTH) {
    const size = Math.max(12, Number(length) || DEFAULT_PASSWORD_LENGTH)
    return crypto
        .randomBytes(Math.max(24, size * 2))
        .toString('base64')
        .replace(/[+/=]/g, '')
        .slice(0, size)
}

export function buildEncryptedFileName(fileName = 'result.js') {
    const baseName = path.basename(String(fileName || 'result.js'))
    if (/\.(mjs|cjs|js)$/i.test(baseName)) {
        return baseName.replace(/\.(mjs|cjs|js)$/i, '_enc.$1')
    }

    const clean = baseName.replace(/\.[^.]+$/, '') || 'result'
    return `${clean}_enc.js`
}

export function buildDecryptedFileName(fileName = 'result_enc.js') {
    const baseName = path.basename(String(fileName || 'result_enc.js'))
    if (/_enc\.(mjs|cjs|js)$/i.test(baseName)) {
        return baseName.replace(/_enc\.(mjs|cjs|js)$/i, '_dec.$1')
    }
    if (/\.(mjs|cjs|js)$/i.test(baseName)) {
        return baseName.replace(/\.(mjs|cjs|js)$/i, '_dec.$1')
    }

    const clean = baseName.replace(/\.[^.]+$/, '') || 'result'
    return `${clean}_dec.js`
}

export function parseArmorCommandOptions(input = '') {
    let rest = String(input || '').trim()
    const options = {
        mode: 'hard',
        style: 'mixed',
        password: '',
    }

    while (rest.startsWith('--')) {
        const match = rest.match(/^--([a-z-]+)(?:\s+("[^"]*"|'[^']*'|`[^`]*`|\S+))?\s*/i)
        if (!match) break

        const [, flagName, rawValue = ''] = match
        const flag = String(flagName || '').toLowerCase()
        const value = stripWrappedQuotes(rawValue)

        if (flag === 'mode' && value) {
            options.mode = normalizeArmorMode(value)
            rest = rest.slice(match[0].length).trimStart()
            continue
        }

        if (flag === 'style' && value) {
            options.style = normalizeArmorStyle(value)
            rest = rest.slice(match[0].length).trimStart()
            continue
        }

        if ((flag === 'password' || flag === 'key' || flag === 'pass') && value) {
            options.password = value
            rest = rest.slice(match[0].length).trimStart()
            continue
        }

        break
    }

    return {
        options,
        inlineCode: rest.trim(),
    }
}

export function createArmorHeader(payload) {
    return `${ARMOR_PREFIX}${toBase64(JSON.stringify(payload))}${ARMOR_SUFFIX}`
}

export function extractArmorPayload(input = '') {
    const source = String(input || '')
    const match = source.match(/^\/\*__MARKONAH_ARMOR__:(.+?):__MARKONAH_ARMOR__\*\/\s*/s)
    if (!match) return null

    const encoded = String(match[1] || '').replace(/\s+/g, '')
    const payload = JSON.parse(fromBase64(encoded).toString('utf8'))

    return {
        payload,
        body: source.slice(match[0].length),
        header: match[0],
    }
}

export function encryptArmorPayload(source, password, options = {}) {
    const code = String(source || '')
    const secret = String(password || '')
    if (!secret) throw new Error('Password encrypt kosong.')

    const salt = crypto.randomBytes(16)
    const iv = crypto.randomBytes(16)
    const key = crypto.scryptSync(secret, salt, 32)
    const zipped = zlib.gzipSync(Buffer.from(code, 'utf8'))
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([cipher.update(zipped), cipher.final()])
    const tag = cipher.getAuthTag()

    return {
        v: 1,
        alg: 'aes-256-gcm',
        comp: 'gzip',
        mode: normalizeArmorMode(options.mode),
        style: normalizeArmorStyle(options.style),
        fileName: options.fileName || 'encrypted.js',
        label: options.label || '',
        module: looksLikeModuleCode(code),
        hash: crypto.createHash('sha256').update(code).digest('hex'),
        createdAt: Date.now(),
        salt: salt.toString('base64'),
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        data: encrypted.toString('base64'),
    }
}

export function decryptArmorPayload(payload, password) {
    if (!payload || typeof payload !== 'object') {
        throw new Error('Payload armor tidak valid.')
    }

    const secret = String(password || '')
    if (!secret) throw new Error('Password decrypt kosong.')

    const salt = fromBase64(payload.salt)
    const iv = fromBase64(payload.iv)
    const tag = fromBase64(payload.tag)
    const encrypted = fromBase64(payload.data)
    const key = crypto.scryptSync(secret, salt, 32)

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)

    const zipped = Buffer.concat([decipher.update(encrypted), decipher.final()])
    const source = zlib.gunzipSync(zipped).toString('utf8')
    const hash = crypto.createHash('sha256').update(source).digest('hex')

    if (payload.hash && payload.hash !== hash) {
        throw new Error('Hash hasil decrypt tidak cocok.')
    }

    return source
}

function buildUnicodeDecoy(style, mode, label = '') {
    const normalizedStyle = normalizeArmorStyle(style)
    const traceId = crypto
        .createHash('sha1')
        .update(String(label || 'markonah'))
        .digest('hex')
        .slice(0, 12)
    const entries = {
        plain: {
            banner: 'MARKONAH ARMOR',
            ids: ['armorLayer', 'armorSeal', 'armorMode', 'armorTrace'],
            values: ['runtime-shield', 'unicode-decoy', mode, traceId],
        },
        mixed: {
            banner: '混淆层 / طبقة التشفير / Code Armor',
            ids: ['变量甲', 'متغير_باء', '層模式', '追踪印记'],
            values: ['markonah-armor', 'unicode-mixed', mode, traceId],
        },
        cn: {
            banner: '高级混淆保护层',
            ids: ['变量甲', '混淆层', '保护模式', '追踪印记'],
            values: ['markonah-armor', 'cn-style', mode, traceId],
        },
        arab: {
            banner: 'طبقة حماية وتشفير متقدمة',
            ids: ['متغير_الف', 'طبقة_تشفير', 'وضع_الحماية', 'بصمة_تتبع'],
            values: ['markonah-armor', 'arab-style', mode, traceId],
        },
    }[normalizedStyle]

    return [
        `/* ${entries.banner} */`,
        `const ${entries.ids[0]} = ${JSON.stringify(entries.values[0])}`,
        `const ${entries.ids[1]} = ${JSON.stringify(entries.values[1])}`,
        `const ${entries.ids[2]} = ${JSON.stringify(entries.values[2])}`,
        `const ${entries.ids[3]} = ${JSON.stringify(entries.values[3])}`,
        `void (${entries.ids[0]} && ${entries.ids[1]} && ${entries.ids[2]} && ${entries.ids[3]})`,
    ].join('\n')
}

function buildObfuscatorOptions(mode, isModule) {
    const normalizedMode = normalizeArmorMode(mode)

    return {
        compact: true,
        controlFlowFlattening: !isModule && normalizedMode !== 'safe',
        controlFlowFlatteningThreshold: !isModule
            ? normalizedMode === 'extreme' ? 0.85 : 0.45
            : 0,
        deadCodeInjection: !isModule,
        deadCodeInjectionThreshold: !isModule
            ? normalizedMode === 'extreme' ? 0.35 : 0.15
            : 0,
        identifierNamesGenerator: 'hexadecimal',
        numbersToExpressions: true,
        renameGlobals: !isModule && normalizedMode === 'extreme',
        selfDefending: !isModule && normalizedMode === 'extreme',
        simplify: true,
        splitStrings: true,
        splitStringsChunkLength: normalizedMode === 'extreme' ? 4 : 7,
        stringArray: true,
        stringArrayEncoding: normalizedMode === 'extreme' ? ['rc4', 'base64'] : ['base64'],
        stringArrayIndexShift: true,
        stringArrayShuffle: true,
        stringArrayThreshold: 1,
        transformObjectKeys: true,
        unicodeEscapeSequence: true,
    }
}

function buildConfuserOptions(mode, isModule) {
    const normalizedMode = normalizeArmorMode(mode)

    return {
        target: 'node',
        preset: 'low',
        calculator: true,
        compact: true,
        deadCode: normalizedMode === 'extreme' && !isModule ? 0.15 : 0.05,
        dispatcher: normalizedMode === 'extreme' && !isModule ? 0.35 : 0.2,
        duplicateLiteralsRemoval: 0.75,
        hexadecimalNumbers: true,
        identifierGenerator: 'randomized',
        minify: true,
        movedDeclarations: true,
        objectExtraction: true,
        renameGlobals: !isModule && normalizedMode === 'extreme',
        renameVariables: true,
        stringConcealing: true,
        astScrambler: true,
    }
}

async function applyDoubleObfuscation(code, mode) {
    const isModule = looksLikeModuleCode(code)
    const obfuscationResult = javascriptObfuscator.obfuscate(code, buildObfuscatorOptions(mode, isModule))
    const firstPass = typeof obfuscationResult.getObfuscatedCode === 'function'
        ? obfuscationResult.getObfuscatedCode()
        : String(obfuscationResult || '')

    const confuser = JsConfuser.default || JsConfuser
    if (!confuser?.obfuscate || isModule) {
        return { code: firstPass, isModule }
    }

    const secondPass = await confuser.obfuscate(firstPass, buildConfuserOptions(mode, isModule))
    const finalCode = typeof secondPass === 'string'
        ? secondPass
        : secondPass?.code || String(secondPass || '')

    return {
        code: finalCode,
        isModule,
    }
}

export async function buildProtectedCode(source, options = {}) {
    const code = String(source || '')
    if (!code.trim()) throw new Error('Kode kosong.')

    const mode = normalizeArmorMode(options.mode)
    const style = normalizeArmorStyle(options.style)
    const password = String(options.password || generateArmorPassword())
    const recoveryPayload = encryptArmorPayload(code, password, {
        mode,
        style,
        fileName: options.fileName,
        label: options.label,
    })

    const obfuscated = await applyDoubleObfuscation(code, mode)
    const protectedCode = [
        createArmorHeader(recoveryPayload),
        obfuscated.code.trim(),
        buildUnicodeDecoy(style, mode, options.label),
    ].filter(Boolean).join('\n\n')

    return {
        code: protectedCode,
        password,
        mode,
        style,
        isModule: obfuscated.isModule,
        recoveryPayload,
    }
}
