/**
          `   ◇───────◇───────◇
                    𝚃𝙸𝚇𝙾 
                    𝚃𝙴𝙰𝙼
            ────┈┈┈┄┄╌╌╌╌┄┄┈┈┈────
              © Tio 6282285357346
**/

import axios from "axios";

class OrderKuotaAPI {
    constructor({ memberID, pin, password }) {
        this.baseURL = 'https://h2h.okeconnect.com/trx';
        this.memberID = memberID;
        this.pin = pin;
        this.password = password;
        this.headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
    }

    async getBalance() {
        const url = `${this.baseURL}/balance?memberID=${this.memberID}&pin=${this.pin}&password=${this.password}`;
        try {
            const response = await axios.get(url, { headers: this.headers });
            return response.data;
        } catch (error) {
            console.error('Error fetching balance:', error);
            throw error;
        }
    }

    async statusTransaction(product, dest, refID) {
        const url = `${this.baseURL}?memberID=${this.memberID}&pin=${this.pin}&password=${this.password}&product=${product}&dest=${dest}&refID=${refID}`;
        try {
            const response = await axios.get(url, { headers: this.headers, maxBodyLength: Infinity });
            return response.data;
        } catch (error) {
            console.error('Error checking transaction:', error);
            throw error;
        }
    }
    
    async makeTransaction(product, dest, refID) {
        const url = `${this.baseURL}?product=${product}&dest=${dest}&refID=${refID}&memberID=${this.memberID}&pin=${this.pin}&password=${this.password}`;
        try {
            const response = await axios.get(url, { headers: this.headers, maxBodyLength: Infinity });
            return response.data;
        } catch (error) {
            console.error('Error making transaction:', error);
            throw error;
        }
    }

    async getMutasi(key) {
        const url = `https://gateway.okeconnect.com/api/mutasi/qris/${this.memberID}/${key}`;
        try {
            const response = await axios.get(url, { headers: this.headers, maxBodyLength: Infinity });
            return response.data;
        } catch (error) {
            console.error('Error fetching mutasi:', error);
            throw error;
        }
    }
}

export { OrderKuotaAPI }