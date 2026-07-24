import Jimp from 'jimp'
import path from 'path'
import { toAudio } from '../media/converter.js'
import chalk from 'chalk'
import fetch from 'node-fetch'
import PhoneNumber from 'awesome-phonenumber'
import fs from 'fs'
import util from 'util'
import { fileTypeFromBuffer } from 'file-type'
import { format } from 'util'
import { fileURLToPath } from 'url'
import { writeExif } from '../system/function.js'
import { isGroupJid } from './user-target.js'
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WHATSAPP_MEDIA_TIMEOUT_MESSAGE = 'Media WhatsApp sedang timeout. Coba reply atau kirim ulang medianya sebentar lagi.'

function flattenErrorText(error, seen = new WeakSet()) {
    if (!error) return ''
    if (typeof error === 'string') return error
    if (typeof error !== 'object') return String(error)
    if (seen.has(error)) return ''

    seen.add(error)

    const parts = []
    for (const key of ['name', 'message', 'code', 'errno', 'syscall', 'hostname', 'host', 'address', '_currentUrl']) {
        const value = error[key]
        if (value) parts.push(String(value))
    }

    if (Array.isArray(error.errors)) {
        for (const nestedError of error.errors) {
            const nestedText = flattenErrorText(nestedError, seen)
            if (nestedText) parts.push(nestedText)
        }
    }

    if (error.cause) {
        const causeText = flattenErrorText(error.cause, seen)
        if (causeText) parts.push(causeText)
    }

    return parts.join(' ')
}

function wrapWhatsAppMediaError(error) {
    const errorText = flattenErrorText(error)

    if (!/timed? ?out|ETIMEDOUT|408/i.test(errorText)) return error

    const wrapped = new Error(WHATSAPP_MEDIA_TIMEOUT_MESSAGE)
    wrapped.name = 'WhatsAppMediaTimeoutError'
    wrapped.code = 'WHATSAPP_MEDIA_TIMEOUT'
    wrapped.userMessage = WHATSAPP_MEDIA_TIMEOUT_MESSAGE
    wrapped.cause = error
    return wrapped
}


/**
 * @type {import('@zansxart/baileys')}
 */
const {
    default: _makeWaSocket,
    makeWASocket: _makeWaSocketNamed,
    makeWALegacySocket,
    proto,
    downloadContentFromMessage,
    jidDecode: _jidDecode,
    areJidsSameUser,
    generateWAMessage,
    getBinaryNodeChild, 
    getBinaryNodeChildren,
    generateForwardMessageContent,
    generateWAMessageContent,
    generateWAMessageFromContent,
    WAMessageStubType,
    extractMessageContent,
    prepareWAMessageMedia,
    jidNormalizedUser: _jidNormalizedUser,
    MessageType,
    toBuffer
} = await import('@zansxart/baileys')

const jidDecode = (jid) => {
    if (typeof jid !== 'string') return undefined;
    try {
        return _jidDecode(jid);
    } catch {
        return undefined;
    }
};

const jidNormalizedUser = (jid) => {
    if (typeof jid !== 'string') return '';
    try {
        return _jidNormalizedUser(jid);
    } catch {
        return jid || '';
    }
};

export function makeWASocket(connectionOptions, options = {}) {
    let makeSocket = _makeWaSocket;
    if (typeof makeSocket !== 'function') {
        if (typeof _makeWaSocketNamed === 'function') {
            makeSocket = _makeWaSocketNamed;
        } else if (makeSocket && typeof makeSocket.default === 'function') {
            makeSocket = makeSocket.default;
        } else if (makeSocket && typeof makeSocket.makeWASocket === 'function') {
            makeSocket = makeSocket.makeWASocket;
        }
    }

    if (typeof makeSocket !== 'function') {
        throw new TypeError('makeWASocket is not a function. Imported default: ' + typeof _makeWaSocket + ', named: ' + typeof _makeWaSocketNamed);
    }

    let conn = makeSocket(connectionOptions)

    // Wrap conn.sendMessage to add debug logging for private chat troubleshooting
    const originalSendMessage = conn.sendMessage;
    conn.sendMessage = async function(jid, content, options = {}) {
        try {
            console.log(chalk.blue(`[SEND_MESSAGE] Mengirim ke JID: ${jid}`));
            const res = await originalSendMessage.call(conn, jid, content, options);
            console.log(chalk.green(`[SEND_MESSAGE SUCCESS] Terkirim ke ${jid}`));
            return res;
        } catch (error) {
            console.error(chalk.red(`[SEND_MESSAGE ERROR] Gagal mengirim ke ${jid}:`), error);
            throw error;
        }
    };

    let sock = Object.defineProperties(conn, {
        chats: {
            value: { ...(options.chats || {}) },
            writable: true
        },
        decodeJid: {
            value(jid) {
                if (!jid || typeof jid !== 'string') return (!nullish(jid) && jid) || null
                return jid.decodeJid()
            }
        },
        logger: {
            get() {
                return {
                    info(...args) {
                        console.log(
                            chalk.bold.bgRgb(51, 204, 51)('INFO '),
                            `[${chalk.rgb(255, 255, 255)(new Date().toUTCString())}]:`,
                            chalk.cyan(format(...args))
                        )
                    },
                    error(...args) {
                        console.log(
                            chalk.bold.bgRgb(247, 38, 33)('ERROR '),
                            `[${chalk.rgb(255, 255, 255)(new Date().toUTCString())}]:`,
                            chalk.rgb(255, 38, 0)(format(...args))
                        )
                    },
                    warn(...args) {
                        console.log(
                            chalk.bold.bgRgb(255, 153, 0)('WARNING '),
                            `[${chalk.rgb(255, 255, 255)(new Date().toUTCString())}]:`,
                            chalk.redBright(format(...args))
                        )
                    },
                    trace(...args) {
                        console.log(
                            chalk.grey('TRACE '),
                            `[${chalk.rgb(255, 255, 255)(new Date().toUTCString())}]:`,
                            chalk.white(format(...args))
                        )
                    },
                    debug(...args) {
                        console.log(
                            chalk.bold.bgRgb(66, 167, 245)('DEBUG '),
                            `[${chalk.rgb(255, 255, 255)(new Date().toUTCString())}]:`,
                            chalk.white(format(...args))
                        )
                    }
                }
            },
            enumerable: true
        },
        getFile: {
            /**
             * getBuffer hehe
             * @param {fs.PathLike} PATH 
             * @param {Boolean} saveToFile
             */
            async value(PATH, saveToFile = false) {
                let res, filename, data
                
                if (Buffer.isBuffer(PATH)) {
                    data = PATH
                } else if (PATH instanceof ArrayBuffer) {
                    data = PATH.toBuffer()
                } else if (/^data:.*?\/.*?;base64,/i.test(PATH)) {
                    data = Buffer.from(PATH.split`,`[1], 'base64')
                } else if (/^https?:\/\//.test(PATH)) {
                    try {
                        res = await fetch(PATH)
                        data = Buffer.from(await res.arrayBuffer())
                    } catch (fetchError) {
                        const isImageUrl = /\.(jpg|jpeg|png|webp|gif|bmp)(\?.*)?$/i.test(PATH) || PATH.includes('image') || PATH.includes('uploads')
                        if (isImageUrl) {
                            try {
                                const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(PATH)}`
                                res = await fetch(proxyUrl)
                                data = Buffer.from(await res.arrayBuffer())
                            } catch (proxyError) {
                                throw fetchError
                            }
                        } else {
                            throw fetchError
                        }
                    }
                } else if (fs.existsSync(PATH)) {
                    filename = PATH
                    data = fs.readFileSync(PATH)
                } else if (typeof PATH === 'string') {
                    data = PATH
                } else {
                    data = Buffer.alloc(0)
                }

                if (!Buffer.isBuffer(data)) throw new TypeError('Result is not a buffer')
                const type = await fileTypeFromBuffer(data) || {
                    mime: 'application/octet-stream',
                    ext: '.bin'
                }
                if (data && saveToFile && !filename) (filename = path.join(process.cwd(), 'tmp', new Date * 1 + '.' + type.ext), await fs.promises.writeFile(filename, data))
                return {
                    res,
                    filename,
                    ...type,
                    data,
                    deleteFile() {
                        return filename && fs.promises.unlink(filename)
                    }
                }
            },
            enumerable: true
        },
            /**
     * genOrderMessage
     * @param {String} message 
     * @param {*} options 
     * @returns 
     */
    async genOrderMessage(message, options) {
        let m = {}
        switch (type) {
          case MessageType.text:
          case MessageType.extendedText:
            if (typeof message === 'string') message = { text: message }
            m.extendedTextMessage = WAMessageProto.ExtendedTextMessage.fromObject(message);
            break
          case MessageType.location:
          case MessageType.liveLocation:
            m.locationMessage = WAMessageProto.LocationMessage.fromObject(message)
            break
          case MessageType.contact:
            m.contactMessage = WAMessageProto.ContactMessage.fromObject(message)
            break
          case MessageType.contactsArray:
            m.contactsArrayMessage = WAMessageProto.ContactsArrayMessage.fromObject(message)
            break
          case MessageType.groupInviteMessage:
            m.groupInviteMessage = WAMessageProto.GroupInviteMessage.fromObject(message)
            break
          case MessageType.listMessage:
            m.listMessage = WAMessageProto.ListMessage.fromObject(message)
            break
          case MessageType.buttonsMessage:
            m.buttonsMessage = WAMessageProto.ButtonsMessage.fromObject(message)
            break
          case MessageType.image:
          case MessageType.sticker:
          case MessageType.document:
          case MessageType.video:
          case MessageType.audio:
            m = await conn.prepareMessageMedia(message, type, options)
            break
          case 'orderMessage':
            m.orderMessage = WAMessageProto.OrderMessage.fromObject(message)
        }
        return WAMessageProto.Message.fromObject(m);
      },
        waitEvent: {
            /**
             * waitEvent
             * @param {String} eventName 
             * @param {Boolean} is 
             * @param {Number} maxTries 
             */
            value(eventName, is = () => true, maxTries = 25) { //Idk why this exist?
                return new Promise((resolve, reject) => {
                    let tries = 0
                    let on = (...args) => {
                        if (++tries > maxTries) reject('Max tries reached')
                        else if (is()) {
                            conn.ev.off(eventName, on)
                            resolve(...args)
                        }
                    }
                    conn.ev.on(eventName, on)
                })
            }
        },
        sendFile: {
            /**
             * Send Media/File with Automatic Type Specifier
             * @param {String} jid
             * @param {String|Buffer} path
             * @param {String} filename
             * @param {String} caption
             * @param {import('@zansxart/baileys').proto.WebMessageInfo} quoted
             * @param {Boolean} ptt
             * @param {Object} options
             */
            async value(jid, path, filename = '', caption = '', quoted, ptt = false, options = {}) {
                let type = await conn.getFile(path, true)
                let { res, data: file, filename: pathFile } = type
                if (res && res.status !== 200 || file.length <= 65536) {
                    try { throw { json: JSON.parse(file.toString()) } }
                    catch (e) { if (e.json) throw e.json }
                }
                const fileSize = fs.statSync(pathFile).size / 1024 / 1024
                if (fileSize >= 400) throw new Error('File size is too big!')
                let opt = {}
                if (quoted) opt.quoted = quoted
                if (!type) options.asDocument = true
                let mtype = '', mimetype = options.mimetype || type.mime, convert
                if (/webp/.test(type.mime) || (/image/.test(type.mime) && options.asSticker)) mtype = 'sticker'
                else if (/image/.test(type.mime) || (/webp/.test(type.mime) && options.asImage)) mtype = 'image'
                else if (/video/.test(type.mime)) mtype = 'video'
                else if (/audio/.test(type.mime)) (
                    convert = await toAudio(file, type.ext),
                    file = convert.data,
                    pathFile = convert.filename,
                    mtype = 'audio',
                    mimetype = options.mimetype || 'audio/ogg; codecs=opus'
                )
                else mtype = 'document'
                if (options.asDocument) mtype = 'document'

                delete options.asSticker
                delete options.asLocation
                delete options.asVideo
                delete options.asDocument
                delete options.asImage

                let message = {
                    ...options,
                    caption,
                    ptt,
                    [mtype]: { url: pathFile },
                    mimetype,
                    fileName: filename || pathFile.split('/').pop()
                }
                /**
                 * @type {import('@zansxart/baileys').proto.WebMessageInfo}
                 */
                let m
                try {
                    m = await conn.sendMessage(jid, message, { ...opt, ...options })
                } catch (e) {
                    console.error(e)
                    m = null
                } finally {
                    if (!m) m = await conn.sendMessage(jid, { ...message, [mtype]: file }, { ...opt, ...options })
                    file = null // releasing the memory
                    return m
                }
            },
            enumerable: true
        },
        
      appenTextMessage: {
      
    async value(m, text, chatUpdate) {
        let messages = await generateWAMessage(
          m.chat,
          { text: text, mentions: m.mentionedJid },
          {
            userJid: conn.user.id,
            quoted: m.quoted && m.quoted.fakeObj,
          }
        );
        messages.key.fromMe = areJidsSameUser(m.sender, conn.user.id);
        messages.key.id = m.key.id;
        messages.pushName = m.pushName;
        if (m.isGroup) messages.participant = m.sender;
        let msg = {
          ...chatUpdate,
          messages: [proto.WebMessageInfo.fromObject(messages)],
          type: "append",
        };
        conn.ev.emit("messages.upsert", msg);
      },
    },
    
        sendContact: {
        
            /**
             * Send Contact
             * @param {String} jid 
             * @param {String[][]|String[]} data
             * @param {import('@zansxart/baileys').proto.WebMessageInfo} quoted 
             * @param {Object} options 
             */
            async value(jid, data, quoted, options) {
                if (!Array.isArray(data[0]) && typeof data[0] === 'string') data = [data]
                let contacts = []
                for (let [number, name] of data) {
                    number = number.replace(/[^0-9]/g, '')
                    let njid = number + '@s.whatsapp.net'
                    let biz = await conn.getBusinessProfile(njid).catch(_ => null) || {}
                    let vcard = `
BEGIN:VCARD
VERSION:3.0
N:;${name.replace(/\n/g, '\\n')};;;
FN:${name.replace(/\n/g, '\\n')}
TEL;type=CELL;type=VOICE;waid=${number}:${PhoneNumber('+' + number).getNumber('international')}${biz.description ? `
X-WA-BIZ-NAME:${(conn.chats[njid]?.vname || conn.getName(njid) || name).replace(/\n/, '\\n')}
X-WA-BIZ-DESCRIPTION:${biz.description.replace(/\n/g, '\\n')}
`.trim() : ''}
END:VCARD
        `.trim()
                    contacts.push({ vcard, displayName: name })

                }
                return await conn.sendMessage(jid, {
                    ...options,
                    contacts: {
                        ...options,
                        displayName: (contacts.length >= 2 ? `${contacts.length} kontak` : contacts[0].displayName) || null,
                        contacts,
                    }
                }, { quoted, ...options })
            },
            enumerable: true
        },
	resize: {
        	value(buffer, ukur1, ukur2) {
        	return new Promise(async(resolve, reject) => {
        var baper = await Jimp.read(buffer)
        var ab = await baper.resize(ukur1, ukur2).getBufferAsync(Jimp.MIME_JPEG)
        resolve(ab)
       })
      }
    },
      
sendAlbumMessage: {

     async value(jid, array, quoted)  {
    const album = generateWAMessageFromContent(jid, {
        messageContextInfo: {
            messageSecret: crypto.randomBytes(32)
        },
        albumMessage: {
            expectedImageCount: array.filter(a => a.hasOwnProperty("image")).length,
            expectedVideoCount: array.filter(a => a.hasOwnProperty("video")).length
        }
    }, {
        userJid: conn.user.jid,
        quoted,
        upload: conn.waUploadToServer
    });

    await conn.relayMessage(album.key.remoteJid, album.message, {
        messageId: album.key.id
    });

    for (let content of array) {
        const img = await generateWAMessage(album.key.remoteJid, content, {
            upload: conn.waUploadToServer
        });
        img.message.messageContextInfo = {
            messageSecret: crypto.randomBytes(32),
            messageAssociation: {
                associationType: 1,
                parentMessageKey: album.key
            }
        };
        await conn.relayMessage(img.key.remoteJid, img.message, {
            messageId: img.key.id
        });
    }

    return album;
    }
},
                reply: {
            /**
             * Reply to a message
             * @param {String} jid
             * @param {String|Buffer} text
             * @param {import('@zansxart/baileys').proto.WebMessageInfo} quoted
             * @param {Object} options
             */
            value(jid, text = '', quoted, options = {}) {
                // --- UPDATE FIX ANTI CRASH ---
                if (!jid || typeof jid !== 'string') {
                    // Jika JID rusak, coba gunakan chat dari quoted atau sender
                    jid = quoted?.chat || quoted?.sender || null
                }
                if (!jid || typeof jid !== 'string') return Promise.resolve() // Batalkan jika tetap rusak
                // -----------------------------

                const context = global.contextInfo || {};

                if (!Buffer.isBuffer(text)) {
                    context.mentionedJid = conn.parseMention(text);
                }

                return Buffer.isBuffer(text)
                    ? conn.sendFile(jid, text, 'file', '', quoted, false, options)
                    : conn.sendMessage(
                        jid,
                        {
                            ...options,
                            text,
                            contextInfo: context
                        },
                        {
                            quoted,
                            ...options
                        }
                    );
            }
        },


        sendButtonSlide: {
        async value(jid, buttons = [], quoted = m, options = {}) {
    async function createImage(url) {
        const { imageMessage } = await generateWAMessageContent(
            { image: { url } },
            { upload: conn.waUploadToServer }
        );
        return imageMessage;
    }

    let push = [];
    
    for (let btn of buttons) {
        let header;
        let hasMedia = false;
        try {
            if (btn.url) {
                header = await createImage(btn.url);
                hasMedia = true;
            }
        } catch (e) {
            console.error('[sendButtonSlide] Failed to generate image header:', e.message);
        }
        let buttonActions = [];

        if (btn.web) {
            buttonActions = buttonActions.concat(
                btn.web.map(item => ({
                    name: "cta_url",
                    buttonParamsJson: JSON.stringify({
                        display_text: `${item.text}!`,
                        url: item.url,
                        merchant_url: item.url
                    })
                }))
            );
        }
        
        if (btn.copy) {
            buttonActions = buttonActions.concat(
                btn.copy.map(copyItem => ({
                    name: "cta_copy",
                    buttonParamsJson: JSON.stringify({
                        display_text: `${copyItem.text}`,
                        id: "123456789",
                        copy_code: `${copyItem.url}`
                    })
                }))
            );
        }
        
        if (btn.list) {
            buttonActions = buttonActions.concat(
                btn.list.map(copyItem => ({
                    name: "single_select",
                    buttonParamsJson: JSON.stringify({
                        title: `${copyItem.title}`,
                        sections: [{
                            title: `${copyItem.button.title}`,
                            highlight_label: `${copyItem.button.label}`,
                            rows: [...copyItem.button.list]
                        }]
                    })
                }))
            );
        }

        push.push({
            body: proto.Message.InteractiveMessage.Body.create({
                text: btn.text
            }),
            footer: proto.Message.InteractiveMessage.Footer.create({
                text: btn.footer
            }),
            header: proto.Message.InteractiveMessage.Header.create({
                title: btn.header,
                hasMediaAttachment: hasMedia,
                imageMessage: hasMedia ? header : null
            }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                buttons: buttonActions
            })
        });
    }

    const msg = generateWAMessageFromContent(jid, {
        viewOnceMessage: {
            message: {
                messageContextInfo: {
                    deviceListMetadata: {},
                    deviceListMetadataVersion: 2
                },
                interactiveMessage: proto.Message.InteractiveMessage.create({
                    body: proto.Message.InteractiveMessage.Body.create({
                        text: options.text
                    }),
                    footer: proto.Message.InteractiveMessage.Footer.create({
                        text: options.footer
                    }),
                    carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.create({
                        cards: push
                    })
                })
            }
        }
    }, { quoted, userJid: quoted.key.remoteJid });

    await conn.relayMessage(jid, msg.message, { messageId: msg.key.id });
    }
        },
        sendUrlButton: {
        async value(jid, text, row = [], footer, quoted = null) {
	let msg = generateWAMessageFromContent(jid, {
  viewOnceMessage: {
    message: {
        "messageContextInfo": {
          "deviceListMetadata": {},
          "deviceListMetadataVersion": 2
        },
        interactiveMessage: proto.Message.InteractiveMessage.create({
          body: proto.Message.InteractiveMessage.Body.create({
            text: text
          }),
          footer: proto.Message.InteractiveMessage.Footer.create({
            text: footer
          }),
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
            buttons: [
              ...row
              ],
          }),
        })
    }
  }
}, {quoted, userJid: quoted})
conn.relayMessage(jid, msg.message, {
  messageId: msg.key.id,
})
}
},
        sendModify: {
       value(jid, text = '', quoted = '', opts = {}) {
    return conn.sendMessage(jid, {
        text: text,
        contextInfo: {
            externalAdReply: {
                showAdAttribution: opts.ads ? opts.ads : true,
                title: opts.title ? opts.title : 'Copyright © 2023 Bot',
                body: opts.body ? opts.body : '',
                mediaType: 1,
                thumbnailUrl: opts.thumbnailUrl ? opts.thumbnailUrl : '',
                sourceUrl: opts.url ? opts.url : '',
                renderLargerThumbnail: opts.largeThumb ? opts.largeThumb : false
            }
        }
    }, {
        quoted: quoted,
        ephemeralExpiration: 86400
    })
}
},
msToDate: {
   async value (ms) {
          let days = Math.floor(ms / (24 * 60 * 60 * 1000));
          let daysms = ms % (24 * 60 * 60 * 1000);
          let hours = Math.floor((daysms) / (60 * 60 * 1000));
          let hoursms = ms % (60 * 60 * 1000);
          let minutes = Math.floor((hoursms) / (60 * 1000));
          let minutesms = ms % (60 * 1000);
          let sec = Math.floor((minutesms) / (1000));
          return days + " Hari " + hours + " Jam " + minutes + " Menit";
          // +minutes+":"+sec;
        }
    },
        
        delay: {
           async value (ms) {
                return new Promise((resolve, reject) => setTimeout(resolve, ms)
     ) }
           },
        cMod: {
            /**
             * cMod
             * @param {String} jid 
             * @param {import('@zansxart/baileys').proto.WebMessageInfo} message 
             * @param {String} text 
             * @param {String} sender 
             * @param {*} options 
             * @returns 
             */
            value(jid, message, text = '', sender = conn.user.jid, options = {}) {
                if (options.mentions && !Array.isArray(options.mentions)) options.mentions = [options.mentions]
                let copy = message.toJSON()
                delete copy.message.messageContextInfo
                delete copy.message.senderKeyDistributionMessage
                let mtype = Object.keys(copy.message)[0]
                let msg = copy.message
                let content = msg[mtype]
                if (typeof content === 'string') msg[mtype] = text || content
                else if (content.caption) content.caption = text || content.caption
                else if (content.text) content.text = text || content.text
                if (typeof content !== 'string') {
                    msg[mtype] = { ...content, ...options }
                    msg[mtype].contextInfo = {
                        ...(content.contextInfo || {}),
                        mentionedJid: options.mentions || content.contextInfo?.mentionedJid || []
                    }
                }
                if (copy.participant) sender = copy.participant = sender || copy.participant
                else if (copy.key.participant) sender = copy.key.participant = sender || copy.key.participant
                if (copy.key.remoteJid && !isGroupJid(copy.key.remoteJid) && !copy.key.remoteJid.includes('@broadcast')) sender = sender || copy.key.remoteJid
                else if (copy.key.remoteJid.includes('@broadcast')) sender = sender || copy.key.remoteJid
                copy.key.remoteJid = jid
                copy.key.fromMe = areJidsSameUser(sender, conn.user.id) || false
                return proto.WebMessageInfo.fromObject(copy)
            },
            enumerable: true
        },
        copyNForward: {
            /**
             * Exact Copy Forward
             * @param {String} jid
             * @param {import('@zansxart/baileys').proto.WebMessageInfo} message
             * @param {Boolean|Number} forwardingScore
             * @param {Object} options
             */
            async value(jid, message, forwardingScore = true, options = {}) {
                let vtype
                if (options.readViewOnce && message.message.viewOnceMessage?.message) {
                    vtype = Object.keys(message.message.viewOnceMessage.message)[0]
                    delete message.message.viewOnceMessage.message[vtype].viewOnce
                    message.message = proto.Message.fromObject(
                        JSON.parse(JSON.stringify(message.message.viewOnceMessage.message))
                    )
                    message.message[vtype].contextInfo = message.message.viewOnceMessage.contextInfo
                }
                let mtype = Object.keys(message.message)[0]
                let m = generateForwardMessageContent(message, !!forwardingScore)
                let ctype = Object.keys(m)[0]
                if (forwardingScore && typeof forwardingScore === 'number' && forwardingScore > 1) m[ctype].contextInfo.forwardingScore += forwardingScore
                m[ctype].contextInfo = {
                    ...(message.message[mtype].contextInfo || {}),
                    ...(m[ctype].contextInfo || {})
                }
                m = generateWAMessageFromContent(jid, m, {
                    ...options,
                    userJid: conn.user.jid
                })
                await conn.relayMessage(jid, m.message, { messageId: m.key.id, additionalAttributes: { ...options } })
                return m
            },
            enumerable: true
        },
        saveMedia: {
            async value(message, filename, attachExtension = true) {
                try {
                    let quoted = message.msg ? message.msg : message
                    let mime = (message.msg || message).mimetype || ''
                    let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0]
                    const stream = await downloadContentFromMessage(quoted, messageType)
                    let buffer = Buffer.from([])
                    for await(const chunk of stream) {
                        buffer = Buffer.concat([buffer, chunk])
                    }
                    let type = await fileTypeFromBuffer(buffer)
                    let trueFileName = attachExtension ? (filename + '.' + type.ext) : filename
                    // save to file
                    await fs.writeFileSync(trueFileName, buffer)
                    return trueFileName
                } catch (error) {
                    throw wrapWhatsAppMediaError(error)
                }
            }
        },
        
        downloadM: {
            /**
             * Download media message
             * @param {Object} m
             * @param {String} type
             * @param {fs.PathLike | fs.promises.FileHandle} saveToFile
             * @returns {Promise<fs.PathLike | fs.promises.FileHandle | Buffer>}
             */
            async value(m, type, saveToFile) {
                let filename
                if (!m || !(m.url || m.directPath)) return Buffer.alloc(0)
                try {
                    const stream = await downloadContentFromMessage(m, type)
                    let buffer = Buffer.from([])
                    for await (const chunk of stream) {
                        buffer = Buffer.concat([buffer, chunk])
                    }
                    if (saveToFile) ({ filename } = await conn.getFile(buffer, true))
                    return saveToFile && fs.existsSync(filename) ? filename : buffer
                } catch (error) {
                    throw wrapWhatsAppMediaError(error)
                }
            },
            enumerable: true
        },
        parseMention: {
            /**
             * Parses string into mentionedJid(s)
             * @param {String} text
             * @returns {Array<String>}
             */
            value(text = '') {
                if (typeof text !== 'string') {
                    text = text && typeof text.toString === 'function' ? text.toString() : '';
                }
                return [...text.matchAll(/@([0-9]{5,16}|0)/g)].map(v => v[1] + '@s.whatsapp.net')
            },
            enumerable: true
        },
        saveName: {
            async value (id, name = '') {
            if (!id) return
            id = conn.decodeJid(id)
            let isGroup = id.endsWith('@g.us')
            if (id in conn.contacts && conn.contacts[id][isGroup ? 'subject' : 'name'] && id in conn.chats) return
            let metadata = {}
            if (isGroup) metadata = await conn.groupMetadata(id)
            let chat = { ...(conn.contacts[id] || {}), id, ...(isGroup ? { subject: metadata.subject, desc: metadata.desc } : { name }) }
            conn.contacts[id] = chat
            conn.chats[id] = chat
        }
    },
        getName: {
            /**
             * Get name from jid
             * @param {String} jid
             * @param {Boolean} withoutContact
             */
            value(jid = '', withoutContact = false) {
                jid = conn.decodeJid(jid)
                
                withoutContact = conn.withoutContact || withoutContact
                let v
                if (jid.endsWith('@g.us')) return new Promise(async (resolve) => {
                    v = conn.chats[jid] || {}
                    if (!(v.name || v.subject)) v = await conn.groupMetadata(jid) || {}
                    resolve(v.name || v.subject || PhoneNumber('+' + jid.split('@')[0]).getNumber('international'))
                })
                else v = jid === '0@s.whatsapp.net' ? {
                    jid,
                    vname: 'WhatsApp'
                } : areJidsSameUser(jid, conn.user.id) ?
                    conn.user :
                    (conn.chats[jid] || {})
                return (withoutContact ? '' : v.name) || v.subject || v.vname || v.notify || v.verifiedName || PhoneNumber('+' + jid.split('@')[0]).getNumber('international')
            },
            enumerable: true
        },
        loadMessage: {
            /**
             * [PERF] Optimized O(1) message lookup via _messageIndex Map
             * @param {String} messageID 
             * @returns {import('@zansxart/baileys').proto.WebMessageInfo}
             */
            value(messageID) {
                if (conn._messageIndex?.has(messageID)) {
                    return conn._messageIndex.get(messageID)
                }
                const msg = Object.entries(conn.chats)
                    .filter(([_, { messages }]) => typeof messages === 'object')
                    .find(([_, { messages }]) => Object.entries(messages)
                        .find(([k, v]) => (k === messageID || v.key?.id === messageID)))
                    ?.[1].messages?.[messageID]
                if (msg) {
                    if (!conn._messageIndex) conn._messageIndex = new Map()
                    conn._messageIndex.set(messageID, msg)
                }
                return msg
            },
            enumerable: true
        },

        sendGroupV4Invite: {
    /**
     * sendGroupV4Invite
     * @param {String} groupJid - ID grup
     * @param {String} participant - JID pengguna
     * @param {Object} options - Opsi tambahan, termasuk caption khusus
     */
    async value(groupJid, participant, options = {}) {
        try {
            const metadata = await conn.groupMetadata(groupJid);
            const groupName = metadata.subject;

            // Coba tambahkan dulu
            const response = await conn.query({
                tag: 'iq',
                attrs: { type: 'set', xmlns: 'w:g2', to: groupJid },
                content: [{ tag: 'add', attrs: {}, content: [{ tag: 'participant', attrs: { jid: participant } }] }]
            });

            const participantsNode = getBinaryNodeChildren(response, 'add');
            const user = participantsNode[0]?.content.find(item => item.attrs.jid === participant);

            if (user?.attrs.error !== '403') {
                return { added: true, message: null };
            }

            const content = getBinaryNodeChild(user, 'add_request');
            const { code: inviteCode, expiration: inviteExpiration } = content.attrs;

            let jpegThumbnail = Buffer.alloc(0);
            try {
                const ppUrl = await conn.profilePictureUrl(groupJid, 'image');
                jpegThumbnail = await fetch(ppUrl).then(async (res) => Buffer.from(await res.arrayBuffer()));
            } catch (e) {
                console.log('Thumbnail tidak tersedia');
            }

            const msg = proto.Message.fromObject({
                groupInviteMessage: proto.Message.fromObject({
                    groupJid,
                    inviteCode,
                    inviteExpiration: parseInt(inviteExpiration),
                    groupName,
                    jpegThumbnail: Buffer.isBuffer(jpegThumbnail) ? jpegThumbnail : Buffer.from(jpegThumbnail, 'base64'),
                    caption: options.caption || '✨ Anda diundang untuk bergabung ke grup WhatsApp'
                })
            });

            const message = generateWAMessageFromContent(participant, msg, {
                ...options,
                userJid: conn.user.id
            });

            await conn.relayMessage(participant, message.message, {
                messageId: message.key.id,
                additionalAttributes: { ...options }
            });

            return { added: false, message };
        } catch (err) {
            console.error('sendGroupV4Invite error:', err);
            return { error: err };
        }
    },
    enumerable: true
},


        processMessageStubType: {
            /**
             * to process MessageStubType
             * @param {import('@zansxart/baileys').proto.WebMessageInfo} m 
             */
            async value(m) {
                if (!m.messageStubType) return
                const chat = conn.decodeJid(m.key.remoteJid || m.message?.senderKeyDistributionMessage?.groupId || '')
                if (!chat || chat === 'status@broadcast') return
                const stubParameters = Array.isArray(m.messageStubParameters) ? m.messageStubParameters : []
                const emitGroupUpdate = (update) => {
                    conn.ev.emit('groups.update', [{ id: chat, ...update }])
                }
                switch (m.messageStubType) {
                    case WAMessageStubType.REVOKE:
                    case WAMessageStubType.GROUP_CHANGE_INVITE_LINK:
                        if (!stubParameters.length || !stubParameters[0]) return false
                        emitGroupUpdate({ revoke: stubParameters[0] })
                        break
                    case WAMessageStubType.GROUP_CHANGE_ICON:
                        if (!stubParameters.length || !stubParameters[0]) return false
                        emitGroupUpdate({ icon: stubParameters[0] })
                        break
                    default: {
                        console.log({
                            messageStubType: m.messageStubType,
                            messageStubParameters: stubParameters,
                            type: WAMessageStubType[m.messageStubType]
                        })
                        break
                    }
                }
                const isGroup = chat.endsWith('@g.us')
                if (!isGroup) return
                let chats = conn.chats[chat]
                if (!chats) chats = conn.chats[chat] = { id: chat }
                chats.isChats = true
                const metadata = await conn.groupMetadata(chat).catch(_ => null)
                if (!metadata) return
                chats.subject = metadata.subject
                chats.metadata = metadata
            }
        },
        relayWAMessage: {
            async value (pesanfull) {
                    if (pesanfull.message.audioMessage) {
                        await conn.sendPresenceUpdate('recording', pesanfull.key.remoteJid)
                    } else {
                        await conn.sendPresenceUpdate('composing', pesanfull.key.remoteJid)
                    }
                    var mekirim = await conn.relayMessage(pesanfull.key.remoteJid, pesanfull.message, { messageId: pesanfull.key.id })
                    conn.ev.emit('messages.upsert', { messages: [pesanfull], type: 'append' });
                    return mekirim
                }
            },
        insertAllGroup: {
            async value() {
                const groups = await conn.groupFetchAllParticipating().catch(_ => null) || {}
                for (const group in groups) conn.chats[group] = { ...(conn.chats[group] || {}), id: group, subject: groups[group].subject, isChats: true, metadata: groups[group] }
                return conn.chats
            },
        },
    /**
     * Send Contact Array
     * @param {String} jid 
     * @param {String} number 
     * @param {String} name 
     * @param {Object} quoted 
     * @param {Object} options 
     */
    sendContactArray: {
    async value(jid, data, quoted, options) {
        if (!Array.isArray(data[0]) && typeof data[0] === 'string') data = [data]
                let contacts = []
        for (let [number, name, isi, isi1, isi2, isi3, isi4, isi5] of data) {
            number = number.replace(/[^0-9]/g, '')
            let njid = number + '@s.whatsapp.net'
            let biz = await conn.getBusinessProfile(njid).catch(_ => null) || {}
            // N:;${name.replace(/\n/g, '\\n').split(' ').reverse().join(';')};;;
            let vcard = `
BEGIN:VCARD
VERSION:3.0
N:Sy;Bot;;;
FN:${name.replace(/\n/g, '\\n')}
item.ORG:${isi}
item1.TEL;waid=${number}:${PhoneNumber('+' + number).getNumber('international')}
item1.X-ABLabel:${isi1}
item2.EMAIL;type=INTERNET:${isi2}
item2.X-ABLabel:📧 Email
item3.ADR:;;${isi3};;;;
item3.X-ABADR:ac
item3.X-ABLabel:📍 Region
item4.URL:${isi4}
item4.X-ABLabel:Website
item5.X-ABLabel:${isi5}
END:VCARD`.trim()
            contacts.push({ vcard, displayName: name })
        }
        return await conn.sendMessage(jid, {
            contacts: {
                displayName: (contacts.length > 1 ? `2013 kontak` : contacts[0].displayName) || null,
                contacts,
            }
        },
        {
            quoted,
            ...options
        })
        }
    },
    serializeM: {
            /**
             * Serialize Message, so it easier to manipulate
             * @param {import('@zansxart/baileys').proto.WebMessageInfo} m
             */
            value(m) {
                return smsg(conn, m)
            }
        },
        pushMessage: {
            /**
             * pushMessage
             * [PERF] Network calls (insertAllGroup, groupMetadata) are now fire-and-forget
             * supaya tidak blocking handler saat banyak pesan masuk bersamaan
             * @param {import('@zansxart/baileys').proto.WebMessageInfo[]} m 
             */
            async value(m) {
                if (!m) return
                if (!Array.isArray(m)) m = [m]
                for (const message of m) {
                    try {
                        if (!message) continue
                        if (message.messageStubType && message.messageStubType != WAMessageStubType.CIPHERTEXT) {
                            conn.processMessageStubType(message).catch((error) => {
                                console.error('[MESSAGE STUB ERROR]', error)
                            })
                        }
                        const _mtype = Object.keys(message.message || {})
                        const mtype = (!['senderKeyDistributionMessage', 'messageContextInfo'].includes(_mtype[0]) && _mtype[0]) ||
                            (_mtype.length >= 3 && _mtype[1] !== 'messageContextInfo' && _mtype[1]) ||
                            _mtype[_mtype.length - 1]
                        const chat = conn.decodeJid(message.key.remoteJid || message.message?.senderKeyDistributionMessage?.groupId || '')
                        if (message.message?.[mtype]?.contextInfo?.quotedMessage) {
                            /**
                             * @type {import('@zansxart/baileys').proto.IContextInfo}
                             */
                            let context = message.message[mtype].contextInfo
                            let participant = conn.decodeJid(context.participant)
                            const remoteJid = conn.decodeJid(context.remoteJid || participant)
                            /**
                             * @type {import('@zansxart/baileys').proto.IMessage}
                             * 
                             */
                            let quoted = message.message[mtype].contextInfo.quotedMessage
                            if ((remoteJid && remoteJid !== 'status@broadcast') && quoted) {
                                let qMtype = Object.keys(quoted)[0]
                                if (qMtype == 'conversation') {
                                    quoted.extendedTextMessage = { text: quoted[qMtype] }
                                    delete quoted.conversation
                                    qMtype = 'extendedTextMessage'
                                }
                                if (!quoted[qMtype].contextInfo) quoted[qMtype].contextInfo = {}
                                quoted[qMtype].contextInfo.mentionedJid = context.mentionedJid || quoted[qMtype].contextInfo.mentionedJid || []
                                const isGroup = remoteJid.endsWith('g.us')
                                if (isGroup && !participant) participant = remoteJid
                                const qM = {
                                    key: {
                                        remoteJid,
                                        fromMe: areJidsSameUser(conn.user.jid, remoteJid),
                                        id: context.stanzaId,
                                        participant,
                                    },
                                    message: JSON.parse(JSON.stringify(quoted)),
                                    ...(isGroup ? { participant } : {})
                                }
                                let qChats = conn.chats[participant]
                                if (!qChats) qChats = conn.chats[participant] = { id: participant, isChats: !isGroup }
                                if (!qChats.messages) qChats.messages = {}
                                if (!qChats.messages[context.stanzaId] && !qM.key.fromMe) {
                                    qChats.messages[context.stanzaId] = qM
                                    if (!conn._messageIndex) conn._messageIndex = new Map()
                                    conn._messageIndex.set(context.stanzaId, qM)
                                }
                                let qChatsMessages
                                if ((qChatsMessages = Object.entries(qChats.messages)).length > 40) {
                                    const evicted = qChatsMessages.slice(0, 10)
                                    for (const [k] of evicted) {
                                        conn._messageIndex?.delete(k)
                                    }
                                    qChats.messages = Object.fromEntries(qChatsMessages.slice(30, qChatsMessages.length)) // maybe avoid memory leak
                                }
                            }
                        }
                        if (!chat || chat === 'status@broadcast') continue
                        const isGroup = chat.endsWith('@g.us')
                        let chats = conn.chats[chat]
                        if (!chats) {
                            // [PERF] insertAllGroup fire-and-forget — jangan block pushMessage
                            if (isGroup) conn.insertAllGroup().catch(() => {})
                            chats = conn.chats[chat] = { id: chat, isChats: true, ...(conn.chats[chat] || {}) }
                        }
                        let metadata, sender
                        if (isGroup) {
                            if (!chats.subject || !chats.metadata) {
                                // [PERF] groupMetadata fire-and-forget — fetch di background, jangan block
                                conn.groupMetadata(chat).then(meta => {
                                    if (meta) {
                                        if (!chats.subject) chats.subject = meta.subject || ''
                                        if (!chats.metadata) chats.metadata = meta
                                    }
                                }).catch(() => {})
                            }
                            sender = conn.decodeJid(message.key?.fromMe && conn.user.id || message.participant || message.key?.participant || chat || '')
                            if (sender !== chat) {
                                let chats = conn.chats[sender]
                                if (!chats) chats = conn.chats[sender] = { id: sender }
                                if (!chats.name) chats.name = message.pushName || chats.name || ''
                            }
                        } else if (!chats.name) chats.name = message.pushName || chats.name || ''
                        if (['senderKeyDistributionMessage', 'messageContextInfo'].includes(mtype)) continue
                        chats.isChats = true
                        if (!chats.messages) chats.messages = {}
                        const fromMe = message.key.fromMe || areJidsSameUser(sender || chat, conn.user.id)
                        if (!['protocolMessage'].includes(mtype) && !fromMe && message.messageStubType != WAMessageStubType.CIPHERTEXT && message.message) {
                            delete message.message.messageContextInfo
                            delete message.message.senderKeyDistributionMessage
                            // [PERF] JSON.stringify tanpa pretty-print (null, 2) — lebih cepat
                            chats.messages[message.key.id] = JSON.parse(JSON.stringify(message))
                            
                            // [PERF] Add to fast index map
                            if (!conn._messageIndex) conn._messageIndex = new Map()
                            conn._messageIndex.set(message.key.id, chats.messages[message.key.id])
                            
                            let chatsMessages
                            if ((chatsMessages = Object.entries(chats.messages)).length > 40) {
                                const evicted = chatsMessages.slice(0, 10)
                                for (const [k] of evicted) {
                                    conn._messageIndex?.delete(k)
                                }
                                chats.messages = Object.fromEntries(chatsMessages.slice(30, chatsMessages.length))
                            }
                        }
                    } catch (e) {
                        console.error(e)
                    }
                }
            }
        },
        /**
    *status 
    */
    sendPoll: {
			async value(jid, name = '', values = [], selectableCount = '') {
				return await conn.sendMessage(jid, { poll: { name, values, selectableCount }})
			},
			enumerable: true
		},
		//SEND TEXT
    sendText: { 
		 async value(jid, text, quoted = '', options) {
		  conn.sendMessage(jid, { text: text, ...options }, { quoted })
		  }
		 },
    // SET BIO
setBio: {
async value (status) {
        return await conn.query({
            tag: 'iq',
            attrs: {
                to: 's.whatsapp.net',
                type: 'set',
                xmlns: 'status',
            },
            content: [
                {
                    tag: 'status',
                    attrs: {},
                    content: Buffer.from(status, 'utf-8')
                }
            ]
        })
        // <iq to="s.whatsapp.net" type="set" xmlns="status" id="21168.6213-69"><status>"Hai, saya menggunakan WhatsApp"</status></iq>
    }
},
        sendStickerFromUrl: {

async value (from, PATH, quoted, options = {}) {

let types = await conn.getFile(PATH, true)

let { filename, size, ext, mime, data } = types

let type = '', mimetype = mime, pathFile = filename

let media = { mimetype: mime, data }

let pathFile1 = await writeExif(media, { packname: options.packname ? options.packname : 'Nightmare - MD', author: options.author ? options.author : '', categories: options.categories ? options.categories : [] })

await fs.promises.unlink(filename)

await conn.sendMessage(from, {sticker: {url: pathFile1}}, {quoted: quoted})

return fs.promises.unlink(pathFile1)

}

},
                
        ...(typeof conn.chatRead !== 'function' ? {
            chatRead: {
                /**
                 * Read message
                 * @param {String} jid 
                 * @param {String|undefined|null} participant 
                 * @param {String} messageID 
                 */
                value(jid, participant = conn.user.jid, messageID) {
                    return conn.sendReadReceipt(jid, participant, [messageID])
                },
                enumerable: true
            }
        } : {}),
        ...(typeof conn.setStatus !== 'function' ? {
            setStatus: {
                /**
                 * setStatus bot
                 * @param {String} status 
                 */
                value(status) {
                    return conn.query({
                        tag: 'iq',
                        attrs: {
                            to: S_WHATSAPP_NET,
                            type: 'set',
                            xmlns: 'status',
                        },
                        content: [
                            {
                                tag: 'status',
                                attrs: {},
                                content: Buffer.from(status, 'utf-8')
                            }
                        ]
                    })
                },
                enumerable: true
            }
        } : {})
    })
    if (sock.user?.id) sock.user.jid = sock.decodeJid(sock.user.id)
    bind(sock)
    return sock
};


/**
 * Serialize a WebMessageInfo into a plain object with non-getter properties
 * @param {import('@zansxart/baileys').Socket} conn
 * @param {any} m
 * @param {boolean} hasParent
 */
export function smsg(conn, m, hasParent) {
    if (!m) return m

    // Ensure m is a WebMessageInfo instance
    let M = proto.WebMessageInfo
    m = M.fromObject(m)
    m.conn = conn

    // Handle protocol message deletion events
    let protocolMessageKey
    if (m.message) {
        if (m.mtype === 'protocolMessage' && m.msg.key) {
            protocolMessageKey = m.msg.key
            if (protocolMessageKey.remoteJid === 'status@broadcast') {
                protocolMessageKey.remoteJid = m.chat
            }
            if (!protocolMessageKey.participant || protocolMessageKey.participant === 'status_me') {
                protocolMessageKey.participant = m.sender
            }
            protocolMessageKey.fromMe = conn.decodeJid(protocolMessageKey.participant) === conn.decodeJid(conn.user.id)
            if (!protocolMessageKey.fromMe && protocolMessageKey.remoteJid === conn.decodeJid(conn.user.id)) {
                protocolMessageKey.remoteJid = m.sender
            }
        }
        if (m.quoted && !m.quoted.mediaMessage) delete m.quoted.download
        
        let participantJid = m.sender
        
        // --- UPDATE FIX METADATA ---
        if (typeof m.chat === 'string' && m.chat.endsWith('g.us')) {
            try {
                // Ambil dari cache saja untuk menghindari error async di fungsi sync
                const metadata = conn.chats[m.chat]?.metadata || {}
                // Gunakan ?. (optional chaining) agar tidak crash jika participants undefined
                const participant = metadata.participants?.find(v => v.id === m.sender)
                if (participant) participantJid = participant.phoneNumber;
            } catch (e) {
                // Silent error agar tidak spam console
            }
            m.key.participant = participantJid;
        }
        // ---------------------------
    }
    
    if (!m.mediaMessage) delete m.download

    try {
        if (protocolMessageKey && m.mtype === 'protocolMessage') {
            conn.ev.emit('message.delete', protocolMessageKey)
        }
    } catch (e) {
        console.error(e)
    }
    return m
}


export function serialize() {
    const MediaType = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage']
    return Object.defineProperties(proto.WebMessageInfo.prototype, {
        conn: {
            value: undefined,
            enumerable: false,
            writable: true
        },
        id: {
            get() {
                return this.key?.id
            }
        },
        chat: {
            get() {
                const senderKeyDistributionMessage = this.message?.senderKeyDistributionMessage?.groupId
                return (
                    this.key?.remoteJid ||
                    (senderKeyDistributionMessage &&
                        senderKeyDistributionMessage !== 'status@broadcast'
                    ) || ''
                ).decodeJid()
            }
        },
        isGroup: {
            get() {
                return this.chat.endsWith('@g.us')
            },
            enumerable: true
        },
        sender: {
            get() {
                return this.conn?.decodeJid(this.key?.fromMe && this.conn?.user.id || this.participant || this.key.participant || this.chat || '')
            },
            enumerable: true
        },
        rawSender: {
            get() {
                return this.key?.fromMe && this.conn?.user.id || this.participant || this.key?.participant || this.chat || ''
            },
            enumerable: true
        },
        isBaileys: {
        get() {
    const id = this.id
    if (!id) return false
    // Baileys generateMessageIDV2 menghasilkan '3EB0' + 18 hex chars = 22 chars
    // Baileys generateMessageID menghasilkan '3EB0' + 36 hex chars = 40 chars
    // Pesan dari WhatsApp resmi (HP user) TIDAK diawali '3EB0'
    return id.startsWith('3EB0') && (id.length === 22 || id.length === 40)
},
        enumerable: true
        },
        fromMe: {
            get() {
                return this.key?.fromMe || areJidsSameUser(this.conn?.user.id, this.sender) || false
            }
        },
        mtype: {
            get() {
                if (!this.message) return ''
                const type = Object.keys(this.message)
                return (!['senderKeyDistributionMessage', 'messageContextInfo'].includes(type[0]) && type[0]) || // Sometimes message in the front
                    (type.length >= 3 && type[1] !== 'messageContextInfo' && type[1]) || // Sometimes message in midle if mtype length is greater than or equal to 3
                    type[type.length - 1] // common case
            },
            enumerable: true
        },
        msg: {
            get() {
                if (!this.message) return null
                return this.message[this.mtype]
            }
        },
        mediaMessage: {
            get() {
                if (!this.message) return null
                const Message = ((this.msg?.url || this.msg?.directPath) ? { ...this.message } : extractMessageContent(this.message)) || null
                if (!Message) return null
                const mtype = Object.keys(Message)[0]
                return MediaType.includes(mtype) ? Message : null
            },
            enumerable: true
        },
        mediaType: {
            get() {
                let message
                if (!(message = this.mediaMessage)) return null
                return Object.keys(message)[0]
            },
            enumerable: true,
        },
        quoted: {
            get() {
                /**
                 * @type {ReturnType<typeof makeWASocket>}
                 */
                const self = this
                const msg = self.msg
                const contextInfo = msg?.contextInfo
                const quoted = contextInfo?.quotedMessage
                if (!msg || !contextInfo || !quoted) return null
                const type = Object.keys(quoted)[0]
                let q = quoted[type]
                const text = typeof q === 'string' ? q : q.text
                return Object.defineProperties(JSON.parse(JSON.stringify(typeof q === 'string' ? { text: q } : q)), {
                    mtype: {
                        get() {
                            return type
                        },
                        enumerable: true
                    },
                    mediaMessage: {
                        get() {
                            const Message = ((q.url || q.directPath) ? { ...quoted } : extractMessageContent(quoted)) || null
                            if (!Message) return null
                            const mtype = Object.keys(Message)[0]
                            return MediaType.includes(mtype) ? Message : null
                        },
                        enumerable: true
                    },
                    mediaType: {
                        get() {
                            let message
                            if (!(message = this.mediaMessage)) return null
                            return Object.keys(message)[0]
                        },
                        enumerable: true,
                    },
                    isBaileys: {
        get() {
    const id = this.id
    if (!id) return false
    return id.startsWith('3EB0') && (id.length === 22 || id.length === 40)
},
        enumerable: true
        },
                    id: {
                        get() {
                            return contextInfo.stanzaId
                        },
                        enumerable: true
                    },
                    chat: {
                        get() {
                            return contextInfo.remoteJid || self.chat
                        },
                        enumerable: true
                    },
                    sender: {
                        get() {
                            return (contextInfo.participant || this.chat || '').decodeJid()
                        },
                        enumerable: true
                    },
                    rawSender: {
                        get() {
                            return contextInfo.participant || this.chat || ''
                        },
                        enumerable: true
                    },
                    fromMe: {
                        get() {
                            return areJidsSameUser(this.sender, self.conn?.user.jid)
                        },
                        enumerable: true,
                    },
                    text: {
                        get() {
                            return text || this.caption || this.contentText || this.selectedDisplayText || ''
                        },
                        enumerable: true
                    },
                    mentionedJid: {
                        get() {
                            return q.contextInfo?.mentionedJid || self.getQuotedObj()?.mentionedJid || []
                        },
                        enumerable: true
                    },
                    rawMentionedJid: {
                        get() {
                            return q.contextInfo?.mentionedJid || self.getQuotedObj()?.rawMentionedJid || []
                        },
                        enumerable: true
                    },
                    name: {
                        get() {
                            const sender = this.sender
                            return sender ? self.conn?.getName(sender) : null
                        },
                        enumerable: true

                    },
                    vM: {
                        get() {
                            return proto.WebMessageInfo.fromObject({
                                key: {
                                    fromMe: this.fromMe,
                                    remoteJid: this.chat,
                                    id: this.id
                                },
                                message: quoted,
                                ...(self.isGroup ? { participant: this.sender } : {})
                            })
                        }
                    },
                    fakeObj: {
                        get() {
                            return this.vM
                        }
                    },
                    download: {
                        value(saveToFile = false) {
                            const mtype = this.mediaType
                            return self.conn?.downloadM(this.mediaMessage[mtype], mtype.replace(/message/i, ''), saveToFile)
                        },
                        enumerable: true,
                        configurable: true,
                    },
                    reply: {
                        /**
                         * Reply to quoted message
                         * @param {String|Object} text
                         * @param {String|false} chatId
                         * @param {Object} options
                         */
                        value(text, chatId, options) {
                            return self.conn?.reply(chatId ? chatId : this.chat, text, this.vM, options)
                        },
                        enumerable: true,
                    },
                    copy: {
                        /**
                         * Copy quoted message
                         */
                        value() {
                            const M = proto.WebMessageInfo
                            return smsg(conn, M.fromObject(M.toObject(this.vM)))
                        },
                        enumerable: true,
                    },
                    forward: {
                        /**
                         * Forward quoted message
                         * @param {String} jid
                         *  @param {Boolean} forceForward
                         */
                        value(jid, force = false, options) {
                            return self.conn?.sendMessage(jid, {
                                forward: this.vM, force, ...options
                            }, { ...options })
                        },
                        enumerable: true,
                    },
                    copyNForward: {
                        /**
                         * Exact Forward quoted message
                         * @param {String} jid
                         * @param {Boolean|Number} forceForward
                         * @param {Object} options
                         */
                        value(jid, forceForward = false, options) {
                            return self.conn?.copyNForward(jid, this.vM, forceForward, options)
                        },
                        enumerable: true,

                    },
                    cMod: {
                        /**
                         * Modify quoted Message
                         * @param {String} jid
                         * @param {String} text
                         * @param {String} sender
                         * @param {Object} options
                         */
                        value(jid, text = '', sender = this.sender, options = {}) {
                            return self.conn?.cMod(jid, this.vM, text, sender, options)
                        },
                        enumerable: true,

                    },
                    delete: {
                        /**
                         * Delete quoted message
                         */
                        value() {
                            return self.conn?.sendMessage(this.chat, { delete: this.vM.key })
                        },
                        enumerable: true,

                    }
                })
            },
            enumerable: true
        },
        _text: {
            value: null,
            writable: true,
        },
        text: {
            get() {
                const msg = this.msg
                const text = (typeof msg === 'string' ? msg : msg?.text) || msg?.caption || msg?.contentText || ''
                return typeof this._text === 'string' ? this._text : '' || (typeof text === 'string' ? text : (
                    text?.selectedDisplayText ||
                    text?.hydratedTemplate?.hydratedContentText ||
                    text
                )) || ''
            },
            set(str) {
                return this._text = str
            },
            enumerable: true
        },
        mentionedJid: {
            get() {
                return this.msg?.contextInfo?.mentionedJid?.length && this.msg.contextInfo.mentionedJid || []
            },
            enumerable: true
        },
        rawMentionedJid: {
            get() {
                return this.msg?.contextInfo?.mentionedJid?.length && this.msg.contextInfo.mentionedJid || []
            },
            enumerable: true
        },
        name: {
            get() {
                return !nullish(this.pushName) && this.pushName || this.conn?.getName(this.sender)
            },
            enumerable: true
        },
        download: {
            value(saveToFile = false) {
                const mtype = this.mediaType
                return this.conn?.downloadM(this.mediaMessage[mtype], mtype.replace(/message/i, ''), saveToFile)
            },
            enumerable: true,
            configurable: true
        },
    reply: {
        value(text, chatId, options) {
            return this.conn?.reply(chatId ? chatId : this.chat, text, this, options)
        }
        },
        react: {
						value(text) {
							return this.conn?.sendMessage(this.chat, {
								react: {
									text: text,
									key: this.key
								}
							})
						},
						enumerable: true,
					},
        copy: {
            value() {
                const M = proto.WebMessageInfo
                return smsg(this.conn, M.fromObject(M.toObject(this)))
            },
            enumerable: true
        },
        forward: {
            value(jid, force = false, options = {}) {
                return this.conn?.sendMessage(jid, {
                    forward: this, force, ...options
                }, { ...options })
            },
            enumerable: true
        },
        copyNForward: {
            value(jid, forceForward = false, options = {}) {
                return this.conn?.copyNForward(jid, this, forceForward, options)
            },
            enumerable: true
        },
        cMod: {
            value(jid, text = '', sender = this.sender, options = {}) {
                return this.conn?.cMod(jid, this, text, sender, options)
            },
            enumerable: true
        },
        getQuotedObj: {
            value() {
                if (!this.quoted.id) return null
                const q = proto.WebMessageInfo.fromObject(this.conn?.loadMessage(this.quoted.id) || this.quoted.vM)
                return smsg(this.conn, q)
            },
            enumerable: true
        },
        getQuotedMessage: {
            get() {
                return this.getQuotedObj
            }
        },
        delete: {
            value() {
                return this.conn?.sendMessage(this.chat, { delete: this.key })
            },
            enumerable: true
        }
    })
}

export function protoType() {
    Buffer.prototype.toArrayBuffer = function toArrayBufferV2() {
        const ab = new ArrayBuffer(this.length);
        const view = new Uint8Array(ab);
        for (let i = 0; i < this.length; ++i) {
            view[i] = this[i];
        }
        return ab;
    }
    /**
     * @returns {ArrayBuffer}
     */
    Buffer.prototype.toArrayBufferV2 = function toArrayBuffer() {
        return this.buffer.slice(this.byteOffset, this.byteOffset + this.byteLength)
    }
    /**
     * @returns {Buffer}
     */
    ArrayBuffer.prototype.toBuffer = function toBuffer() {
        return Buffer.from(new Uint8Array(this))
    }
    // /**
    //  * @returns {String}
    //  */
    // Buffer.prototype.toUtilFormat = ArrayBuffer.prototype.toUtilFormat = Object.prototype.toUtilFormat = Array.prototype.toUtilFormat = function toUtilFormat() {
    //     return util.format(this)
    // }
    Uint8Array.prototype.getFileType = ArrayBuffer.prototype.getFileType = Buffer.prototype.getFileType = async function getFileType() {
        return await fileTypeFromBuffer(this)
    }
    /**
     * @returns {Boolean}
     */
    String.prototype.isNumber = Number.prototype.isNumber = isNumber
    /**
     * 
     * @returns {String}
     */
    String.prototype.capitalize = function capitalize() {
        return this.charAt(0).toUpperCase() + this.slice(1, this.length)
    }
    /**
     * @returns {String}
     */
    String.prototype.capitalizeV2 = function capitalizeV2() {
        const str = this.split(' ')
        return str.map(v => v.capitalize()).join(' ')
    }
    String.prototype.decodeJid = function decodeJid() {
        if (/:\d+@/gi.test(this)) {
            const decode = jidDecode(this) || {}
            return (decode.user && decode.server && decode.user + '@' + decode.server || this).trim()
        } else return this.trim()
    }
    /**
     * number must be milliseconds
     * @returns {string}
     */
    Number.prototype.toTimeString = function toTimeString() {
        // const milliseconds = this % 1000
        const seconds = Math.floor((this / 1000) % 60)
        const minutes = Math.floor((this / (60 * 1000)) % 60)
        const hours = Math.floor((this / (60 * 60 * 1000)) % 24)
        const days = Math.floor((this / (24 * 60 * 60 * 1000)))
        return (
            (days ? `${days} day(s) ` : '') +
            (hours ? `${hours} hour(s) ` : '') +
            (minutes ? `${minutes} minute(s) ` : '') +
            (seconds ? `${seconds} second(s)` : '')
        ).trim()
    }
    Number.prototype.getRandom = String.prototype.getRandom = Array.prototype.getRandom = getRandom
}
export async function loadMessage(jid, id = null) {
    if (!global.conn) return null
    const msgId = id || jid
    return global.conn.loadMessage(msgId)
}
async function bind(conn) {
    if (!conn.chats) conn.chats = {}
    /**
     * 
     * @param {import('@zansxart/baileys').Contact[]|{contacts:import('@zansxart/baileys').Contact[]}} contacts 
     * @returns 
     */
    function updateNameToDb(contacts) {
        if (!contacts) return
        try {
            contacts = contacts.contacts || contacts
            for (const contact of contacts) {
                const id = conn.decodeJid(contact.id)
                if (!id || id === 'status@broadcast') continue
                let chats = conn.chats[id]
                if (!chats) chats = conn.chats[id] = { ...contact, id }
                conn.chats[id] = {
                    ...chats,
                    ...({
                        ...contact, id, ...(id.endsWith('@g.us') ?
                            { subject: contact.subject || contact.name || chats.subject || '' } :
                            { name: contact.notify || contact.name || chats.name || chats.notify || '' })
                    } || {})
                }
            }
        } catch (e) {
            console.error(e)
        }
    }
    conn.ev.on('contacts.upsert', updateNameToDb)
    conn.ev.on('groups.update', updateNameToDb)
    conn.ev.on('contacts.set', updateNameToDb)
    conn.ev.on('chats.set', async ({ chats }) => {
        try {
            for (let { id, name, readOnly } of chats) {
                id = conn.decodeJid(id)
                if (!id || id === 'status@broadcast') continue
                const isGroup = id.endsWith('@g.us')
                let chats = conn.chats[id]
                if (!chats) chats = conn.chats[id] = { id }
                chats.isChats = !readOnly
                if (name) chats[isGroup ? 'subject' : 'name'] = name
                if (isGroup) {
                    const metadata = await conn.groupMetadata(id).catch(_ => null)
                    if (name || metadata?.subject) chats.subject = name || metadata.subject
                    if (!metadata) continue
                    chats.metadata = metadata
                }
            }
        } catch (e) {
            console.error(e)
        }
    })
    conn.ev.on('group-participants.update', async function updateParticipantsToDb({ id, participants, action }) {
        if (!id) return
        id = conn.decodeJid(id)
        if (id === 'status@broadcast') return
        if (!(id in conn.chats)) conn.chats[id] = { id }
        let chats = conn.chats[id]
        chats.isChats = true
        const groupMetadata = await conn.groupMetadata(id).catch(_ => null)
        if (!groupMetadata) return
        chats.subject = groupMetadata.subject
        chats.metadata = groupMetadata
    })

    conn.ev.on('groups.update', async function groupUpdatePushToDb(groupsUpdates) {
        try {
            for (const update of groupsUpdates) {
                const id = conn.decodeJid(update.id)
                if (!id || id === 'status@broadcast') continue
                const isGroup = id.endsWith('@g.us')
                if (!isGroup) continue

                // Invalidate group metadata cache for this chat instantly
                if (conn.groupMetadataCache) {
                    conn.groupMetadataCache.delete(id)
                }

                let chats = conn.chats[id]
                if (!chats) chats = conn.chats[id] = { id }
                chats.isChats = true
                const metadata = await conn.groupMetadata(id).catch(_ => null)
                if (metadata) chats.metadata = metadata
                if (update.subject || metadata?.subject) chats.subject = update.subject || metadata.subject
            }
        } catch (e) {
            console.error(e)
        }
    })
    conn.ev.on('chats.upsert', function chatsUpsertPushToDb(chatsUpsert) {
        try {
            const { id, name } = chatsUpsert
            if (!id || id === 'status@broadcast') return
            conn.chats[id] = { ...(conn.chats[id] || {}), ...chatsUpsert, isChats: true }
            const isGroup = id.endsWith('@g.us')
            if (isGroup) conn.insertAllGroup().catch(_ => null)
        } catch (e) {
            console.error(e)
        }
    })
    conn.ev.on('presence.update', async function presenceUpdatePushToDb({ id, presences }) {
        try {
            const sender = Object.keys(presences)[0] || id
            const _sender = conn.decodeJid(sender)
            const presence = presences[sender]['lastKnownPresence'] || 'composing'
            let chats = conn.chats[_sender]
            if (!chats) chats = conn.chats[_sender] = { id: sender }
            chats.presences = presence
            if (id.endsWith('@g.us')) {
                let chats = conn.chats[id]
                if (!chats) chats = conn.chats[id] = { id }
            }
        } catch (e) {
            console.error(e)
        }
    })
}

function isNumber() {
    const int = parseInt(this)
    return typeof int === 'number' && !isNaN(int)
}
function getRandom() {
    if (Array.isArray(this) || this instanceof String) return this[Math.floor(Math.random() * this.length)]
    return Math.floor(Math.random() * this)
}
function nullish(args) {
    return !(args !== null && args !== undefined)
}
async function generateProfilePicture(mediaUpload) {
    let bufferOrFilePath
    if (Buffer.isBuffer(mediaUpload)) bufferOrFilePath = mediaUpload
    else if ('url' in mediaUpload) bufferOrFilePath = mediaUpload.url.toString()
    else bufferOrFilePath = await toBuffer(mediaUpload.stream)
    const { read, MIME_JPEG, AUTO } = await Promise.resolve().then(async () => (await import('jimp')).default)
    const jimp = await read(bufferOrFilePath)
    const min = jimp.getWidth()
    const max = jimp.getHeight()
    const cropped = jimp.crop(0, 0, min, max)
    return {
        img: await cropped.quality(100).scaleToFit(720, 720, AUTO).getBufferAsync(MIME_JPEG)
    }
}
