const toDigits = (value = '') => String(value || '').replace(/\D/g, '');

const parsePositiveInt = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const readText = (value, fallback = '') => {
    if (value == null) return fallback;
    const text = String(value).trim();
    return text ? text : fallback;
};

export function applyRuntimeOverrides(opts = {}) {
    if (!opts || typeof opts !== 'object') return;

    const positional = Array.isArray(opts._) ? opts._ : [];
    const cliNumber = positional.map(toDigits).find(Boolean) || '';

    global.config = global.config || {};
    global.info = global.info || {};
    global.config.subbot = global.config.subbot || {};

    const sessions = readText(opts.sessions);
    if (sessions) global.config.sessions = sessions;

    const database = readText(opts.database);
    if (database) global.config.database = database;

    const pairingCode = readText(opts['pairing-code']);
    if (pairingCode) global.config.pairingCode = pairingCode;

    if (opts.subbot === true) global.config.isSubBot = true;
    if (opts['skip-license-check'] === true) global.config.skipLicenseCheck = true;
    if (opts['disable-startup-notice'] === true) global.config.disableStartupNotice = true;

    const subbotId = readText(opts['subbot-id']);
    if (subbotId) global.config.subbotId = subbotId;

    const subbotOwner = readText(opts['subbot-owner']);
    if (subbotOwner) global.config.subbotOwner = subbotOwner;

    const baseDir = readText(opts['subbot-base-dir']);
    if (baseDir) global.config.subbot.baseDir = baseDir;

    if (opts['subbot-max-instances'] != null) {
        global.config.subbot.maxInstances = parsePositiveInt(
            opts['subbot-max-instances'],
            global.config.subbot.maxInstances || 5
        );
    }

    if (opts['subbot-restart-delay-ms'] != null) {
        global.config.subbot.autoRestartDelayMs = parsePositiveInt(
            opts['subbot-restart-delay-ms'],
            global.config.subbot.autoRestartDelayMs || 5000
        );
    }

    const numberBot = toDigits(opts['number-bot'] || cliNumber);
    if (numberBot) global.info.numberBot = numberBot;

    const pairingNumber = toDigits(opts['pairing-number'] || cliNumber);
    if (pairingNumber) global.info.pairingNumber = pairingNumber;

    const botName = readText(opts['bot-name']);
    if (botName) {
        global.info.nameBot = botName;
        global.info.wm = `${botName} (c) zansxart`;
    }
}
