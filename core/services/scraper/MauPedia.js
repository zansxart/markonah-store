import axios from "axios"

const baseApi = 'https://maupedia.com';
const headers = {
    'Accept': 'application/json'
};

class TopUp {
    constructor({key, sign, secret}) {
        this.key = key;
        this.sign = sign;
        this.secret = secret;

        if (!key) {
            throw new Error("API key tidak ditemukan");
        } else if (!sign) {
            throw new Error("API sign tidak ditemukan");
        } else if (!secret) {
            throw new Error("API secret tidak ditemukan");
        }
    }

    async profile() {
        const data = new URLSearchParams();
        data.append("key", this.key);
        data.append("sign", this.sign);
        data.append("secret", this.secret);

        try {
            const response = await axios({
                method: 'POST',
                url: `${baseApi}/api/profile`,
                headers,
                data,
            });
            return response.data;
        } catch (error) {
            throw new Error(`Error fetching profile: ${error.message}`);
        }
    }
    // GAME
    async list_game(filter) {
        const data = new URLSearchParams();
        data.append("key", this.key);
        data.append("sign", this.sign);
        data.append("secret", this.secret);
        data.append("type", "services");
        data.append("filter_type", "game");
        data.append("filter_value", filter);

        try {
            const response = await axios({
                method: 'POST',
                url: `${baseApi}/api/game-feature`,
                headers,
                data,
            });
            return response.data;
        } catch (error) {
            throw new Error(`Error fetching profile: ${error.message}`);
        }
    }
    async cek_game(trxid) {
        const data = new URLSearchParams();
        data.append("key", this.key);
        data.append("sign", this.sign);
        data.append("secret", this.secret);
        data.append("type", "status");
        data.append("trxid", trxid);

        try {
            const response = await axios({
                method: 'POST',
                url: `${baseApi}/api/game-feature`,
                headers,
                data,
            });
            return response.data;
        } catch (error) {
            throw new Error(`Error fetching profile: ${error.message}`);
        }
    }
    async topup_game(service, data_no, data_zone = '') {
        const data = new URLSearchParams();
        data.append("key", this.key);
        data.append("sign", this.sign);
        data.append("secret", this.secret);
        data.append("type", "order");
        data.append("service", service);
        data.append("data_no", data_no);
        data.append("data_zone", data_zone);

        try {
            const response = await axios({
                method: 'POST',
                url: `${baseApi}/api/game-feature`,
                headers,
                data,
            });
            return response.data;
        } catch (error) {
            throw new Error(`Error fetching profile: ${error.message}`);
        }
    }
    // PRABAYAR
    async prabayar(service, data_no) {
        const data = new URLSearchParams();
        data.append("key", this.key);
        data.append("sign", this.sign);
        data.append("secret", this.secret);
        data.append("type", "order");
        data.append("service", service);
        data.append("data_no", data_no);

        try {
            const response = await axios({
                method: 'POST',
                url: `${baseApi}/api/prepaid`,
                headers,
                data,
            });
            return response.data;
        } catch (error) {
            throw new Error(`Error fetching profile: ${error.message}`);
        }
    }
    async cek_prabayar(trxid) {
        const data = new URLSearchParams();
        data.append("key", this.key);
        data.append("sign", this.sign);
        data.append("secret", this.secret);
        data.append("type", "status");
        data.append("trxid", trxid);

        try {
            const response = await axios({
                method: 'POST',
                url: `${baseApi}/api/prepaid`,
                headers,
                data,
            });
            return response.data;
        } catch (error) {
            throw new Error(`Error fetching profile: ${error.message}`);
        }
    }
    async list_prabayar(filter) {
        const data = new URLSearchParams();
        data.append("key", this.key);
        data.append("sign", this.sign);
        data.append("secret", this.secret);
        data.append("type", "services");
        data.append("filter_type", "brand");
        data.append("filter_value", filter);

        try {
            const response = await axios({
                method: 'POST',
                url: `${baseApi}/api/prepaid`,
                headers,
                data,
            });
            return response.data;
        } catch (error) {
            throw new Error(`Error fetching profile: ${error.message}`);
        }
    }
    // DEPOSIT
    async list_deposit(value) {
        const data = new URLSearchParams();
        data.append("key", this.key);
        data.append("sign", this.sign);
        data.append("secret", this.secret);
        data.append("type", "method");
        data.append("filter_type", "type");
        data.append("filter_value", value);

        try {
            const response = await axios({
                method: 'POST',
                url: `${baseApi}/api/deposit`,
                headers,
                data,
            });
            return response.data;
        } catch (error) {
            throw new Error(`Error fetching profile: ${error.message}`);
        }
    }
    async deposit(method, quantity) {
        const data = new URLSearchParams();
        data.append("key", this.key);
        data.append("sign", this.sign);
        data.append("secret", this.secret);
        data.append("type", "request");
        data.append("method", method);
        data.append("quantity", quantity);

        try {
            const response = await axios({
                method: 'POST',
                url: `${baseApi}/api/deposit`,
                headers,
                data,
            });
            return response.data;
        } catch (error) {
            throw new Error(`Error fetching profile: ${error.message}`);
        }
    }
    async cek_deposit(trxid) {
        const data = new URLSearchParams();
        data.append("key", this.key);
        data.append("sign", this.sign);
        data.append("secret", this.secret);
        data.append("type", "status");
        data.append("trxid", trxid);

        try {
            const response = await axios({
                method: 'POST',
                url: `${baseApi}/api/deposit`,
                headers,
                data,
            });
            return response.data;
        } catch (error) {
            throw new Error(`Error fetching profile: ${error.message}`);
        }
    }
    async cancel_deposit(trxid) {
        const data = new URLSearchParams();
        data.append("key", this.key);
        data.append("sign", this.sign);
        data.append("secret", this.secret);
        data.append("type", "cancel");
        data.append("trxid", trxid);

        try {
            const response = await axios({
                method: 'POST',
                url: `${baseApi}/api/deposit`,
                headers,
                data,
            });
            return response.data;
        } catch (error) {
            throw new Error(`Error fetching profile: ${error.message}`);
        }
    }
}

export { TopUp }