import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../');
const mainScript = path.join(repoRoot, 'main.js');
const activeChildren = new Map();

let autostartPromise = null;

const toDigits = (value = '') => String(value || '').replace(/\D/g, '');

const now = () => Date.now();

function getStore() {
    if (!global.db?.data) throw new Error('Database belum siap.');
    if (!Array.isArray(global.db.data.hostedBots)) global.db.data.hostedBots = [];

    for (const record of global.db.data.hostedBots) {
        if (typeof record !== 'object' || !record) continue;
        if (!record.id) record.id = `sb-${crypto.randomBytes(3).toString('hex')}`;
        if (!record.status) record.status = 'stopped';
        if (!record.createdAt) record.createdAt = now();
        if (!record.updatedAt) record.updatedAt = now();
        if (typeof record.autoStart !== 'boolean') record.autoStart = false;
        if (typeof record.pid !== 'number') record.pid = 0;
        if (!record.ownerJid && global.owner) {
            record.ownerJid = `${toDigits(global.owner)}@s.whatsapp.net`;
        }
    }

    return global.db.data.hostedBots;
}

async function persist() {
    await global.safeDbWrite?.('subbot-manager').catch(() => {});
}

function getBaseDir() {
    const configured = global.config?.subbot?.baseDir || 'storage/hosted-bots';
    return path.resolve(repoRoot, configured);
}

function ensureInsideBase(targetPath) {
    const baseDir = getBaseDir();
    const resolved = path.resolve(targetPath);
    if (resolved === baseDir || resolved.startsWith(baseDir + path.sep)) return resolved;
    throw new Error('Path subbot keluar dari direktori yang diizinkan.');
}

function resolveRecordPaths(record) {
    const baseDir = getBaseDir();
    const rootDir = ensureInsideBase(path.join(baseDir, record.id));
    return {
        rootDir,
        sessionsDir: ensureInsideBase(path.join(rootDir, 'sessions')),
        databaseFile: ensureInsideBase(path.join(rootDir, 'database.json')),
    };
}

async function ensureRecordDirs(record) {
    const paths = resolveRecordPaths(record);
    await fs.promises.mkdir(paths.sessionsDir, { recursive: true });
    record.sessionsDir = path.relative(repoRoot, paths.sessionsDir).replace(/\\/g, '/');
    record.databaseFile = path.relative(repoRoot, paths.databaseFile).replace(/\\/g, '/');
    return paths;
}

function findRecord(query) {
    const store = getStore();
    const needle = String(query || '').trim();
    const digits = toDigits(needle);

    return store.find((record) => {
        if (!record) return false;
        if (needle && record.id === needle) return true;
        if (digits && toDigits(record.number) === digits) return true;
        if (needle && record.jid === needle) return true;
        return false;
    }) || null;
}

function getChildState(recordId) {
    return activeChildren.get(recordId) || null;
}

async function notifyOwner(jid, text) {
    if (!jid || !text) return;
    const conn = global.conn;
    if (!conn) return;

    try {
        await conn.sendMessage(jid, { text });
    } catch (error) {
        console.error(chalk.yellow('[SUBBOT NOTIFY ERROR]'), error?.message || error);
    }
}

function createRecord(number, ownerJid) {
    const store = getStore();
    const existing = store.find((record) => toDigits(record.number) === toDigits(number));
    if (existing) return existing;

    const record = {
        id: `sb-${crypto.randomBytes(3).toString('hex')}`,
        number: toDigits(number),
        ownerJid,
        jid: '',
        status: 'stopped',
        createdAt: now(),
        updatedAt: now(),
        lastStartAt: 0,
        lastStopAt: 0,
        lastReadyAt: 0,
        lastError: '',
        pid: 0,
        autoStart: false,
        sessionsDir: '',
        databaseFile: '',
    };

    store.push(record);
    return record;
}

function attachChildLogging(record, child) {
    const prefix = `[SUBBOT ${record.id}]`;
    child.stdout?.on('data', (chunk) => {
        const text = String(chunk || '').trim();
        if (!text) return;
        console.log(chalk.gray(`${prefix} ${text}`));
    });

    child.stderr?.on('data', (chunk) => {
        const text = String(chunk || '').trim();
        if (!text) return;
        console.error(chalk.red(`${prefix} ${text}`));
    });
}

async function handleChildMessage(record, message = {}) {
    if (!message || message.scope !== 'subbot') return;

    record.updatedAt = now();

    if (message.type === 'pairing_code') {
        record.status = 'pairing';
        record.lastError = '';
        await persist();
        await notifyOwner(
            record.ownerJid,
            `*Subbot Pairing*\n` +
            `ID: ${record.id}\n` +
            `Nomor: +${record.number}\n` +
            `Kode: *${message.formattedCode || message.code || '-'}*\n\n` +
            `Masukkan kode itu di WhatsApp nomor yang sedang dihost.`
        );
        return;
    }

    if (message.type === 'pairing_error') {
        record.status = 'error';
        record.lastError = message.message || 'Gagal meminta pairing code.';
        await persist();
        await notifyOwner(
            record.ownerJid,
            `*Subbot Error*\nID: ${record.id}\nNomor: +${record.number}\nPesan: ${record.lastError}`
        );
        return;
    }

    if (message.type === 'ready') {
        record.status = 'running';
        record.jid = message.jid || record.jid || '';
        record.lastReadyAt = now();
        record.lastError = '';
        await persist();
        await notifyOwner(
            record.ownerJid,
            `*Subbot Online*\nID: ${record.id}\nNomor: +${record.number}\nJID: ${record.jid || '-'}`
        );
        return;
    }

    if (message.type === 'connection_close') {
        record.status = 'reconnecting';
        record.lastError = message.message || '';
        await persist();
    }
}

function scheduleRestart(record) {
    const state = getChildState(record.id);
    if (!record.autoStart || !state || state.manualStop) return;
    if (state.restartTimer) return;

    const delayMs = global.config?.subbot?.autoRestartDelayMs || 5000;
    state.restartTimer = setTimeout(async () => {
        state.restartTimer = null;
        try {
            await startHostedBot(record.id, { ownerJid: record.ownerJid, reuseRecord: true, silentNotify: true });
        } catch (error) {
            record.status = 'error';
            record.lastError = error?.message || 'Gagal restart subbot.';
            record.updatedAt = now();
            await persist();
        }
    }, delayMs);
}

async function spawnChild(record, silentNotify = false) {
    const currentState = getChildState(record.id);
    if (currentState?.child && currentState.child.exitCode == null) {
        return record;
    }

    const paths = await ensureRecordDirs(record);
    const childArgs = [
        mainScript,
        record.number,
        '--subbot',
        '--skip-license-check',
        '--disable-startup-notice',
        '--subbot-id',
        record.id,
        '--subbot-owner',
        record.ownerJid || '',
        '--sessions',
        path.relative(repoRoot, paths.sessionsDir),
        '--database',
        path.relative(repoRoot, paths.databaseFile),
        '--pairing-number',
        record.number,
        '--number-bot',
        record.number,
        '--bot-name',
        `${global.info?.nameBot || 'markonah-md'}:${record.number}`,
    ];

    const child = spawn(process.execPath, childArgs, {
        cwd: repoRoot,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });

    const state = {
        child,
        manualStop: false,
        restartTimer: null,
    };

    activeChildren.set(record.id, state);
    attachChildLogging(record, child);

    child.on('message', (message) => {
        handleChildMessage(record, message).catch((error) => {
            console.error(chalk.red('[SUBBOT IPC ERROR]'), error);
        });
    });

    child.once('exit', async (code, signal) => {
        const latestState = getChildState(record.id);
        if (latestState?.restartTimer) {
            clearTimeout(latestState.restartTimer);
            latestState.restartTimer = null;
        }

        const wasManualStop = Boolean(latestState?.manualStop);
        activeChildren.delete(record.id);

        record.pid = 0;
        record.updatedAt = now();
        record.lastStopAt = now();
        record.status = wasManualStop ? 'stopped' : (record.autoStart ? 'restarting' : 'stopped');
        record.lastError = wasManualStop ? '' : `Exit code ${code ?? 'null'} signal ${signal ?? 'null'}`;
        await persist();

        if (!wasManualStop && record.autoStart) {
            await notifyOwner(
                record.ownerJid,
                `*Subbot Restart*\nID: ${record.id}\nNomor: +${record.number}\nStatus: proses bot keluar dan akan dicoba dinyalakan ulang.`
            );
            scheduleRestart(record);
        }
    });

    record.autoStart = true;
    record.status = 'starting';
    record.pid = child.pid || 0;
    record.lastStartAt = now();
    record.updatedAt = now();
    record.lastError = '';
    await persist();

    if (!silentNotify) {
        await notifyOwner(
            record.ownerJid,
            `*Subbot Start*\nID: ${record.id}\nNomor: +${record.number}\nStatus: proses bot sedang dijalankan.`
        );
    }

    return record;
}

export async function startHostedBot(query, options = {}) {
    const ownerJid = options.ownerJid || `${toDigits(global.owner)}@s.whatsapp.net`;
    const store = getStore();

    if (!global.config?.subbot?.maxInstances) {
        throw new Error('Konfigurasi maxInstances subbot tidak valid.');
    }

    let record = findRecord(query);
    if (!record) {
        const queryDigits = toDigits(query);
        if (options.reuseRecord && !queryDigits) {
            throw new Error('Bot tidak ditemukan.');
        }
        if (!queryDigits) throw new Error('Nomor bot tidak valid.');

        record = createRecord(queryDigits, ownerJid);
    }

    const childAlive = getChildState(record.id)?.child?.exitCode == null;
    const activeCount = store.filter((item) => item.autoStart && item.id !== record.id).length;
    if (!record.autoStart && !childAlive && activeCount >= global.config.subbot.maxInstances) {
        throw new Error(`Slot subbot penuh. Maksimal ${global.config.subbot.maxInstances} bot.`);
    }

    record.ownerJid = ownerJid;
    return spawnChild(record, options.silentNotify);
}

export async function stopHostedBot(query) {
    const record = findRecord(query);
    if (!record) throw new Error('Bot tidak ditemukan.');

    record.autoStart = false;
    record.updatedAt = now();

    const state = getChildState(record.id);
    if (state?.child && state.child.exitCode == null) {
        state.manualStop = true;
        record.status = 'stopping';
        await persist();
        state.child.kill();
    } else {
        record.status = 'stopped';
        record.pid = 0;
        record.lastStopAt = now();
        await persist();
    }

    return record;
}

export async function deleteHostedBot(query) {
    const store = getStore();
    const record = findRecord(query);
    if (!record) throw new Error('Bot tidak ditemukan.');

    await stopHostedBot(record.id).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const state = getChildState(record.id);
    if (state?.restartTimer) {
        clearTimeout(state.restartTimer);
        state.restartTimer = null;
    }
    activeChildren.delete(record.id);

    const paths = resolveRecordPaths(record);
    ensureInsideBase(paths.rootDir);
    if (fs.existsSync(paths.rootDir)) {
        await fs.promises.rm(paths.rootDir, { recursive: true, force: true });
    }

    const index = store.findIndex((item) => item.id === record.id);
    if (index >= 0) store.splice(index, 1);
    await persist();
    return record;
}

export function listHostedBots() {
    return [...getStore()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function formatHostedBotLine(record) {
    const childAlive = getChildState(record.id)?.child?.exitCode == null;
    const status = childAlive ? 'running' : (record.status || 'stopped');
    const toStamp = (value) => value ? new Date(value).toLocaleString('id-ID') : '-';
    const ownerNumber = toDigits(record.ownerJid);
    const lines = [
        `ID: ${record.id}`,
        `Nomor: +${record.number}`,
        `Status: ${status}`,
        `Owner: ${ownerNumber ? `+${ownerNumber}` : '-'}`,
        `AutoStart: ${record.autoStart ? 'ya' : 'tidak'}`,
        `PID: ${record.pid || '-'}`,
        `JID: ${record.jid || '-'}`,
        `Ready: ${toStamp(record.lastReadyAt)}`,
        `Start: ${toStamp(record.lastStartAt)}`,
    ];

    if (record.lastError) {
        lines.push(`Error: ${String(record.lastError).slice(0, 140)}`);
    }

    return lines.join('\n');
}

export async function autoStartHostedBots() {
    if (autostartPromise) return autostartPromise;

    autostartPromise = (async () => {
        const records = listHostedBots().filter((record) => record.autoStart);
        for (const record of records) {
            if (getChildState(record.id)?.child?.exitCode == null) continue;
            try {
                await spawnChild(record, true);
            } catch (error) {
                record.status = 'error';
                record.lastError = error?.message || 'Gagal autostart subbot.';
                record.updatedAt = now();
                await persist();
            }
        }
    })();

    try {
        await autostartPromise;
    } finally {
        autostartPromise = null;
    }
}
