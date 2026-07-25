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
import readline from 'readline';
import qrcode from 'qrcode';
import { fileURLToPath, pathToFileURL } from 'url';
import syntaxError from 'syntax-error';
import chalk from 'chalk';
import { storeDB } from './lib/store-db.js';
import { resolvePrefix, isNoPrefixMode } from './lib/prefix-util.js';

import { loadMessage, makeWASocket, protoType, serialize } from './core/services/runtime/simple.js';
import { handler } from './core/runtime/handler.js';
import { getDirname, getFilename, getRequire } from './core/services/runtime/utils.js';
import { loadPlugins, reloadPlugin, pluginFolder } from './core/services/runtime/plugins.js';
import { startPaymentHook } from './lib/payment-hook.js';
import { startTrxSweeper } from './lib/trx-sweeper.js';
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
const { prefix: resolvedPrefix, store: normalizedPrefix } = resolvePrefix(
    savedPrefix !== undefined && savedPrefix !== null
        ? savedPrefix
        : (global.config?.prefix ?? '.')
);
global.config = global.config || {};
global.config.prefix = normalizedPrefix;
global.prefix = resolvedPrefix;
global.__noPrefixMode = isNoPrefixMode(normalizedPrefix);

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
let pairingArmed = false;          // pairing hanya di-arm sekali, bukan tiap startBot() reconnect
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
    try { old.ev?.removeAllListeners?.('lid-mapping.update'); } catch {}
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

// Load plugins with onah engine (populates global.plugins AND global.pluginRuntime)
const pluginDir = path.join(__dirname, 'plugins');
await loadPlugins(pluginDir);

// ── Hot-reload plugin: pantau folder plugins, reload otomatis tanpa restart ──
// reloadPlugin sudah cek syntax dulu — kalau file error, versi lama tetap jalan.
const pluginWatcher = chokidar.watch(pluginFolder, {
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
});
const onPluginChange = (event) => (fullPath) => {
    if (!/\.(js|cjs)$/.test(fullPath)) return;
    const filename = path.relative(pluginFolder, fullPath);
    console.log(chalk.cyan(`[HOT-RELOAD] ${event}: ${filename}`));
    reloadPlugin(event, filename, fullPath);
};
pluginWatcher
    .on('add', onPluginChange('add'))
    .on('change', onPluginChange('change'))
    .on('unlink', onPluginChange('unlink'));
console.log(chalk.green(`[HOT-RELOAD] Memantau perubahan plugin di ${pluginFolder}`));

// Webhook auto-confirm pembayaran GoPay (idempotent: aman dipanggil sekali saat boot)
startPaymentHook();
// Auto-cancel pending kedaluwarsa. Umur dibaca dari SQL, jadi pending lama
// tetap kebersihan walau bot sempat restart (timer di buy.js cuma di memori).
startTrxSweeper();

async function startBot() {
    teardownConn();

    const sessionDir = path.resolve(`./${global.config?.sessions || 'sessions'}`);
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

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

    let useQR = global.__loginMode === 'qr' || process.argv.includes('--qr') || global.config?.useQR === true;
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
        if (global.conn?.authState?.creds?.registered) return; // sudah kepasang, stop retry
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
            if (global.conn?.authState?.creds?.registered) return; // sudah kepasang, jangan minta code lagi
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

    if (!conn.authState.creds.registered && !useQR && !pairingArmed) {
        pairingArmed = true;
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

        // Render QR ke terminal saat mode QR dipilih (auto-refresh tiap baileys emit qr baru).
        if (update.qr && useQR) {
            console.clear();
            qrcode.toString(update.qr, { type: 'terminal', small: true, margin: 0, errorCorrectionLevel: 'L' }, (err, qrString) => {
                if (err) return;
                console.log('\n');
                console.log(chalk.cyan('  ========== SCAN QR CODE =========='));
                console.log(chalk.green('  1. Buka WhatsApp di HP Anda'));
                console.log(chalk.green('  2. Perangkat Tertaut > Tautkan Perangkat'));
                console.log(chalk.gray('  3. Arahkan kamera ke QR di bawah'));
                console.log(chalk.yellow('  * QR berganti otomatis tiap beberapa detik.'));
                console.log('\n' + qrString + '\n');
            });
        }

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;

        if (connection === 'close') {
            const wasRegistered = Boolean(conn.authState?.creds?.registered);
            if (isLoggedOut && wasRegistered) {
                // Sesi yang SUDAH kepasang beneran ditolak WA (device di-unlink dari HP / kena
                // limit linked device) → memang wajib pair ulang, jadi hapus sesi mati.
                console.log(chalk.red.bold('[AUTH] Session logged out (401)! Auto-clearing dead sessions...'));
                try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch {}
                scheduleReconnect('session_logged_out');
            } else if (isLoggedOut && !wasRegistered) {
                // Masih proses pairing (belum registered). JANGAN hapus sesi — kalau dihapus,
                // pairing key ikut hilang dan kode yang lagi ditampilkan jadi invalid, bikin
                // loop pairing tanpa henti (kode ganti-ganti terus, ga pernah bisa connect).
                console.log(chalk.yellow('[AUTH] Pairing belum selesai — tunggu verifikasi di HP. Sesi TIDAK dihapus, kode tetap valid.'));
                scheduleReconnect('pairing_pending');
            } else {
                console.log(chalk.yellow('Connection closed. Reconnecting...'));
                scheduleReconnect('connection_closed');
            }
        } else if (connection === 'open') {
            console.log(chalk.green('✅ Connected to WhatsApp!'));
            if (process.send) {
                process.send({
                    type: 'dashboard',
                    botName: global.info?.botName || 'STORE BOT',
                    version: '1.0.0',
                    plugins: Object.keys(global.plugins || {}).length
                });
            }
        }
    });

    conn.ev.on('creds.update', saveCreds);

    // ── LID mapping: seed jidAliases (LID → nomor asli) ──
    // WhatsApp kirim mapping LID↔PN lewat event ini. Kita simpan ke jidAliases
    // supaya normalizeSender() di handler bisa resolve @lid jadi nomor asli
    // (kalau tidak, pengirim DM tampil "akun tidak dikenal").
    conn.ev.on('lid-mapping.update', (payload) => {
        try {
            const list = Array.isArray(payload) ? payload : [payload];
            if (!global.db?.data) return;
            const aliases = (global.db.data.jidAliases && typeof global.db.data.jidAliases === 'object')
                ? global.db.data.jidAliases
                : (global.db.data.jidAliases = {});
            let changed = false;
            for (const map of list) {
                const lid = map?.lid;
                const pn = map?.pn;
                if (!lid || !pn) continue;
                const pnDigits = String(pn).replace(/\D/g, '');
                if (!pnDigits) continue;
                const pnJid = `${pnDigits}@s.whatsapp.net`;
                const lidDigits = String(lid).replace(/\D/g, '');
                const keys = [lid];
                if (lidDigits) keys.push(lidDigits, `${lidDigits}@lid`);
                for (const key of keys) {
                    if (key && aliases[key] !== pnJid) { aliases[key] = pnJid; changed = true; }
                }
            }
            if (changed) global.markDbDirty?.();
        } catch (e) {
            console.error(chalk.red('[LID] Gagal memproses lid-mapping.update:'), e?.message || e);
        }
    });

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

// ═════════════════════════════════════════
// │  PEMILIHAN MODE LOGIN (PAIRING / QR)
// ═════════════════════════════════════════

// Keputusan mode tanpa efek samping (mudah dites). Return 'qr' | 'pairing' | 'ask'.
export function decideLoginMode({ registered, argv = [], isTTY, configUseQR, savedMode }) {
    if (argv.includes('--qr')) return 'qr';
    if (argv.includes('--pairing')) return 'pairing';
    // Sudah punya sesi → tidak perlu login ulang, jangan ganggu dengan pertanyaan.
    if (registered) return savedMode || (configUseQR ? 'qr' : 'pairing');
    // Belum punya sesi & interaktif → selalu tanya. Mode tersimpan cuma jadi
    // default sorotan, BUKAN pengganti pertanyaan: sesi hilang artinya user
    // mungkin mau ganti metode (misal pairing gagal, mau coba QR).
    if (isTTY) return 'ask';
    // Non-interaktif (pm2/nohup) → tidak bisa tanya, pakai mode terakhir.
    return savedMode || (configUseQR ? 'qr' : 'pairing');
}

// File penyimpan mode login (di root project, TIDAK ikut ke-wipe saat sessions dihapus).
const LOGIN_MODE_FILE = path.join(__dirname, '.loginmode');

function readSavedMode() {
    try {
        const v = fs.readFileSync(LOGIN_MODE_FILE, 'utf-8').trim();
        return (v === 'qr' || v === 'pairing') ? v : null;
    } catch { return null; }
}

function saveMode(mode) {
    try { fs.writeFileSync(LOGIN_MODE_FILE, mode); } catch {}
}

// Baca creds.json untuk tahu apakah sudah login.
function isRegistered() {
    try {
        const credsPath = path.resolve(`./${global.config?.sessions || 'sessions'}/creds.json`);
        if (!fs.existsSync(credsPath)) return false;
        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
        return Boolean(creds?.registered);
    } catch { return false; }
}

// Tanya user via readline (timeout 30 dtk → default mode terakhir/pairing).
function askLoginMode(defaultMode = 'pairing') {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const tag = (m) => (m === defaultMode ? chalk.green('  (default)') : '');
        console.log(chalk.cyan('\n┏━━━〔 PILIH METODE LOGIN 〕━⬣'));
        console.log(chalk.cyan('┃ ') + chalk.white('[1] Pairing Code') + tag('pairing'));
        console.log(chalk.cyan('┃ ') + chalk.white('[2] QR Code') + tag('qr') + chalk.gray('  (disaranin utk HP jadul)'));
        console.log(chalk.cyan('┗━━━━━━━━━━━━━━━━⬣'));

        let done = false;
        const finish = (mode) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            try { rl.close(); } catch {}
            resolve(mode);
        };
        const timer = setTimeout(() => {
            console.log(chalk.yellow(`\n[LOGIN] Tidak ada input, pakai default: ${defaultMode === 'qr' ? 'QR Code' : 'Pairing Code'}.`));
            finish(defaultMode);
        }, 30000);

        rl.question(chalk.green('Pilih (1/2): '), (answer) => {
            const a = (answer || '').trim().toLowerCase();
            if (!a) return finish(defaultMode);          // Enter kosong → mode terakhir
            finish(a === '2' || a === 'qr' ? 'qr' : 'pairing');
        });
    });
}

async function chooseLoginMode() {
    const savedMode = readSavedMode();
    const decision = decideLoginMode({
        registered: isRegistered(),
        argv: process.argv,
        isTTY: Boolean(process.stdin.isTTY),
        configUseQR: global.config?.useQR === true,
        savedMode,
    });
    if (decision !== 'ask') return decision;
    const chosen = await askLoginMode(savedMode || 'pairing');
    saveMode(chosen); // ingat pilihan → jadi default pertanyaan & fallback pm2
    return chosen;
}

global.__loginMode = await chooseLoginMode();
saveMode(global.__loginMode); // pastikan tersimpan (termasuk jalur flag/otomatis)
console.log(chalk.cyan(`[LOGIN] Mode: ${global.__loginMode === 'qr' ? 'QR Code' : 'Pairing Code'}`));
startBot();
