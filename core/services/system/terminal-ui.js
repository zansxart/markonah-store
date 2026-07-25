import boxen from 'boxen';
import chalk from 'chalk';
import cfonts from 'cfonts';

export const terminalTheme = Object.freeze({
    rose: '#FF6B6B',
    amber: '#FFE66D',
    mint: '#4ECDC4',
    sky: '#45B7D1',
    text: '#F8FAFC',
    textSoft: '#D5DEE8',
    muted: '#94A3B8',
    dim: '#64748B',
    line: '#223041',
    panel: '#0B1220',
    panelAlt: '#101826',
    success: '#6EE7B7',
    warning: '#FACC15',
    danger: '#F87171',
});

export const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

export function gradientText(
    text,
    colors = [terminalTheme.amber, terminalTheme.mint, terminalTheme.sky, terminalTheme.rose]
) {
    const palette = colors.length ? colors : [terminalTheme.mint];
    return [...String(text ?? '')]
        .map((char, index) => chalk.hex(palette[index % palette.length])(char))
        .join('');
}

export function formatCodeGroups(value, size = 4, separator = '  ') {
    const normalized = String(value ?? '').replace(/\s+/g, '');
    if (!normalized) return '-';
    return normalized.match(new RegExp(`.{1,${size}}`, 'g'))?.join(separator) || normalized;
}

export function renderKeyValueRows(entries, options = {}) {
    const keyWidth = Math.max(8, Number(options.keyWidth) || 12);
    const keyColor = options.keyColor || terminalTheme.muted;
    const separator = options.separator || ' : ';
    const separatorColor = options.separatorColor || terminalTheme.dim;
    const valueColor = options.valueColor || terminalTheme.text;

    return Object.entries(entries || {})
        .map(([key, value]) => {
            const normalizedValue = value == null || value === '' ? '-' : String(value);
            return [
                chalk.hex(keyColor)(key.padEnd(keyWidth)),
                chalk.hex(separatorColor)(separator),
                chalk.hex(valueColor)(normalizedValue),
            ].join('');
        })
        .join('\n');
}

export function renderPanel(options = {}) {
    const {
        eyebrow,
        title,
        subtitle,
        lines = [],
        footer,
        accent = terminalTheme.mint,
        borderStyle = 'round',
        padding = 1,
        margin = { top: 0, bottom: 1, left: 1, right: 1 },
        backgroundColor = terminalTheme.panel,
        dimBorder = false,
        titleAlignment = 'left',
    } = options;

    const hasAnsi = (value) => /\u001b\[[0-9;]*m/.test(String(value ?? ''));
    const content = [];
    if (eyebrow) content.push(chalk.hex(terminalTheme.dim)(String(eyebrow).toUpperCase()));
    if (title) {
        const titleValue = String(title);
        content.push(hasAnsi(titleValue) ? titleValue : chalk.hex(accent).bold(titleValue));
    }
    if (subtitle) {
        const subtitleValue = String(subtitle);
        content.push(hasAnsi(subtitleValue) ? subtitleValue : chalk.hex(terminalTheme.textSoft)(subtitleValue));
    }

    const normalizedLines = Array.isArray(lines) ? lines : [lines];
    const printableLines = normalizedLines
        .flatMap((line) => String(line ?? '').split('\n'))
        .filter((line, index, array) => !(line === '' && array[index - 1] === ''));

    if (printableLines.length) {
        if (content.length) content.push('');
        content.push(...printableLines);
    }

    if (footer) {
        if (content.length) content.push('');
        content.push(chalk.hex(terminalTheme.dim)(String(footer)));
    }

    return boxen(content.join('\n'), {
        padding,
        margin,
        borderStyle,
        borderColor: accent,
        backgroundColor,
        dimBorder,
        title: options.boxTitle,
        titleAlignment,
    });
}

export function statusLine(kind = 'info', text = '') {
    const palette = {
        info: { icon: 'i', color: terminalTheme.sky, textColor: terminalTheme.textSoft },
        success: { icon: '+', color: terminalTheme.mint, textColor: terminalTheme.text },
        warning: { icon: '!', color: terminalTheme.amber, textColor: terminalTheme.textSoft },
        error: { icon: 'x', color: terminalTheme.rose, textColor: terminalTheme.textSoft },
        muted: { icon: '.', color: terminalTheme.dim, textColor: terminalTheme.muted },
    };

    const selected = palette[kind] || palette.info;
    return [
        chalk.hex(selected.color)(`  ${selected.icon} `),
        chalk.hex(selected.textColor)(String(text)),
    ].join('');
}

export function printStatus(kind, text) {
    console.log(statusLine(kind, text));
}

export async function typeText(text, options = {}) {
    const charDelay = Math.max(0, Number(options.charDelay) || 8);
    const newline = options.newline !== false;
    const value = String(text ?? '');

    if (!process.stdout.isTTY || charDelay === 0) {
        process.stdout.write(value);
        if (newline) process.stdout.write('\n');
        return;
    }

    for (const char of value) {
        process.stdout.write(char);
        await wait(charDelay);
    }

    if (newline) process.stdout.write('\n');
}

export async function revealLines(lines, options = {}) {
    const lineDelay = Math.max(0, Number(options.lineDelay) || 55);
    const items = Array.isArray(lines) ? lines : [lines];

    for (const line of items) {
        await typeText(line, { charDelay: options.charDelay ?? 0 });
        if (lineDelay > 0) await wait(lineDelay);
    }
}

export async function animateProgress(label, options = {}) {
    const duration = Math.max(0, Number(options.duration) || 900);
    const width = Math.max(12, Number(options.width) || 26);
    const accent = options.accent || terminalTheme.mint;
    const glow = options.glow || terminalTheme.amber;
    const trail = options.trail || terminalTheme.line;
    const prefix = options.prefix || '  ';
    const steps = Math.max(width, Math.round(duration / 28));
    const pulses = options.pulses || ['   ', '.  ', '.. ', '...'];

    if (!process.stdout.isTTY) {
        console.log(statusLine('info', `${label}...`));
        if (duration > 0) await wait(Math.min(duration, 75));
        return;
    }

    for (let step = 0; step <= steps; step += 1) {
        const ratio = step / steps;
        const filledCount = Math.round(ratio * width);
        let bar = '';

        for (let index = 0; index < width; index += 1) {
            if (index < Math.max(0, filledCount - 1)) {
                bar += chalk.hex(accent)('█');
            } else if (index === filledCount - 1 && filledCount > 0) {
                bar += chalk.hex(glow)('█');
            } else {
                bar += chalk.hex(trail)('░');
            }
        }

        const percent = chalk.hex(terminalTheme.amber)(`${String(Math.round(ratio * 100)).padStart(3)}%`);
        const pulse = chalk.hex(terminalTheme.dim)(pulses[step % pulses.length]);
        process.stdout.write(`\r${prefix}${chalk.hex(terminalTheme.muted)(String(label).padEnd(18))} ${bar} ${percent} ${pulse}`);
        if (duration > 0) await wait(duration / steps);
    }

    process.stdout.write('\n');
}

export function showHeroBanner(options = {}) {
    const {
        title = 'MARKONAH',
        font = 'simpleBlock',
        colors = [terminalTheme.amber, terminalTheme.mint, terminalTheme.sky],
        subtitle,
        byline,
        accent = terminalTheme.mint,
    } = options;

    cfonts.say(title, {
        font,
        align: 'center',
        gradient: colors,
        transitionGradient: true,
        letterSpacing: 1,
        lineHeight: 0,
        space: false,
        background: 'transparent',
    });

    const ribbons = [subtitle, byline].filter(Boolean);
    if (!ribbons.length) return;

    const body = ribbons
        .map((line, index) =>
            index === 0
                ? gradientText(String(line).toUpperCase(), colors)
                : chalk.hex(terminalTheme.muted)(String(line))
        )
        .join('\n');

    console.log(
        boxen(body, {
            padding: { top: 0, bottom: 0, left: 2, right: 2 },
            margin: { top: 0, bottom: 1, left: 2, right: 2 },
            borderStyle: 'round',
            borderColor: accent,
            backgroundColor: terminalTheme.panelAlt,
            dimBorder: true,
        })
    );
}

export function hsvToRgb(h, s, v) {
    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export function applyTrueColorGradient(text, hueOffset = 0) {
    const chars = [...text];
    const len = chars.length;
    return chars.map((ch, idx) => {
        if (ch === ' ' || ch === '\n') return ch;
        const hue = (hueOffset + (idx / Math.max(1, len)) * 0.75) % 1.0;
        const [r, g, b] = hsvToRgb(hue, 0.9, 1.0);
        return `\x1b[38;2;${r};${g};${b}m${ch}\x1b[0m`;
    }).join('');
}

export async function playBrailleCartAnimation(label = 'Loading Store Engine', durationMs = 1200) {
    if (!process.stdout.isTTY) return;

    const brailleSpinners = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    const brailleDots = ['⡀', '⣀', '⣄', '⣤', '⣦', '⣶', '⣷', '⣿', '⣿', '⣶', '⣦', '⣤', '⣄', '⣀', '⡀'];
    const steps = 24;
    const interval = Math.max(30, Math.floor(durationMs / steps));

    for (let i = 0; i < steps; i++) {
        const spinner = chalk.hex(terminalTheme.amber)(brailleSpinners[i % brailleSpinners.length]);
        const dotLeft = chalk.hex(terminalTheme.mint)(brailleDots[i % brailleDots.length]);
        const dotRight = chalk.hex(terminalTheme.sky)(brailleDots[(i + 4) % brailleDots.length]);
        
        const barLength = 20;
        const fill = Math.round((i / steps) * barLength);
        const bar = chalk.hex(terminalTheme.mint)('⡿'.repeat(fill)) + chalk.hex(terminalTheme.line)('⠙'.repeat(barLength - fill));

        process.stdout.write(`\r  ${spinner} ${dotLeft} ${chalk.hex(terminalTheme.textSoft).bold(label)} [${bar}] ${dotRight} `);
        await wait(interval);
    }
    process.stdout.write('\r' + ' '.repeat(75) + '\r');
}

export function showStoreCartBanner(hueOffset = 0.1) {
    cfonts.say('STORE', {
        font: 'block',
        align: 'center',
        gradient: [terminalTheme.amber, terminalTheme.mint, terminalTheme.sky],
        transitionGradient: true,
        letterSpacing: 1,
        space: false
    });

    const rawFrame = '⠂⠄⠠⠐⠠⠐⠠⠐⠠⠐⠠⠐⠠⠐⠠⠐⠠⠐⠠⠐⠠⠐⠠⠐⠠⠐⠠⠐⠠⠐⠠⠐⠠⠐⠠⠐⠠⠐⠠⠐⠠⠐⠠⠐⠠⠐⠠⠐⠠⠐';
    const brailleFrame = applyTrueColorGradient(rawFrame, hueOffset);
    
    const cartLogo = [
        brailleFrame,
        applyTrueColorGradient('        🛒   M A R K O N A H   S T O R E   B O T   🛒', hueOffset + 0.1),
        applyTrueColorGradient('     ⣴⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣦', hueOffset + 0.2),
        applyTrueColorGradient('    ⢸⣿ [⡿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⢿] ⣿', hueOffset + 0.3),
        applyTrueColorGradient('    ⢸⣿    ⚡ Automatic Premium Account Store System ⚡    ⣿', hueOffset + 0.4),
        applyTrueColorGradient('     ⠙⢿⣦⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣴⡿⠋', hueOffset + 0.5),
        applyTrueColorGradient('         (⠟)                                                (⠟)', hueOffset + 0.6),
        brailleFrame,
    ].join('\n');

    console.log(cartLogo + '\n');
}

export function showPairingCodePanel(phoneNumber, code) {
    const formattedCode = formatCodeGroups(code, 4, ' - ');
    console.log(renderPanel({
        eyebrow: 'WhatsApp Pairing Unlocked',
        title: gradientText('PAIRING CODE', [terminalTheme.mint, terminalTheme.sky, terminalTheme.amber]),
        subtitle: chalk.hex(terminalTheme.text).bold(`  >>>  ${formattedCode}  <<<  `),
        lines: [
            renderKeyValueRows({
                'Phone Number': `+${phoneNumber}`,
                'Pairing Code': formattedCode,
                'Status': 'Waiting for WA verification',
            }, { keyWidth: 14 }),
            '',
            statusLine('info', '1. Buka WhatsApp di HP > Perangkat Tertaut > Tautkan Perangkat'),
            statusLine('info', '2. Pilih "Tautkan dengan nomor telepon saja"'),
            statusLine('success', `3. Masukkan kode persis: ${formattedCode}`),
        ],
        accent: terminalTheme.mint,
        backgroundColor: terminalTheme.panelAlt,
    }));
}
