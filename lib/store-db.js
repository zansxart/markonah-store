/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'storage', 'database', 'store.db');

// Pastikan folder database ada
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// ═══════════════════════════════════════
// │  SCHEMA INITIALIZATION
// ═══════════════════════════════════════

db.exec(`
    CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        price INTEGER NOT NULL,
        category TEXT DEFAULT 'Umum',
        description TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS stock (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id TEXT NOT NULL,
        data TEXT NOT NULL,
        is_sold INTEGER DEFAULT 0,
        added_at TEXT DEFAULT (datetime('now', 'localtime')),
        sold_at TEXT,
        sold_to TEXT,
        invoice_id TEXT,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS transactions (
        invoice_id TEXT PRIMARY KEY,
        buyer_jid TEXT NOT NULL,
        product_id TEXT NOT NULL,
        product_name TEXT,
        qty INTEGER DEFAULT 1,
        total_price INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        payment_method TEXT DEFAULT 'qris',
        stock_data TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT DEFAULT (datetime('now', 'localtime')),
        completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_stock_product ON stock(product_id, is_sold);
    CREATE INDEX IF NOT EXISTS idx_trx_buyer ON transactions(buyer_jid);
    CREATE INDEX IF NOT EXISTS idx_trx_status ON transactions(status);
`);

// ═══════════════════════════════════════
// │  MIGRATIONS (idempotent)
// ═══════════════════════════════════════
// Tabel transactions dibuat via CREATE TABLE IF NOT EXISTS, jadi kolom baru
// harus ditambah manual & aman untuk DB lama.
{
    const cols = db.prepare(`PRAGMA table_info(transactions)`).all().map(c => c.name);
    if (!cols.includes('unique_amount')) {
        // Nominal final yang ditagih (harga + kode receh unik), dipakai matcher webhook.
        db.exec(`ALTER TABLE transactions ADD COLUMN unique_amount INTEGER`);
    }
    if (!cols.includes('chat_jid')) {
        // Chat asal transaksi (grup atau PC). Notif hasil transaksi dikirim balik
        // ke sini, jadi tidak perlu setting JID grup manual di config.
        db.exec(`ALTER TABLE transactions ADD COLUMN chat_jid TEXT`);
    }
    db.exec(`CREATE INDEX IF NOT EXISTS idx_trx_amount ON transactions(unique_amount, status)`);
}

// ═══════════════════════════════════════
// │  PREPARED STATEMENTS
// ═══════════════════════════════════════

// Window "pembayaran telat": notif GoBiz untuk QRIS lintas e-wallet bisa nyampe
// jauh setelah batas bayar 5 menit habis. Selama window ini nominal receh-nya
// tidak boleh dipakai transaksi lain, biar pembayaran telat tidak salah cocok.
const LATE_WINDOW_SEC = 60 * 60;

/** Detik → offset modifier SQLite ('-3600 seconds'). */
const sqlOffset = (sec) => `-${Math.max(1, Math.floor(sec))} seconds`;

const stmt = {
    // Products
    insertProduct: db.prepare(`INSERT INTO products (id, name, price, category, description) VALUES (?, ?, ?, ?, ?)`),
    deleteProduct: db.prepare(`DELETE FROM products WHERE id = ?`),
    updateProduct: db.prepare(`UPDATE products SET name = COALESCE(?, name), price = COALESCE(?, price), category = COALESCE(?, category), description = COALESCE(?, description), updated_at = datetime('now', 'localtime') WHERE id = ?`),
    getProduct: db.prepare(`SELECT * FROM products WHERE id = ?`),
    getAllProducts: db.prepare(`SELECT p.*, (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0) as stock_count FROM products p ORDER BY p.category, p.name`),
    getProductsByCategory: db.prepare(`SELECT p.*, (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0) as stock_count FROM products p WHERE p.category = ? ORDER BY p.name`),
    getCategories: db.prepare(`SELECT DISTINCT category FROM products ORDER BY category`),

    // Stock
    insertStock: db.prepare(`INSERT INTO stock (product_id, data) VALUES (?, ?)`),
    getAvailableStock: db.prepare(`SELECT * FROM stock WHERE product_id = ? AND is_sold = 0 ORDER BY id ASC LIMIT ?`),
    getStockCount: db.prepare(`SELECT COUNT(*) as count FROM stock WHERE product_id = ? AND is_sold = 0`),
    getAllStockCounts: db.prepare(`SELECT product_id, COUNT(*) as count FROM stock WHERE is_sold = 0 GROUP BY product_id`),
    markStockSold: db.prepare(`UPDATE stock SET is_sold = 1, sold_at = datetime('now', 'localtime'), sold_to = ?, invoice_id = ? WHERE id = ?`),
    deleteStockByProduct: db.prepare(`DELETE FROM stock WHERE product_id = ? AND is_sold = 0`),
    getStockDetail: db.prepare(`SELECT * FROM stock WHERE product_id = ? AND is_sold = 0 ORDER BY id ASC`),

    // Transactions
    insertTransaction: db.prepare(`INSERT INTO transactions (invoice_id, buyer_jid, product_id, product_name, qty, total_price, payment_method, unique_amount, chat_jid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    getPendingByAmount: db.prepare(`SELECT * FROM transactions WHERE status = 'pending' AND unique_amount = ? ORDER BY created_at ASC LIMIT 1`),
    // Kandidat pembayaran telat: notif merchant (QRIS lintas e-wallet lewat
    // switching) bisa nyampe setelah sweeper nge-cancel invoice-nya. Dibatasi
    // window supaya nominal receh yang sudah dipakai ulang tidak ikut kecocok.
    getCancelledByAmount: db.prepare(`SELECT * FROM transactions WHERE status = 'cancel' AND unique_amount = ? AND created_at >= datetime('now', 'localtime', ?) ORDER BY created_at DESC LIMIT 1`),
    // Sudah di-settle: dipakai buat kenali notif dobel (HP standby suka retry
    // POST yang sama) supaya owner tidak dikabari dua kali utk 1 pembayaran.
    getSettledByAmount: db.prepare(`SELECT * FROM transactions WHERE status IN ('paid', 'process', 'done') AND unique_amount = ? AND created_at >= datetime('now', 'localtime', ?) ORDER BY created_at DESC LIMIT 1`),
    // Nominal yang belum boleh dipakai transaksi baru: masih pending, atau
    // umurnya belum lewat window telat (notifnya bisa nyusul kapan saja).
    countAmountInUse: db.prepare(`SELECT COUNT(*) as count FROM transactions WHERE unique_amount = ? AND (status = 'pending' OR created_at >= datetime('now', 'localtime', ?))`),
    updateTransactionStatus: db.prepare(`UPDATE transactions SET status = ?, updated_at = datetime('now', 'localtime') WHERE invoice_id = ?`),
    completeTransaction: db.prepare(`UPDATE transactions SET status = 'done', stock_data = ?, completed_at = datetime('now', 'localtime'), updated_at = datetime('now', 'localtime') WHERE invoice_id = ?`),
    cancelTransaction: db.prepare(`UPDATE transactions SET status = 'cancel', updated_at = datetime('now', 'localtime') WHERE invoice_id = ?`),
    getTransaction: db.prepare(`SELECT * FROM transactions WHERE invoice_id = ?`),
    getUserTransactions: db.prepare(`SELECT * FROM transactions WHERE buyer_jid = ? ORDER BY created_at DESC LIMIT 20`),
    getPendingTransactions: db.prepare(`SELECT * FROM transactions WHERE status IN ('pending', 'paid', 'process') ORDER BY created_at DESC`),
    // Pending yang sudah lewat batas bayar (dihitung di SQL, jadi tetap akurat
    // walau bot sempat restart dan timer in-memory-nya hilang).
    getExpiredPending: db.prepare(`SELECT * FROM transactions WHERE status = 'pending' AND created_at <= datetime('now', 'localtime', ?) ORDER BY created_at ASC`),
    getAllTransactions: db.prepare(`SELECT * FROM transactions ORDER BY created_at DESC LIMIT 50`),
    countTransactions: db.prepare(`SELECT status, COUNT(*) as count FROM transactions GROUP BY status`),

    // Settings
    getSetting: db.prepare(`SELECT value FROM settings WHERE key = ?`),
    setSetting: db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`),
};

// ═══════════════════════════════════════
// │  STORE DATABASE API
// ═══════════════════════════════════════

export const storeDB = {
    // ─── Products ─────────────────────
    addProduct(id, name, price, category = 'Umum', description = '') {
        try {
            stmt.insertProduct.run(id, name, parseInt(price), category, description);
            return true;
        } catch (e) {
            if (e.message.includes('UNIQUE')) return false;
            throw e;
        }
    },

    deleteProduct(id) {
        const info = stmt.deleteProduct.run(id);
        if (info.changes > 0) {
            stmt.deleteStockByProduct.run(id);
        }
        return info.changes > 0;
    },

    editProduct(id, updates = {}) {
        const product = stmt.getProduct.get(id);
        if (!product) return false;
        stmt.updateProduct.run(
            updates.name || null,
            updates.price ? parseInt(updates.price) : null,
            updates.category || null,
            updates.description || null,
            id
        );
        return true;
    },

    getProduct(id) {
        const product = stmt.getProduct.get(id);
        if (product) {
            product.stock_count = stmt.getStockCount.get(id).count;
        }
        return product;
    },

    getAllProducts() {
        return stmt.getAllProducts.all();
    },

    getProductsByCategory(category) {
        return stmt.getProductsByCategory.all(category);
    },

    getCategories() {
        return stmt.getCategories.all().map(r => r.category);
    },

    // ─── Stock ────────────────────────
    addStock(productId, dataArray) {
        const product = stmt.getProduct.get(productId);
        if (!product) return { success: false, reason: 'product_not_found' };

        const insert = db.transaction((items) => {
            let count = 0;
            for (const item of items) {
                if (item && item.trim()) {
                    stmt.insertStock.run(productId, item.trim());
                    count++;
                }
            }
            return count;
        });

        const added = insert(Array.isArray(dataArray) ? dataArray : [dataArray]);
        return { success: true, added, total: stmt.getStockCount.get(productId).count };
    },

    getStockCount(productId) {
        return stmt.getStockCount.get(productId)?.count || 0;
    },

    getAllStockCounts() {
        return stmt.getAllStockCounts.all();
    },

    getStockDetail(productId) {
        return stmt.getStockDetail.all(productId);
    },

    takeStock(productId, count, buyerJid, invoiceId) {
        const available = stmt.getAvailableStock.all(productId, count);
        if (available.length < count) return null;

        const take = db.transaction((items) => {
            const taken = [];
            for (const item of items) {
                stmt.markStockSold.run(buyerJid, invoiceId, item.id);
                taken.push(item.data);
            }
            return taken;
        });

        return take(available);
    },

    // ─── Transactions ─────────────────
    createTransaction(invoiceId, buyerJid, productId, qty, totalPrice, paymentMethod = 'qris', uniqueAmount = null, chatJid = null) {
        const product = stmt.getProduct.get(productId);
        stmt.insertTransaction.run(invoiceId, buyerJid, productId, product?.name || productId, qty, totalPrice, paymentMethod, uniqueAmount ?? totalPrice, chatJid);
        return stmt.getTransaction.get(invoiceId);
    },

    getPendingByAmount(amount) {
        return stmt.getPendingByAmount.get(amount);
    },

    /**
     * Cari invoice yang sudah di-cancel tapi nominalnya cocok — kandidat
     * pembayaran telat. Sengaja TIDAK auto-settle di pemanggil: uang belum
     * tentu benar masuk, jadi owner yang verifikasi.
     * @param {number} amount
     * @param {number} windowSec batas umur transaksi yang masih dianggap kandidat
     */
    getCancelledByAmount(amount, windowSec = LATE_WINDOW_SEC) {
        return stmt.getCancelledByAmount.get(amount, sqlOffset(windowSec));
    },

    /** Invoice bernominal sama yang sudah di-settle (buat deteksi notif dobel). */
    getSettledByAmount(amount, windowSec = LATE_WINDOW_SEC) {
        return stmt.getSettledByAmount.get(amount, sqlOffset(windowSec));
    },

    /**
     * Nominal masih "dipegang" transaksi lain? Termasuk yang sudah cancel tapi
     * belum lewat window telat, karena notif pembayarannya bisa nyusul dan
     * nanti nyocok ke invoice yang salah.
     */
    isAmountInUse(amount, windowSec = LATE_WINDOW_SEC) {
        return (stmt.countAmountInUse.get(amount, sqlOffset(windowSec))?.count || 0) > 0;
    },

    updateTransactionStatus(invoiceId, status) {
        if (status === 'cancel') {
            stmt.cancelTransaction.run(invoiceId);
        } else {
            stmt.updateTransactionStatus.run(status, invoiceId);
        }
        return stmt.getTransaction.get(invoiceId);
    },

    completeTransaction(invoiceId, stockData) {
        stmt.completeTransaction.run(JSON.stringify(stockData), invoiceId);
        return stmt.getTransaction.get(invoiceId);
    },

    getTransaction(invoiceId) {
        return stmt.getTransaction.get(invoiceId);
    },

    getUserTransactions(buyerJid) {
        return stmt.getUserTransactions.all(buyerJid);
    },

    getPendingTransactions() {
        return stmt.getPendingTransactions.all();
    },

    /**
     * Ambil transaksi pending yang umurnya sudah melewati batas bayar.
     * @param {number} timeoutSec batas bayar dalam detik
     */
    getExpiredPending(timeoutSec = 300) {
        return stmt.getExpiredPending.all(sqlOffset(timeoutSec));
    },

    getAllTransactions() {
        return stmt.getAllTransactions.all();
    },

    getStats() {
        const counts = stmt.countTransactions.all();
        const stats = { total: 0, pending: 0, paid: 0, process: 0, done: 0, cancel: 0 };
        for (const row of counts) {
            stats[row.status] = row.count;
            stats.total += row.count;
        }
        return stats;
    },

    // ─── Settings ─────────────────────
    getSetting(key) {
        return stmt.getSetting.get(key)?.value;
    },

    setSetting(key, value) {
        stmt.setSetting.run(key, String(value));
    },

    // ─── Raw DB access ────────────────
    raw: db,
};

export { LATE_WINDOW_SEC };
export default storeDB;
