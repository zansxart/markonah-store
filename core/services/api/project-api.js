import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { pipeline } from 'stream/promises';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { fileTypeFromFile } from 'file-type';

const API_NAMES = ['ZANSX'];
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_PATTERN = /(fetch failed|socket hang up|econnreset|eai_again|etimedout|enotfound|econnrefused|network timeout|premature close|aborterror|operation was aborted|the operation was aborted|aborted)/i;
const DEFAULT_RETRY_DELAY_MS = 1500;
const MIME_EXTENSION_MAP = new Map([
    ['application/pdf', 'pdf'],
    ['application/zip', 'zip'],
    ['application/x-zip-compressed', 'zip'],
    ['application/x-rar-compressed', 'rar'],
    ['application/vnd.rar', 'rar'],
    ['application/x-7z-compressed', '7z'],
    ['application/java-archive', 'jar'],
    ['application/vnd.android.package-archive', 'apk'],
    ['application/msword', 'doc'],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
    ['application/vnd.ms-excel', 'xls'],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
    ['application/vnd.ms-powerpoint', 'ppt'],
    ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'pptx'],
    ['application/json', 'json'],
    ['text/plain', 'txt'],
    ['text/csv', 'csv'],
    ['text/html', 'html'],
    ['audio/mpeg', 'mp3'],
    ['audio/mp4', 'm4a'],
    ['video/mp4', 'mp4'],
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['image/gif', 'gif'],
]);
const GENERIC_FILE_NAME_PATTERN = /^(download|file|document|mediafire-download|gdrive-[a-z0-9_-]+)(?:\.[a-z0-9]+)?$/i;

const normalizeKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const isHttpUrl = (value) => typeof value === 'string' && /^https?:\/\//i.test(value.trim());

const sanitizeFileName = (value, fallback = 'download.bin') => {
    const clean = String(value || fallback)
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .replace(/\s+/g, ' ')
        .trim();

    return clean || fallback;
};

const safeDecodeURIComponent = (value = '') => {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
};

const getMimeBase = (value = '') => String(value || '').split(';')[0].trim().toLowerCase();

const getExtensionFromName = (value = '') => path.extname(String(value || '').trim()).replace(/^\./, '').toLowerCase();

const getExtensionFromMime = (value = '') => {
    const mime = getMimeBase(value);
    if (!mime) return '';
    if (MIME_EXTENSION_MAP.has(mime)) return MIME_EXTENSION_MAP.get(mime);

    const [, type = '', subtype = ''] = mime.match(/^([a-z0-9-]+)\/([a-z0-9.+-]+)$/i) || [];
    if (!type || !subtype) return '';

    let ext = subtype.toLowerCase().replace(/^x-/, '').split('+')[0];
    if (ext === 'jpeg') return 'jpg';
    if (ext === 'mpeg') return type === 'audio' ? 'mp3' : 'mpeg';
    if (ext === 'quicktime') return 'mov';
    if (ext === 'svg+xml') return 'svg';
    return ext;
};

const getFileNameFromUrl = (value = '') => {
    if (!isHttpUrl(value)) return '';

    try {
        const url = new URL(value);
        const baseName = path.posix.basename(url.pathname);
        if (!baseName || baseName === '/') return '';
        return sanitizeFileName(safeDecodeURIComponent(baseName), '');
    } catch {
        return '';
    }
};

const isGoogleDriveUrl = (value = '') => {
    if (!isHttpUrl(value)) return false;

    try {
        const hostname = new URL(value).hostname.toLowerCase();
        return hostname.includes('drive.google.com') || hostname.includes('drive.usercontent.google.com');
    } catch {
        return false;
    }
};

const normalizeGoogleDriveLink = (value = '', base = 'https://drive.google.com') => {
    if (!value) return '';

    const normalized = String(value)
        .replace(/\\u003d/g, '=')
        .replace(/\\u0026/g, '&')
        .replace(/\\u002f/g, '/')
        .replace(/\\\//g, '/');

    try {
        return new URL(normalized, base).toString();
    } catch {
        return '';
    }
};

const extractGoogleDriveDownloadUrl = (html = '', currentUrl = 'https://drive.google.com') => {
    const $ = cheerio.load(html);
    const form = $('form#download-form');

    if (form.length) {
        const action = normalizeGoogleDriveLink(form.attr('action') || currentUrl, currentUrl);
        if (action) {
            const downloadUrl = new URL(action);
            form.find('input[type="hidden"]').each((_, element) => {
                const name = $(element).attr('name');
                const value = $(element).attr('value') || '';
                if (name) downloadUrl.searchParams.set(name, value);
            });
            return downloadUrl.toString();
        }
    }

    const actionLink = $('a#uc-download-link').attr('href')
        || $('a[href*="confirm="][href*="id="]').attr('href')
        || $('a[href*="export=download"][href*="id="]').attr('href');
    if (actionLink) return normalizeGoogleDriveLink(actionLink, currentUrl);

    const embeddedUrlMatch = html.match(/"downloadUrl":"([^"]+)"/i)
        || html.match(/href="([^"]*confirm=[^"]*id=[^"]*)"/i);
    return normalizeGoogleDriveLink(embeddedUrlMatch?.[1] || '', currentUrl);
};

const parseDispositionFileName = (value = '') => {
    const utfMatch = value.match(/filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i);
    if (utfMatch?.[1]) {
        return sanitizeFileName(safeDecodeURIComponent(utfMatch[1].replace(/^"(.*)"$/, '$1').trim()), '');
    }

    const plainMatch = value.match(/filename\s*=\s*(?:"([^"]+)"|([^;]+))/i);
    const raw = plainMatch?.[1] || plainMatch?.[2] || '';
    return raw ? sanitizeFileName(safeDecodeURIComponent(raw.trim()), '') : '';
};

const chooseBaseFileName = (...values) => {
    const candidates = values
        .map((value) => sanitizeFileName(value, '').trim())
        .filter(Boolean);

    if (!candidates.length) return 'download';

    return candidates.find((value) => !GENERIC_FILE_NAME_PATTERN.test(value)) || candidates[0];
};

const ensureFileExtension = (fileName = '', extensions = []) => {
    const cleanName = sanitizeFileName(fileName, 'download').replace(/\.+$/g, '').trim() || 'download';
    const currentExt = getExtensionFromName(cleanName);
    const preferredExt = extensions
        .map((value) => String(value || '').replace(/^\./, '').toLowerCase())
        .find((value) => value && value !== 'bin')
        || extensions
            .map((value) => String(value || '').replace(/^\./, '').toLowerCase())
            .find(Boolean)
        || '';

    if (currentExt && currentExt !== 'bin') return cleanName;
    if (currentExt === 'bin' && preferredExt) return cleanName.replace(/\.[^.]+$/, `.${preferredExt}`);
    if (!currentExt && preferredExt) return `${cleanName}.${preferredExt}`;
    return cleanName;
};

const normalizeSendAs = (value = 'auto') => {
    const normalized = String(value || 'auto').trim().toLowerCase();
    return ['auto', 'audio', 'video', 'image', 'document'].includes(normalized) ? normalized : 'auto';
};

const detectSendAsFromMime = (value = '') => {
    const mime = getMimeBase(value);
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('image/')) return 'image';
    return 'document';
};

const getProjectApiBase = () => {
    for (const name of API_NAMES) {
        if (global.APIs?.[name]) return global.APIs[name];
    }

    const fallback = Object.values(global.APIs || {}).find((value) => isHttpUrl(value));
    return fallback || 'https://api.zansxart.me';
};

const getProjectApiKey = () => {
    const base = getProjectApiBase();
    return global.Key?.[base] || '';
};

const getProjectHeaders = (headers = {}) => {
    const key = getProjectApiKey();
    return {
        ...(key ? { 'X-API-Key': key, 'ZANSX-API-Key': key } : {}),
        'User-Agent': 'ONAH-Bot/1.0',
        ...headers,
    };
};

const buildUrl = (input, query = {}) => {
    const base = getProjectApiBase();
    const url = isHttpUrl(input) ? new URL(input) : new URL(input, base);
    const key = getProjectApiKey();
    const finalQuery = { ...(query || {}) };

    if (key && !Object.prototype.hasOwnProperty.call(finalQuery, 'apikey') && /^\/?api\//i.test(url.pathname)) {
        finalQuery.apikey = key;
    }

    for (const [key, value] of Object.entries(finalQuery)) {
        if (value === undefined || value === null || value === '') continue;
        url.searchParams.set(key, String(value));
    }

    return url.toString();
};

const readErrorMessage = async (response) => {
    try {
        const data = await response.json();
        return data?.message || data?.error || JSON.stringify(data);
    } catch {
        const text = await response.text().catch(() => '');
        return text || `${response.status} ${response.statusText}`;
    }
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const shouldRetryStatus = (status) => RETRYABLE_STATUS_CODES.has(Number(status));
const shouldRetryError = (error) => RETRYABLE_ERROR_PATTERN.test(String(error?.message || error || ''));
const isAbortLikeError = (error) => {
    const text = [
        error?.name,
        error?.type,
        error?.code,
        error?.message,
        typeof error?.toString === 'function' ? error.toString() : '',
    ].filter(Boolean).join(' ');

    return /(aborterror|operation was aborted|the operation was aborted|aborted)/i.test(text);
};

const fetchProjectResponse = async (input, query = {}, options = {}) => {
    const url = buildUrl(input, query);
    const retries = Math.max(0, Number(options.retries) || 0);
    const retryDelayMs = Math.max(250, Number(options.retryDelayMs) || DEFAULT_RETRY_DELAY_MS);
    const headers = getProjectHeaders(options.headers);
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            const fetchOptions = {
                method: 'GET',
                headers,
            };
            
            const timeoutMs = options.timeout || 20000;
            if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
                fetchOptions.signal = AbortSignal.timeout(timeoutMs);
            }

            const response = await fetch(url, fetchOptions);

            if (response.ok) {
                return response;
            }

            const message = await readErrorMessage(response);
            const error = new Error(message || `${response.status} ${response.statusText}`);
            error.statusCode = response.status;
            lastError = error;

            if (attempt < retries && shouldRetryStatus(response.status)) {
                await delay(retryDelayMs * (attempt + 1));
                continue;
            }

            throw error;
        } catch (error) {
            lastError = error;

            if (attempt < retries && shouldRetryError(error)) {
                await delay(retryDelayMs * (attempt + 1));
                continue;
            }

            if (isAbortLikeError(error)) {
                const timeoutError = new Error(`Project API timeout setelah ${options.timeout || 20000}ms.`);
                timeoutError.code = 'PROJECT_API_TIMEOUT';
                timeoutError.cause = error;
                throw timeoutError;
            }

            throw error;
        }
    }

    throw lastError || new Error('Permintaan API gagal.');
};

const resolveDownloadResponse = async (input, query = {}, options = {}) => {
    let response = await fetchProjectResponse(input, query, options);
    const contentType = getMimeBase(response.headers.get('content-type'));

    if (!isGoogleDriveUrl(response.url) || contentType !== 'text/html') {
        return response;
    }

    const html = await response.text();
    const confirmedUrl = extractGoogleDriveDownloadUrl(html, response.url);
    if (!confirmedUrl) {
        throw new Error('Google Drive meminta halaman konfirmasi download atau file tidak bisa diakses publik.');
    }

    response = await fetchProjectResponse(confirmedUrl, {}, options);
    const confirmedContentType = getMimeBase(response.headers.get('content-type'));
    if (isGoogleDriveUrl(response.url) && confirmedContentType === 'text/html') {
        throw new Error('Google Drive belum memberikan file asli. Coba lagi nanti atau pastikan file publik.');
    }

    return response;
};

export const unwrapData = (response) => {
    if (response?.data !== undefined) return response.data;
    if (response?.result !== undefined) return response.result;
    return response;
};

export const requestProjectJson = async (input, query = {}, options = {}) => {
    const response = await fetchProjectResponse(input, query, options);
    const json = await response.json();

    if (json?.status === false) {
        throw new Error(json.message || 'Permintaan API gagal.');
    }

    if (json?.error) {
        throw new Error(typeof json.error === 'string' ? json.error : JSON.stringify(json.error));
    }

    return json;
};

export const downloadProjectFile = async (input, query = {}, fallbackName = 'download.bin', options = {}) => {
    const response = await resolveDownloadResponse(input, query, options);
    if (!response.body) {
        throw new Error('File stream tidak tersedia.');
    }

    const disposition = response.headers.get('content-disposition') || '';
    const contentTypeHeader = response.headers.get('content-type') || 'application/octet-stream';
    const dispositionFileName = parseDispositionFileName(disposition);
    const urlFileName = getFileNameFromUrl(response.url);
    const baseFileName = chooseBaseFileName(dispositionFileName, fallbackName, urlFileName);
    const tempFileName = ensureFileExtension(baseFileName, [
        getExtensionFromName(dispositionFileName),
        getExtensionFromName(fallbackName),
        getExtensionFromName(urlFileName),
        getExtensionFromMime(contentTypeHeader),
    ]);
    const filePath = path.join(os.tmpdir(), `${Date.now()}-${randomUUID()}-${tempFileName}`);

    await pipeline(response.body, fs.createWriteStream(filePath));

    const detectedType = await fileTypeFromFile(filePath).catch(() => null);
    const fileName = ensureFileExtension(baseFileName, [
        detectedType?.ext,
        getExtensionFromName(dispositionFileName),
        getExtensionFromName(fallbackName),
        getExtensionFromName(urlFileName),
        getExtensionFromMime(detectedType?.mime),
        getExtensionFromMime(contentTypeHeader),
    ]);
    const contentType = getMimeBase(contentTypeHeader);

    return {
        filePath,
        fileName,
        contentType: contentType && contentType !== 'application/octet-stream'
            ? contentType
            : detectedType?.mime || contentType || 'application/octet-stream',
    };
};

export const cleanupTempFile = async (filePath) => {
    if (!filePath) return;
    await fs.promises.unlink(filePath).catch(() => {});
};

export const sendDownloadedProjectMedia = async (conn, jid, tempFile, options = {}) => {
    if (!conn?.sendMessage) {
        throw new Error('Koneksi WhatsApp tidak valid.');
    }

    if (!tempFile?.filePath) {
        throw new Error('File download sementara tidak tersedia.');
    }

    const extraMessage = options.message && typeof options.message === 'object'
        ? { ...options.message }
        : {};
    const sendOptions = options.sendOptions && typeof options.sendOptions === 'object'
        ? { ...options.sendOptions }
        : {};
    const quoted = options.quoted || sendOptions.quoted;
    const caption = firstNonEmpty(options.caption, extraMessage.caption, '');
    const mimetype = getMimeBase(options.contentType || options.mimetype || tempFile.contentType) || 'application/octet-stream';
    const fileName = sanitizeFileName(options.fileName || tempFile.fileName || 'download.bin', 'download.bin');
    const sendAs = normalizeSendAs(options.sendAs);
    const resolvedSendAs = sendAs === 'auto' ? detectSendAsFromMime(mimetype) : sendAs;
    const message = { ...extraMessage };

    delete message.caption;

    if (resolvedSendAs === 'audio') {
        message.audio = { url: tempFile.filePath };
        message.mimetype = mimetype;
        message.fileName = fileName;
        if (options.ptt) message.ptt = true;
    } else if (resolvedSendAs === 'video') {
        message.video = { url: tempFile.filePath };
        message.mimetype = mimetype;
        if (caption) message.caption = caption;
    } else if (resolvedSendAs === 'image') {
        message.image = { url: tempFile.filePath };
        message.mimetype = mimetype;
        if (caption) message.caption = caption;
    } else {
        message.document = { url: tempFile.filePath };
        message.mimetype = mimetype;
        message.fileName = fileName;
        if (caption) message.caption = caption;
    }

    if (quoted) sendOptions.quoted = quoted;

    return conn.sendMessage(jid, message, sendOptions);
};

export const downloadAndSendProjectMedia = async (conn, jid, input, options = {}) => {
    const {
        query = {},
        fallbackName = 'download.bin',
        downloadOptions = {},
        ...sendOptions
    } = options;

    let tempFile = null;

    try {
        tempFile = await downloadProjectFile(input, query, fallbackName, downloadOptions);
        return await sendDownloadedProjectMedia(conn, jid, tempFile, sendOptions);
    } finally {
        await cleanupTempFile(tempFile?.filePath);
    }
};

const visitValue = (value, key, visitor) => {
    if (Array.isArray(value)) {
        for (const item of value) visitValue(item, key, visitor);
        return;
    }

    if (value && typeof value === 'object') {
        for (const [childKey, childValue] of Object.entries(value)) {
            visitValue(childValue, childKey, visitor);
        }
        return;
    }

    visitor(value, key);
};

export const findUrlsByKeys = (value, keys = []) => {
    const wanted = new Set(keys.map(normalizeKey));
    const results = [];

    visitValue(value, '', (item, key) => {
        if (!wanted.has(normalizeKey(key)) || !isHttpUrl(item)) return;
        results.push(item.trim());
    });

    return [...new Set(results)];
};

export const collectUrls = (value) => {
    const results = [];

    visitValue(value, '', (item) => {
        if (isHttpUrl(item)) results.push(item.trim());
    });

    return [...new Set(results)];
};

export const pickText = (value, keys = []) => {
    const wanted = new Set(keys.map(normalizeKey));
    let found = '';

    visitValue(value, '', (item, key) => {
        if (found || !wanted.has(normalizeKey(key)) || typeof item !== 'string') return;
        const clean = item.trim();
        if (clean) found = clean;
    });

    return found;
};

export const firstNonEmpty = (...values) => values.find((value) => {
    if (Array.isArray(value)) return value.length > 0;
    return value !== undefined && value !== null && value !== '';
});

export const formatList = (items = []) => items.filter(Boolean).map((item, index) => `${index + 1}. ${item}`).join('\n');

export { buildUrl as buildProjectUrl, getProjectApiBase, getProjectApiKey };
