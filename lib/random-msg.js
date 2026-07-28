import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const msgAtasPath = path.resolve(__dirname, '../storage/json/msgatas.json');
const msgBawahPath = path.resolve(__dirname, '../storage/json/msgbawah.json');

const defaultIntros = {
    menu: [
        "Hai *@user* 🍃\nSelamat datang di layanan otomatis *{botName}*. Kami menyediakan berbagai produk digital, akun premium, serta jasa kebutuhan sosial media terlengkap dengan proses otomatis 24 jam.",
        "Halo *@user* 🍃\nSenang melihatmu di *{botName}*! Siap membantumu bertransaksi produk digital & sosmed dengan cepat dan aman.",
        "Hai *@user* 👋\nSelamat datang di *{botName}*! Tempat terbaik untuk kebutuhan produk digital, akun premium, dan optimasi sosmed 24/7.",
        "Halo kak *@user* 🍃\nSelamat berbelanja di *{botName}*! Layanan otomatis, proses instan, dan stok terupdate setiap hari."
    ],
    katalog: [
        "Silakan pilih kategori produk digital yang kamu inginkan di bawah ini kak (balas angkanya):",
        "Berikut adalah daftar kategori produk digital & akun premium yang ready kak:",
        "Cek berbagai pilihan kategori produk digital unggulan kami di bawah ini ya kak:"
    ],
    saldo: [
        "Berikut adalah rincian informasi saldo akun kamu kak:",
        "Cek status saldo deposit kamu saat ini di bawah ini ya kak:",
        "Informasi akun & sisa saldo deposit kamu saat ini:"
    ],
    topup: [
        "Silakan pilih metode pembayaran topup deposit yang kamu inginkan kak:",
        "Pilihan metode pembayaran isi saldo deposit kamu:"
    ],
    sosmed: [
        "Katalog layanan sosial media terlengkap untuk naikin followers, likes & views kak:",
        "Pilihan platform sosial media terbaik untuk optimasi akun kamu kak:"
    ],
    cektrx: [
        "Berikut adalah rincian detail transaksi invoice kamu kak:",
        "Detail status & informasi pesanan invoice kamu:"
    ],
    riwayat: [
        "Berikut adalah 10 riwayat transaksi belanja kamu terbaru kak:",
        "Daftar riwayat pembelian yang telah kamu lakukan di toko kami:"
    ],
    buy: [
        "Silakan konfirmasi pesanan produk & metode pembayaran kamu kak:",
        "Detail rincian pembelian produk yang akan kamu pesan:"
    ]
};

const defaultFooters = {
    menu: [
        "Mau order yang mana kak? Silakan ketik perintah di atas ya!",
        "Ada yang membuatmu tertarik kak? Langsung ketik perintahnya di atas ya!",
        "Silakan pilih menu di atas ya kak! Kami siap proses secepatnya.",
        "Mau transaksi apa hari ini kak? Ketik perintah di atas untuk mulai!",
        "Siap melayani kebutuhanmu kak! Pilih perintah yang kamu inginkan di atas ya."
    ],
    katalog: [
        "Minat kategori yang mana nih kak? Silakan pilih di atas ya!",
        "Ada produk impianmu kak? Silakan pilih kategori atau langsung order ya!",
        "Stok terupdate setiap hari kak! Pilih kategorinya di atas ya."
    ],
    saldo: [
        "Mau isi saldo deposit kak? Ketik *.topup <nominal>* ya!",
        "Butuh tambah saldo? Ketik *.topup <nominal>* untuk isi deposit secepatnya!",
        "Pastikan saldomu cukup sebelum bertransaksi ya kak!"
    ],
    topup: [
        "Pilihan berlaku 5 menit ya kak. Ketik *batal* jika ingin membatalkan.",
        "Silakan balas angka metodenya kak. Ketik *batal* untuk membatalkan."
    ],
    sosmed: [
        "Mau optimasi sosmed yang mana nih kak? Pilih platformnya di atas ya!",
        "Siap melesatkan sosmed kamu kak! Pilih platformnya di atas ya!",
        "Tertarik dengan layanan sosmed kami? Langsung pesan kak!"
    ],
    cektrx: [
        "Terima kasih banyak sudah bertransaksi di toko kami kak!",
        "Ada kendala transaksi? Hubungi owner via *.owner* ya kak!",
        "Terima kasih telah mempercayakan kebutuhan digitalmu pada kami kak!"
    ],
    riwayat: [
        "Yuk transaksi lagi kak! Banyak produk menarik & stok ready yang menantimu.",
        "Terima kasih sudah langganan berbelanja di toko kami kak!",
        "Yuk borong lagi produk favoritmu kak!"
    ],
    buy: [
        "Pilihan berlaku 5 menit kak. Ketik *batal* untuk membatalkan.",
        "Pastikan detail pesanan sudah sesuai sebelum konfirmasi ya kak!"
    ]
};

function loadJson(filePath, defaultObj) {
    try {
        if (!fs.existsSync(filePath)) {
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(filePath, JSON.stringify(defaultObj, null, 2), 'utf-8');
            return defaultObj;
        }
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
        return defaultObj;
    }
}

/**
 * Ambil kalimat pembuka acak sesuai fitur (menu, katalog, saldo, topup, sosmed, cektrx, riwayat, buy)
 */
export function getRandomIntro(featureKey = 'menu', user = '', botName = 'MARKONAH STORE') {
    const data = loadJson(msgAtasPath, defaultIntros);
    const list = data[featureKey] || data['menu'] || defaultIntros.menu;
    const template = list[Math.floor(Math.random() * list.length)];
    return template.replace(/\{user\}|@user/g, user).replace(/\{botName\}/g, botName);
}

/**
 * Ambil kalimat penutup acak sesuai fitur (menu, katalog, saldo, topup, sosmed, cektrx, riwayat, buy)
 */
export function getRandomFooter(featureKey = 'menu') {
    const data = loadJson(msgBawahPath, defaultFooters);
    const list = data[featureKey] || data['menu'] || defaultFooters.menu;
    const text = list[Math.floor(Math.random() * list.length)];
    return `_${text}_`;
}
