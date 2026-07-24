/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */

import './config.js'; // Assumes config.js exists or will be created
import * as baileys from '@zansxart/baileys';
import NodeCache from 'node-cache';
import pino from 'pino';
import readline from 'readline';
import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import syntaxError from 'syntax-error';
import chalk from 'chalk';

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    proto,
    jidDecode,
    areJidsSameUser,
    generateWAMessage,
    generateWAMessageContent,
    generateWAMessageFromContent,
    extractMessageContent,
    Browsers,
    downloadContentFromMessage,
    prepareWAMessageMedia,
    jidNormalizedUser
} = baileys;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { storeDB } from './lib/store-db.js';

// Global DB
global.db = { data: { users: {}, chats: {}, settings: {} } };
global.plugins = {};

// Load saved prefix from SQLite database if available
const savedPrefix = storeDB.getSetting('prefix');
if (savedPrefix !== undefined && savedPrefix !== null) {
    global.config = global.config || {};
    global.config.prefix = savedPrefix;
}
global.prefix = global.config?.prefix || 'noprefix';

// Error handlers
process.on('unhandledRejection', (reason, promise) => {
    console.error(chalk.red('Unhandled Rejection at:'), promise, chalk.red('reason:'), reason);
});
process.on('uncaughtException', (err) => {
    console.error(chalk.red('Uncaught Exception:'), err);
});

// Setup prefix regex
let prefixRegex;
if (global.prefix === 'noprefix') {
    prefixRegex = /^[^\w\s]?/; // matches empty or any single non-word symbol
} else {
    prefixRegex = new RegExp(`^[${global.prefix.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')}]`);
}

const msgRetryCounterCache = new NodeCache();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

// Plugins Loader
const pluginDir = path.join(__dirname, 'plugins');
if (!fs.existsSync(pluginDir)) fs.mkdirSync(pluginDir, { recursive: true });

async function loadPlugin(file) {
    const relativePath = path.relative(__dirname, file);
    try {
        const fileContent = fs.readFileSync(file, 'utf-8');
        const err = syntaxError(fileContent, file, { sourceType: 'module', allowAwaitOutsideFunction: true });
        if (err) {
            console.error(chalk.red(`Syntax error in ${relativePath}:`), err);
            return;
        }
        
        // Cache bust
        const moduleUrl = `${pathToFileURL(file).href}?t=${Date.now()}`;
        const module = await import(moduleUrl);
        if (module.default) {
            global.plugins[relativePath] = module.default;
        }
    } catch (e) {
        console.error(chalk.red(`Error loading plugin ${relativePath}:`), e);
    }
}

function watchPlugins() {
    const watcher = chokidar.watch(pluginDir, { ignored: /(^|[\/\\])\../, persistent: true });
    watcher
        .on('add', file => { if (file.endsWith('.js')) loadPlugin(file); })
        .on('change', file => { if (file.endsWith('.js')) { console.log(chalk.cyan(`Reloading plugin: ${path.basename(file)}`)); loadPlugin(file); } })
        .on('unlink', file => { 
            const relativePath = path.relative(__dirname, file);
            delete global.plugins[relativePath];
        });
}
watchPlugins();

// SMSG Helper
function smsg(conn, m) {
    if (!m) return m;
    let M = proto.WebMessageInfo;
    if (m.key) {
        m.id = m.key.id;
        m.isBaileys = m.id.startsWith('BAE5') && m.id.length === 16;
        m.chat = m.key.remoteJid;
        m.fromMe = m.key.fromMe;
        m.isGroup = m.chat.endsWith('@g.us');
        m.sender = jidNormalizedUser(m.fromMe && conn.user.id || m.participant || m.key.participant || m.chat || '');
    }
    if (m.message) {
        m.mtype = Object.keys(m.message)[0];
        m.msg = m.message[m.mtype];
        
        // Extract text
        if (m.mtype === 'conversation') m.text = m.message.conversation;
        else if (m.mtype === 'extendedTextMessage') m.text = m.message.extendedTextMessage.text;
        else if (m.mtype === 'imageMessage') m.text = m.message.imageMessage.caption;
        else if (m.mtype === 'videoMessage') m.text = m.message.videoMessage.caption;
        else if (m.mtype === 'documentMessage') m.text = m.message.documentMessage.caption;
        else if (m.mtype === 'templateButtonReplyMessage') m.text = m.message.templateButtonReplyMessage.selectedId;
        else if (m.mtype === 'interactiveResponseMessage') {
            try {
                const params = JSON.parse(m.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
                m.text = params.id;
            } catch (e) {}
        }
        else if (m.mtype === 'buttonsResponseMessage') m.text = m.message.buttonsResponseMessage.selectedButtonId;
        else if (m.mtype === 'listResponseMessage') m.text = m.message.listResponseMessage.singleSelectReply.selectedRowId;
        else m.text = '';

        m.quoted = m.msg?.contextInfo?.quotedMessage ? m.msg.contextInfo : null;
        if (m.quoted) {
            let type = Object.keys(m.quoted.quotedMessage)[0];
            m.quoted.mtype = type;
            m.quoted.msg = m.quoted.quotedMessage[type];
            m.quoted.id = m.quoted.stanzaId;
            m.quoted.chat = m.quoted.remoteJid || m.chat;
            m.quoted.isBaileys = m.quoted.id ? m.quoted.id.startsWith('BAE5') && m.quoted.id.length === 16 : false;
            m.quoted.sender = jidNormalizedUser(m.quoted.participant || '');
            m.quoted.fromMe = m.quoted.sender === jidNormalizedUser(conn.user.id);
            m.quoted.text = m.quoted.msg?.text || m.quoted.msg?.caption || m.quoted.msg?.conversation || '';
            m.getQuotedObj = async () => {
                if (!m.quoted.id) return false;
                let q = await conn.loadMessage(m.chat, m.quoted.id, conn);
                return smsg(conn, q);
            };
        }
    }
    
    m.reply = (text, chatId = m.chat, options = {}) => conn.sendMessage(chatId, { text, ...options }, { quoted: m });
    
    return m;
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('sessions');
    const { version, isLatest } = await fetchLatestBaileysVersion();

    const conn = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: global.config?.useQR !== false,
        auth: state,
        browser: ['STORE-BOT', 'Chrome', '4.0.0'],
        msgRetryCounterCache,
        generateHighQualityLinkPreview: true
    });
    
    conn.getName = (jid) => jid; // Placeholder for getName

    conn.reply = async (jid, text, quoted, options) => {
        return conn.sendMessage(jid, { text, ...options }, { quoted });
    };

    if (global.config?.useQR === false && !conn.authState.creds.registered) {
        let phoneNumber = await question('Please enter your WhatsApp number (e.g. 628xxx):\n');
        phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
        const code = await conn.requestPairingCode(phoneNumber);
        console.log(chalk.green(`Pairing Code: ${code?.match(/.{1,4}/g)?.join('-') || code}`));
    }

    conn.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(chalk.red('Connection closed.'), shouldReconnect ? 'Reconnecting...' : 'Logged out.');
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log(chalk.green('Opened connection'));
            if (process.send) {
                process.send({
                    type: 'dashboard',
                    botName: global.info?.botName || 'STORE BOT',
                    version: '1.0.0',
                    plugins: Object.keys(global.plugins).length
                });
            }
        }
    });

    conn.ev.on('creds.update', saveCreds);

    conn.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            let m = chatUpdate.messages[0];
            if (!m.message) return;
            m.message = (Object.keys(m.message)[0] === 'ephemeralMessage') ? m.message.ephemeralMessage.message : m.message;
            if (m.key && m.key.remoteJid === 'status@broadcast') return;
            
            m = smsg(conn, m);
            
            // Execute before hooks (for conversational flows like buy process)
            for (let name in global.plugins) {
                let plugin = global.plugins[name];
                if (!plugin) continue;
                if (typeof plugin.before === 'function') {
                    try {
                        let stop = await plugin.before(m, { conn, isOwner: sender === global.owner + '@s.whatsapp.net' || (global.mods && global.mods.some(mod => { const num = Array.isArray(mod) ? mod[0] : mod; return sender === num + '@s.whatsapp.net'; })) });
                        if (stop) continue;
                    } catch (e) {
                        console.error(chalk.red(`Error in before hook ${name}:`), e);
                    }
                }
            }

            if (!m.text) return;

            let isCommand = false;
            let usedPrefix = '';
            let command = '';
            let args = [];
            let text = '';
            
            // Dynamic prefix resolution (memastikan setprefix dari plugin & DB selalu up-to-date)
            let activePrefix = storeDB.getSetting('prefix') || global.config?.prefix || global.prefix || '.';

            if (activePrefix === 'noprefix') {
                const match = m.text.match(/^[^\w\s]?/);
                usedPrefix = match ? match[0] : '';
                const textWithoutPrefix = m.text.slice(usedPrefix.length).trim();
                const parts = textWithoutPrefix.split(/\s+/);
                command = parts[0].toLowerCase();
                args = parts.slice(1);
                text = args.join(' ');
                isCommand = !!command;
            } else if (activePrefix === 'multi') {
                const multiRegex = /^[°•π÷×¶∆£¢€¥®™+✓_=|~!?@#$%^&.©^]/i;
                const match = m.text.match(multiRegex);
                if (match) {
                    usedPrefix = match[0];
                    const textWithoutPrefix = m.text.slice(usedPrefix.length).trim();
                    const parts = textWithoutPrefix.split(/\s+/);
                    command = parts[0].toLowerCase();
                    args = parts.slice(1);
                    text = args.join(' ');
                    isCommand = true;
                }
            } else {
                const customRegex = new RegExp(`^[${activePrefix.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')}]`);
                const match = m.text.match(customRegex);
                if (match) {
                    usedPrefix = match[0];
                    const textWithoutPrefix = m.text.slice(usedPrefix.length).trim();
                    const parts = textWithoutPrefix.split(/\s+/);
                    command = parts[0].toLowerCase();
                    args = parts.slice(1);
                    text = args.join(' ');
                    isCommand = true;
                }
            }

            const sender = m.sender;
            const isGroup = m.isGroup;
            const participants = isGroup ? await (async () => {
                const groupMetadata = await conn.groupMetadata(m.chat).catch(e => {});
                return groupMetadata?.participants || [];
            })() : [];
            const botNumber = jidNormalizedUser(conn.user.id);
            const isBotAdmin = isGroup ? participants.some(p => p.id === botNumber && (p.admin === 'admin' || p.admin === 'superadmin')) : false;
            const isAdmin = isGroup ? participants.some(p => p.id === sender && (p.admin === 'admin' || p.admin === 'superadmin')) : false;
            const isROwner = sender === global.owner + '@s.whatsapp.net';
            const isOwner = isROwner || (global.mods && global.mods.some(mod => {
                const num = Array.isArray(mod) ? mod[0] : mod;
                return sender === num + '@s.whatsapp.net';
            }));

            // Handler logic
            for (let name in global.plugins) {
                let plugin = global.plugins[name];
                if (!plugin) continue;

                const pluginCmds = Array.isArray(plugin.command) ? plugin.command : (typeof plugin.command === 'string' ? [plugin.command] : []);
                
                let isMatch = false;
                if (plugin.command instanceof RegExp) {
                    isMatch = plugin.command.test(command);
                } else {
                    isMatch = pluginCmds.includes(command);
                }

                if (isCommand && isMatch) {
                    if (plugin.owner && !isOwner) {
                        m.reply('Sorry, this command is only for the owner.');
                        continue;
                    }
                    if (plugin.rowner && !isROwner) {
                        m.reply('Sorry, this command is only for the real owner.');
                        continue;
                    }
                    if (plugin.group && !isGroup) {
                        m.reply('This command can only be used in groups.');
                        continue;
                    }
                    if (plugin.private && isGroup) {
                        m.reply('This command can only be used in private chat.');
                        continue;
                    }
                    if (plugin.admin && !isAdmin && !isOwner) {
                        m.reply('This command is only for group admins.');
                        continue;
                    }
                    if (plugin.botAdmin && !isBotAdmin) {
                        m.reply('Make the bot an admin first.');
                        continue;
                    }

                    try {
                        await plugin(m, {
                            conn, text, args, command, usedPrefix, 
                            isOwner, isROwner, isAdmin, isBotAdmin, participants
                        });
                    } catch (e) {
                        console.error(chalk.red(`Error in plugin ${name}:`), e);
                        m.reply('An error occurred while executing the command.');
                    }
                    break;
                }
            }
            
        } catch (e) {
            console.error(chalk.red('Error in messages.upsert:'), e);
        }
    });

    // IPC heartbeat
    if (process.send) {
        setInterval(() => {
            process.send({ type: 'heartbeat' });
        }, 25000);
    }
}

startBot();
