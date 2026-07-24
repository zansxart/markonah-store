import axios from "axios";
import qs from "qs";

function uniqueCode(length = 5) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

class Atlantic {
    constructor(api_key) {
        this.api_key = api_key;
        this.baseURL = 'https://atlantich2h.com';
    }

    async profile() {
        const data = qs.stringify({
            'api_key': this.api_key
        });
        const config = {
            method: 'post',
            url: `${this.baseURL}/get_profile`,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data: data
        };

        try {
            const response = await axios(config);
            return response.data
        } catch (e) {
        console.log(e)
            return { data: e.response.data };
        }
    }

    async methodDeposit() {
        const data = qs.stringify({
            'api_key': this.api_key
        });
        const config = {
            method: 'post',
            url: `${this.baseURL}/deposit/metode`,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data: data
        };

        try {
            const response = await axios(config);
            return response.data
        } catch (e) {
        console.log(e)
            return { data: e.response.data };
        }
    }

    async createDeposit(nominal, type, metode) {
        let code = await uniqueCode();
        const data = qs.stringify({
            'api_key': this.api_key,
            reff_id: code,
            nominal,
            type,
            metode
        });
        const config = {
            method: 'post',
            url: `${this.baseURL}/deposit/create`,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data: data
        };

        try {
            const response = await axios(config);
            return response.data
        } catch (e) {
        console.log(e)
            return { data: e.response.data };
        }
    }

    async cancelDeposit(id) {
        const data = qs.stringify({
            'api_key': this.api_key,
            id: id 
        });
        const config = {
            method: 'post',
            url: `${this.baseURL}/deposit/cancel`,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data: data
        };

        try {
            const response = await axios(config);
            return response.data
        } catch (e) {
        console.log(e)
            return { data: e.response.data };
        }
    }

    async statusDeposit(id) {
        const data = qs.stringify({
            'api_key': this.api_key,
            id: id
        });
        const config = {
            method: 'post',
            url: `${this.baseURL}/deposit/status`,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data: data
        };

        try {
            const response = await axios(config);
            return response.data
        } catch (e) {
        console.log(e)
            return { data: e.response.data };
        }
    }
    async cairkanDeposit(id) {
        const data = qs.stringify({
            'api_key': this.api_key,
            id: id,
            action: true
        });
        const config = {
            method: 'post',
            url: `${this.baseURL}/deposit/instant`,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data: data
        };

        try {
            const response = await axios(config);
            return response.data
        } catch (e) {
        console.log(e)
            return { data: e.response.data };
        }
    }
    
    async listLayanan() {
    const data = qs.stringify({
        'api_key': this.api_key,
        type: 'prabayar'
    });

    const config = {
        method: 'post',
        url: `${this.baseURL}/layanan/price_list`,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        data: data
    };

    try {
        const response = await axios(config);
        return response.data
    } catch (e) {
        console.log(e)
        return {
            data: e.response.data
        };
    }
}
    async createOrder(code, target) {
    let reff_id = await uniqueCode();
    const data = qs.stringify({
        'api_key': this.api_key,
        reff_id,
        code,
        target
    });

    const config = {
        method: 'post',
        url: `${this.baseURL}/transaksi/create`,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        data: data
    };

    try {
        const response = await axios(config);
        return response.data
    } catch (e) {
    console.log(e)
        return {
            data: e.response.data
        };
    }
}
    async statusOrder(id, type = "prabayar") {
    const data = qs.stringify({
        'api_key': this.api_key,
        id,
        type
    });

    const config = {
        method: 'post',
        url: `${this.baseURL}/transaksi/status`,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        data: data
    };

    try {
        const response = await axios(config);
        return response.data
    } catch (e) {
    console.log(e)
        return {
            data: e.response.data
        };
    }
}
}

export { Atlantic };
