/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */

import './config.js';
import * as baileys from '@zansxart/baileys';
import NodeCache from 'node-cache';
import pino from 'pino';
import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import syntaxError from 'syntax-error';
import chalk from 'chalk';
import { storeDB } from './lib/store-db.js';

import { loadMessage, makeWASocket, protoType, serialize } from './core/services/runtime/simple.js';
import { handler } from './core/runtime/handler.js';
import { getDirname, getFilename, getRequire } from './core/services/runtime/utils.js';
import { loadPlugins } from './core/services/runtime/plugins.js';
import { animateProgress, showPairingCodePanel, statusLine, terminalTheme } from './core/services/system/terminal-ui.js';

const {
    DisconnectReason,
    fetchLatestBaileysVersion,
    useMultiFileAuthState,
    jidNormalizedUser,
    Browsers
} = baileys;

global.__filename = getFilename;
global.__dirname = getDirname;
global.__require = getRequire;

const __dirname = global.__dirname(import.meta.url);

// Global DB
global.db = { data: { users: {}, chats: {}, settings: {}, stats: {} } };
global.plugins = {};
global.timestamp = { start: new Date() };

// Load saved prefix from SQLite database if available
const savedPrefix = storeDB.getSetting('prefix');
if (savedPrefix !== undefined && savedPrefix !== null) {
    global.config = global.config || {};
    global.config.prefix = savedPrefix;
}
global.prefix = global.config?.prefix || 'noprefix';

// Error handlers
process.on('unhandledRejection', (reason, promise) => {
    console.error(chalk.red('[UNHANDLED REJECTION]'), reason);
});
process.on('uncaughtException', (err) => {
    console.error(chalk.red('[UNCAUGHT EXCEPTION]'), err);
});

protoType();
serialize();

const msgRetryCounterCache = new NodeCache();

// Reconnect guards (mencegah badai socket saat pairing / disconnect beruntun)
let reconnectScheduled = false;    // true bila reconnect sudah dijadwalkan, hindari tumpukan
let lastReconnectAt = 0;
let heartbeatTimer = null;         // simpan agar tidak bocor tiap reconnect
const RECONNECT_MIN_INTERVAL_MS = 5000;

// Lepas listener + tutup socket lama supaya tidak jadi zombie yang menumpuk
function teardownConn() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
    const old = global.conn;
    if (!old) return;
    try { old.ev?.removeAllListeners?.('connection.update'); } catch {}
    try { old.ev?.removeAllListeners?.('creds.update'); } catch {}
    try { old.ev?.removeAllListeners?.('messages.upsert'); } catch {}
    try { old.ws?.close?.(); } catch {}
    try { old.end?.(undefined); } catch {}
}

function scheduleReconnect(reason = 'unknown') {
    if (reconnectScheduled) return;
    const now = Date.now();
    const wait = Math.max(RECONNECT_MIN_INTERVAL_MS - (now - lastReconnectAt), 1500);
    reconnectScheduled = true;
    console.log(chalk.yellow(`[RECONNECT] Dijadwalkan dalam ${Math.ceil(wait / 1000)}s (alasan: ${reason})`));
    setTimeout(() => {
        reconnectScheduled = false;
        lastReconnectAt = Date.now();
        startBot();
    }, wait);
}

// Session setup
const sessionDir = path.resolve(`./${global.config?.sessions || 'sessions'}`);
const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

// Signal Key in-memory caching wrapper (mencegah I/O lag yang bikin pairing timeout/gagal taut)
const signalKeyCache = new Map();
const originalKeys = state.keys;
state.keys = {
    get: async (type, ids) => {
        const result = {};
        const missingIds = [];
        for (const id of ids) {
            const cacheKey = `${type}-${id}`;
            if (signalKeyCache.has(cacheKey)) {
                result[id] = signalKeyCache.get(cacheKey);
            } else {
                missingIds.push(id);
            }
        }
        if (missingIds.length > 0) {
            const fetched = await originalKeys.get(type, missingIds);
            for (const id of missingIds) {
                const value = fetched[id];
                const cacheKey = `${type}-${id}`;
                if (value) {
                    signalKeyCache.set(cacheKey, value);
                }
                result[id] = value;
            }
        }
        return result;
    },
    set: async (data) => {
        for (const type in data) {
            for (const id in data[type]) {
                const value = data[type][id];
                const cacheKey = `${type}-${id}`;
                if (value) {
                    signalKeyCache.set(cacheKey, value);
                } else {
                    signalKeyCache.delete(cacheKey);
                }
            }
        }
        await originalKeys.set(data);
    }
};

// Load plugins with onah engine (populates global.plugins AND global.pluginRuntime)
const pluginDir = path.join(__dirname, 'plugins');
await loadPlugins(pluginDir);

async function startBot() {
    let useQR = process.argv.includes('--qr') || global.config?.useQR === true;
    let phoneNumber = (global.info?.pairingNumber || global.info?.numberBot || '').replace(/[^0-9]/g, '');

    const { version } = await fetchLatestBaileysVersion();

    const connectionOptions = {
        pairingCode: !useQR,
        patchMessageBeforeSending: (msg) => msg,
        msgRetryCounterCache,
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: Browsers.ubuntu('Chrome'),
        version,
        getMessage: async (key) => {
            const jid = jidNormalizedUser(key.remoteJid);
            const loaded = await loadMessage(jid, key.id);
            return loaded?.message || '';
        },
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: false,
    };

    let conn = global.conn = makeWASocket(connectionOptions);
    conn.isInit = true;

    // ═════════════════════════════════════════
    // │  PAIRING CODE LOGIC (PERSIS SAMA DENGAN ONAH)
    // ═════════════════════════════════════════

    const PAIRING_MAX_ATTEMPTS = 15;
    const PAIRING_RETRY_DELAY_MS = 3000;
    const PAIRING_SOCKET_WAIT_MS = 20000;

    function isPairingSocketReady(targetConn = global.conn) {
        const ws = targetConn?.ws;
        if (!ws) return false;
        return Boolean(ws.isOpen || ws.readyState === 1);
    }

    async function waitForPairingSocketOpen(timeoutMs = PAIRING_SOCKET_WAIT_MS) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeoutMs) {
            if (global.conn?.authState?.creds?.registered) return global.conn;
            if (isPairingSocketReady(global.conn)) return global.conn;
            await new Promise(r => setTimeout(r, 1000));
        }
        return isPairingSocketReady(global.conn) ? global.conn : null;
    }

    function schedulePairingRetry(taskFn, attempt, error) {
        if (attempt >= PAIRING_MAX_ATTEMPTS) {
            console.error(chalk.red(`\n[PAIRING ERROR] Gagal request pairing code setelah ${PAIRING_MAX_ATTEMPTS} percobaan.`));
            return;
        }
        console.log(chalk.yellow(`[PAIRING] Socket belum siap, retry pairing ${attempt + 1}/${PAIRING_MAX_ATTEMPTS}...`));
        setTimeout(() => {
            void taskFn(attempt + 1);
        }, PAIRING_RETRY_DELAY_MS);
    }

    async function runDirectPairing(targetPhone, attempt = 1) {
        try {
            await animateProgress('Connecting to WA Socket', { duration: 600, width: 24, accent: terminalTheme.sky });
            const activeConn = await waitForPairingSocketOpen();
            if (!activeConn) throw new Error('Connection Closed');

            await animateProgress('Minting Pairing Code', { duration: 1000, width: 28, accent: terminalTheme.mint, glow: terminalTheme.amber });
            const code = await activeConn.requestPairingCode(targetPhone);
            
            showPairingCodePanel(targetPhone, code);
        } catch (error) {
            schedulePairingRetry(runDirectPairing.bind(null, targetPhone), attempt, error);
        }
    }

    if (!conn.authState.creds.registered && !useQR) {
        if (!phoneNumber) {
            console.error(chalk.red.bold('\n[PAIRING ERROR] Nomor bot belum diisi di config.js!\n'));
        } else {
            console.log(chalk.cyan(`[PAIRING] Requesting pairing code for +${phoneNumber}...`));
            setTimeout(() => {
                void runDirectPairing(phoneNumber);
            }, 1500);
        }
    }

    conn.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(chalk.red('Connection closed.'), shouldReconnect ? 'Reconnecting...' : 'Logged out.');
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log(chalk.green('✅ Connected to WhatsApp!'));
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
            await handler.call(conn, chatUpdate);
        } catch (e) {
            console.error(chalk.red('Error in handler:'), e);
        }
    });

    if (process.send) {
        setInterval(() => {
            process.send({ type: 'heartbeat' });
        }, 25000);
    }
}

startBot();
