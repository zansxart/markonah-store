import fs from 'fs';
import path from 'path';

const dbSaldoPath = './storage/database/saldo.json';

// Helper to normalize and get canonical JID
export function getCanonicalJid(jid) {
    if (!jid || typeof jid !== 'string') return jid;
    const cleanJid = jid.toLowerCase().trim();
    
    // Gunakan database JID aliases dari global.db
    const dbJidAliases = global.db?.data?.jidAliases || {};
    if (dbJidAliases[cleanJid]) {
        return dbJidAliases[cleanJid];
    }
    
    const bareDigits = cleanJid.replace(/\D/g, '');
    if (bareDigits && !cleanJid.includes('@')) {
        return `${bareDigits}@s.whatsapp.net`;
    }
    
    return cleanJid;
}

// Read saldo database with automatic alias merging
export function readSaldoDb() {
    let saldoDb = {};
    if (fs.existsSync(dbSaldoPath)) {
        try {
            saldoDb = JSON.parse(fs.readFileSync(dbSaldoPath, 'utf-8'));
        } catch (e) {
            console.error('[SALDO DB READ ERROR]', e);
        }
    }
    
    if (!saldoDb || typeof saldoDb !== 'object' || Array.isArray(saldoDb)) {
        saldoDb = {};
    }
    
    // Automatic Alias Merging:
    // Jika ada key yang merupakan alias ke canonical JID yang berbeda,
    // gabungkan saldonya ke canonical JID!
    const dbJidAliases = global.db?.data?.jidAliases || {};
    let changed = false;
    
    for (const [key, value] of Object.entries(saldoDb)) {
        if (value === null || value === undefined) {
            saldoDb[key] = 0;
            changed = true;
            continue;
        }
        
        const canonical = dbJidAliases[key];
        if (canonical && canonical !== key) {
            // Gabungkan saldo alias ke canonical JID
            const amount = Number(value) || 0;
            if (amount > 0) {
                saldoDb[canonical] = (Number(saldoDb[canonical]) || 0) + amount;
                console.log(`[SALDO MERGE] Merging Rp ${amount} from alias ${key} to canonical ${canonical}`);
            }
            delete saldoDb[key];
            changed = true;
        }
    }
    
    if (changed) {
        try {
            fs.writeFileSync(dbSaldoPath, JSON.stringify(saldoDb, null, 2));
        } catch (e) {
            console.error('[SALDO DB WRITE ERROR ON MERGE]', e);
        }
    }
    
    return saldoDb;
}

// Get user saldo
export function getUserSaldo(jid) {
    const canonical = getCanonicalJid(jid);
    const db = readSaldoDb();
    return Number(db[canonical]) || 0;
}

// Add user saldo
export function addSaldo(jid, amount) {
    const canonical = getCanonicalJid(jid);
    const db = readSaldoDb();
    const val = Number(amount) || 0;
    
    db[canonical] = (Number(db[canonical]) || 0) + val;
    
    try {
        fs.writeFileSync(dbSaldoPath, JSON.stringify(db, null, 2));
    } catch (e) {
        console.error('[SALDO DB WRITE ERROR]', e);
    }
    return db[canonical];
}

// Subtract user saldo
export function subtractSaldo(jid, amount) {
    return addSaldo(jid, -amount);
}
