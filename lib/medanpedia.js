/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 *
 * Modul Integrasi API Jasa Sosmed
 */

import fetch from 'node-fetch';
import qs from 'qs';

const BASE_URLS = [
    'https://api.medanpedia.co.id',
    'http://api.medanpedia.co.id',
    'https://medanpedia.co.id/api'
];

const MAINTENANCE_MSG = `⚠️ *LAYANAN SOSIAL MEDIA SEDANG MAINTENANCE*\n\nSistem server jasa sosial media saat ini sedang dalam pemeliharaan rutin. Silakan coba lagi dalam beberapa saat.`;

/**
 * Helper request ke API Provider Sosmed
 */
async function apiRequest(endpoint, payload = {}) {
    const apiId = payload.api_id || global.medanpedia?.apiId;
    const apiKey = payload.api_key || global.medanpedia?.apiKey;

    if (!apiId || !apiKey) {
        return {
            status: false,
            msg: MAINTENANCE_MSG
        };
    }

    const bodyData = qs.stringify({
        api_id: apiId,
        api_key: apiKey,
        ...payload
    });

    for (const baseUrl of BASE_URLS) {
        try {
            const response = await fetch(`${baseUrl}/${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*'
                },
                body: bodyData,
                timeout: 10000
            });

            const text = await response.text();
            
            let json;
            try {
                json = JSON.parse(text);
                
                if (json && json.status === false) {
                    json.msg = MAINTENANCE_MSG;
                }
                
                return json;
            } catch {
                // Lanjut ke endpoint berikutnya jika HTML / Non-JSON
            }
        } catch {
            // Lanjut ke endpoint berikutnya jika error
        }
    }

    return {
        status: false,
        msg: MAINTENANCE_MSG
    };
}

export const medanpedia = {
    async getProfile() {
        const res = await apiRequest('profile');
        if (res?.status) {
            return { ok: true, data: res.data };
        }
        return { ok: false, msg: res?.msg || MAINTENANCE_MSG };
    },

    async getServices() {
        const res = await apiRequest('services');
        if (res?.status && Array.isArray(res.data)) {
            return { ok: true, data: res.data };
        }
        return { ok: false, msg: res?.msg || MAINTENANCE_MSG };
    },

    async createOrder({ service, target, quantity, custom_comments, custom_link }) {
        const payload = {
            service,
            target,
            quantity
        };
        if (custom_comments) payload.custom_comments = custom_comments;
        if (custom_link) payload.custom_link = custom_link;

        const res = await apiRequest('order', payload);
        if (res?.status) {
            return { ok: true, data: res.data, orderId: res.data?.id };
        }
        return { ok: false, msg: res?.msg || MAINTENANCE_MSG };
    },

    async checkStatus(orderId) {
        const res = await apiRequest('status', { id: orderId });
        if (res?.status) {
            return { ok: true, data: res.data };
        }
        return { ok: false, msg: res?.msg || MAINTENANCE_MSG };
    },

    calculatePrice(basePrice, quantity = 1000) {
        const numBase = parseFloat(basePrice) || 0;
        const qty = parseInt(quantity) || 1;
        const totalBase = Math.ceil((numBase * qty) / 1000);

        const profitPercent = parseFloat(global.medanpedia?.profitPercent || 0);
        const profitNominal = parseInt(global.medanpedia?.profitNominal || 0);

        let finalPrice = totalBase;
        if (profitPercent > 0) {
            finalPrice += Math.ceil(totalBase * (profitPercent / 100));
        }
        if (profitNominal > 0) {
            finalPrice += profitNominal;
        }

        return Math.max(1, Math.ceil(finalPrice));
    }
};

export default medanpedia;
