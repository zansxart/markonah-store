/*
wa.me/6282285357346
github: https://github.com/zansxart
Instagram: https://instagram.com/tulisan.ku.id
ini wm gw cok jan di hapus
*/

import PhoneNumber from 'awesome-phonenumber'
import chalk from 'chalk'
import boxen from 'boxen'
import {
    unwatchFile,
    watchFile
} from 'fs'

const urlRegex = (await import('url-regex-safe')).default({
    strict: false
})

const MAX_TEXT_LOG = 700

const stripJid = (jid = '') => String(jid || '').replace(/@.*$/, '')
const isNumericId = (value = '') => /^\d+$/.test(String(value || ''))
const normalizeText = (text = '') => String(text || '').replace(/\u200e+/g, '').replace(/\s+/g, ' ').trim()
const truncate = (text = '', limit = MAX_TEXT_LOG) => text.length > limit ? `${text.slice(0, limit - 3)}...` : text

function formatPhone(rawNumber = '') {
    const value = String(rawNumber || '')
    if (!value) return 'unknown'
    if (!isNumericId(value)) return value

    try {
        const pn = PhoneNumber(`+${value}`)
        return pn.isValid() ? pn.getNumber('international') : `+${value}`
    } catch {
        return `+${value}`
    }
}

function formatBytes(size = 0) {
    const numericSize = Number(size) || 0
    if (numericSize <= 0) return '0 B'

    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const power = Math.min(Math.floor(Math.log(numericSize) / Math.log(1024)), units.length - 1)
    const value = numericSize / 1024 ** power

    return `${value.toFixed(power === 0 ? 0 : 1)} ${units[power]}`
}

function getSenderJid(m) {
    return m.realSender || m.sender || m.key?.participant || m.participant || ''
}

function getRawSenderNumber(m) {
    const senderJid = getSenderJid(m)
    const senderNumber = stripJid(senderJid)
    if (isNumericId(senderNumber)) return senderNumber

    const alternativeNumber = stripJid(m.key?.participant || m.participant || '')
    return alternativeNumber || senderNumber
}

function getSenderLabel(m) {
    const senderJid = getSenderJid(m)
    const savedName = global.db?.data?.users?.[senderJid]?.name || ''
    const displayName = normalizeText(m.pushName || savedName)
    const numberLabel = formatPhone(getRawSenderNumber(m) || stripJid(senderJid))

    if (displayName && numberLabel && displayName.toLowerCase() !== numberLabel.toLowerCase()) {
        return `${displayName} (${numberLabel})`
    }

    return displayName || numberLabel || 'unknown'
}

function getChatLabel(m, conn) {
    if (!m.isGroup) return 'Private Chat'

    const chatInfo = conn?.chats?.[m.chat] || {}
    return normalizeText(
        chatInfo.metadata?.subject ||
        chatInfo.subject ||
        chatInfo.name ||
        stripJid(m.chat) ||
        'Group Chat'
    )
}

function getFileSize(m) {
    return (
        m?.msg?.vcard?.length ||
        m?.msg?.fileLength?.low ||
        m?.msg?.fileLength ||
        m?.msg?.axolotlSenderKeyDistributionMessage?.length ||
        m?.msg?.caption?.length ||
        m?.text?.length ||
        0
    )
}

function getMessageType(m) {
    if (!m?.mtype) return 'Unknown'

    const rawType = String(m.mtype)
    if (/audio/i.test(rawType)) return m?.msg?.ptt ? 'PTT' : 'Audio'

    return rawType
        .replace(/message$/i, '')
        .replace(/^./, (value) => value.toUpperCase())
}

function getMessageTime(m) {
    const timestamp = m?.messageTimestamp
        ? (m.messageTimestamp.low || m.messageTimestamp) * 1000
        : Date.now()

    return new Date(timestamp).toLocaleTimeString('id-ID', {
        hour12: false
    })
}

function getContentPreview(m) {
    const preview = [
        m?.text,
        m?.caption,
        m?.msg?.caption,
        m?.msg?.conversation,
        m?.msg?.selectedDisplayText,
        m?.msg?.fileName,
        m?.msg?.displayName
    ]
        .map(normalizeText)
        .find(Boolean)

    return preview || ''
}

function stylePreview(text) {
    let output = truncate(normalizeText(text))
    if (!output) return ''

    output = output.replace(urlRegex, (url) => chalk.blueBright(url))
    output = output.replace(/@\d{5,20}/g, (mention) => chalk.cyanBright(mention))

    return output
}

function formatStubParameters(m) {
    if (!Array.isArray(m?.messageStubParameters) || m.messageStubParameters.length === 0) {
        return ''
    }

    return m.messageStubParameters
        .map((jid) => {
            const raw = stripJid(jid)
            return isNumericId(raw) ? formatPhone(raw) : raw || 'unknown'
        })
        .join(', ')
}

function getDetailLabel(m) {
    if (/document/i.test(m?.mtype || '')) {
        return `document: ${truncate(normalizeText(m.msg?.fileName || m.msg?.displayName || 'document'), 90)}`
    }

    if (/audio/i.test(m?.mtype || '')) {
        const duration = Number(m?.msg?.seconds) || 0
        const minutes = String(Math.floor(duration / 60)).padStart(2, '0')
        const seconds = String(duration % 60).padStart(2, '0')
        return `${m?.msg?.ptt ? 'ptt' : 'audio'}: ${minutes}:${seconds}`
    }

    if (/ContactsArray/i.test(m?.mtype || '')) {
        return 'contacts: multiple'
    }

    if (/contact/i.test(m?.mtype || '')) {
        return `contact: ${truncate(normalizeText(m.msg?.displayName || 'contact'), 90)}`
    }

    return ''
}

function getStatusTheme(m) {
    if (m.error != null) {
        return {
            label: 'ERROR',
            borderColor: 'red',
            titleColor: chalk.redBright,
        }
    }

    if (m.isCommand) {
        return {
            label: 'COMMAND',
            borderColor: 'yellow',
            titleColor: chalk.yellowBright,
        }
    }

    return {
        label: 'MESSAGE',
        borderColor: 'cyan',
        titleColor: chalk.cyanBright,
    }
}

function createSection(title, lines = [], colorize = (value) => value) {
    const content = lines.filter(Boolean)
    if (!content.length) return ''

    return [
        colorize(title),
        ...content
    ].join('\n')
}

export default function(m, conn = { user: {} }) {
    const senderLabel = getSenderLabel(m)
    const chatLabel = getChatLabel(m, conn)
    const timeLabel = getMessageTime(m)
    const typeLabel = getMessageType(m)
    const sizeLabel = formatBytes(getFileSize(m))
    const scopeLabel = m.isGroup ? 'GROUP' : 'PRIVATE'
    const commandLabel = m.isCommand && m.command ? `${m.prefix || ''}${m.command}` : '-'
    const preview = stylePreview(getContentPreview(m))
    const stubInfo = formatStubParameters(m)
    const detailLabel = getDetailLabel(m)
    const theme = getStatusTheme(m)

    const infoSection = createSection(
        'INFO',
        [
            `${chalk.gray('Time    :')} ${chalk.white(timeLabel)}`,
            `${chalk.gray('Sender  :')} ${chalk.white(senderLabel)}`,
            `${chalk.gray('Chat    :')} ${chalk.cyan(chatLabel)}`,
            `${chalk.gray('Scope   :')} ${chalk.white(scopeLabel)}`,
            `${chalk.gray('Type    :')} ${chalk.white(typeLabel)}`,
            `${chalk.gray('Size    :')} ${chalk.white(sizeLabel)}`,
            `${chalk.gray('Command :')} ${m.isCommand ? chalk.yellow(commandLabel) : chalk.gray(commandLabel)}`,
        ],
        (title) => theme.titleColor(title)
    )

    const contentSection = createSection(
        'CONTENT',
        [preview || chalk.gray('-')],
        (title) => chalk.magentaBright(title)
    )

    const extras = [
        stubInfo ? `${chalk.gray('Stub    :')} ${chalk.gray(stubInfo)}` : '',
        detailLabel ? `${chalk.gray('Detail  :')} ${chalk.gray(detailLabel)}` : '',
    ].filter(Boolean)

    const extraSection = extras.length
        ? createSection('EXTRA', extras, (title) => chalk.greenBright(title))
        : ''

    const boxContent = [
        infoSection,
        contentSection,
        extraSection
    ].filter(Boolean).join('\n\n')

    console.log(
        boxen(boxContent, {
            padding: {
                top: 0,
                bottom: 0,
                left: 1,
                right: 1,
            },
            margin: {
                top: 0,
                bottom: 0,
                left: 0,
                right: 0,
            },
            borderStyle: 'round',
            borderColor: theme.borderColor,
            title: ` ${theme.label} `,
            titleAlignment: 'left',
        })
    )

    console.log('')
}

let file = global.__filename(import.meta.url)
watchFile(file, (curr, prev) => {
    if (curr.mtime.getTime() === prev.mtime.getTime()) return
    unwatchFile(file)
    console.log(chalk.redBright("Update 'core/services/runtime/print.js'"))
    import(`${file}?update=${Date.now()}`)
})
