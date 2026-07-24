/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import CFonts from 'cfonts';
import chalk from 'chalk';
import './config.js'; // Assumes config.js exists or will be created

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let isRunning = false;
let restartCount = 0;
let lastRestart = Date.now();
const MAX_RESTARTS = 3;
const RESTART_WINDOW = 10000;

function start() {
    if (isRunning) return;
    isRunning = true;

    const child = spawn(process.argv[0], [path.join(__dirname, 'main.js'), ...process.argv.slice(2)], {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc']
    });

    child.on('message', (msg) => {
        if (msg === 'reset') {
            console.log(chalk.yellow('Resetting bot...'));
            child.kill();
        } else if (msg === 'stop') {
            console.log(chalk.red('Stopping bot...'));
            child.kill();
            process.exit(0);
        } else if (msg === 'uptime') {
            child.send({ type: 'uptime', uptime: process.uptime() });
        } else if (msg.type === 'heartbeat') {
            // Heartbeat received
        } else if (msg.type === 'dashboard') {
            console.clear();
            CFonts.say(msg.botName || 'STORE BOT', {
                font: 'block',
                align: 'center',
                colors: ['cyan', 'blue'],
                background: 'transparent',
                letterSpacing: 1,
                lineHeight: 1,
                space: true,
                maxLength: '0',
            });
            console.log(chalk.cyan('┏━━━〔 DASHBOARD 〕━⬣'));
            console.log(chalk.cyan('┃ ✦ ') + chalk.white(`Name: ${msg.botName}`));
            console.log(chalk.cyan('┃ ✦ ') + chalk.white(`Version: ${msg.version}`));
            console.log(chalk.cyan('┃ ✦ ') + chalk.white(`Plugins: ${msg.plugins}`));
            console.log(chalk.cyan('┗⬣\n'));
        }
    });

    child.on('exit', (code, signal) => {
        isRunning = false;
        console.log(chalk.red(`Process exited with code ${code}, signal ${signal}`));
        
        const now = Date.now();
        if (now - lastRestart < RESTART_WINDOW) {
            restartCount++;
        } else {
            restartCount = 1;
        }
        lastRestart = now;

        if (restartCount > MAX_RESTARTS) {
            console.error(chalk.red.bold(`Crash loop detected (${MAX_RESTARTS} restarts in ${RESTART_WINDOW/1000}s). Stopping.`));
            process.exit(1);
        }

        console.log(chalk.yellow('Restarting bot in 2 seconds...'));
        setTimeout(() => start(), 2000);
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log(chalk.yellow('\nGracefully shutting down from SIGINT (Ctrl-C)'));
        child.kill('SIGTERM');
        process.exit(0);
    });
    
    process.on('SIGTERM', () => {
        console.log(chalk.yellow('\nGracefully shutting down from SIGTERM'));
        child.kill('SIGTERM');
        process.exit(0);
    });
}

CFonts.say('STORE BOT', {
    font: 'chrome',
    align: 'center',
    colors: ['system']
});

start();
