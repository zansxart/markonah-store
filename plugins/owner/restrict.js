/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 *
 * Cek status restriksi akun WhatsApp (reachout timelock + limit chat baru).
 * Muncul saat kiriman ke nomor tertentu ditolak server dengan error 463.
 */
const formatDate = (d) => {
    if (!d) return '-'
    return new Date(d).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) + ' WIB'
}

const formatDurasi = (ms) => {
    if (ms <= 0) return 'sebentar lagi'
    const h = Math.floor(ms / 3600000)
    const m = Math.floor((ms % 3600000) / 60000)
    if (h >= 24) return `${Math.floor(h / 24)} hari ${h % 24} jam`
    if (h > 0) return `${h} jam ${m} menit`
    return `${m} menit`
}

let zansxart = async (m, { conn }) => {
    if (typeof conn.fetchAccountReachoutTimelock !== 'function') {
        return m.reply('Fitur ini butuh versi baileys yang mendukung fetchAccountReachoutTimelock.')
    }

    await m.reply('Mengecek status restriksi akun...')

    let lock = null
    let cap = null
    try {
        lock = await conn.fetchAccountReachoutTimelock()
    } catch (e) {
        return m.reply(`Gagal cek restriksi: ${e?.message || e}`)
    }
    try {
        cap = await conn.fetchNewChatMessageCap?.()
    } catch (e) { }

    let teks = '*STATUS RESTRIKSI AKUN*\n\n'

    if (lock?.isActive) {
        teks += '🔴 *Akun sedang DIRESTRIKSI*\n'
        teks += 'Chat ke nomor yang belum pernah terhubung (belum punya trust token) akan ditolak server (error 463).\n\n'
        teks += `*Jenis:* ${lock.enforcementType || 'DEFAULT'}\n`
        if (lock.timeEnforcementEnds) {
            const sisa = new Date(lock.timeEnforcementEnds).getTime() - Date.now()
            teks += `*Berakhir:* ${formatDate(lock.timeEnforcementEnds)}\n`
            teks += `*Sisa waktu:* ${formatDurasi(sisa)}\n`
        } else {
            teks += '*Berakhir:* tidak disebutkan server (bisa permanen sampai ditinjau)\n'
        }
        teks += '\n_Saran: kurangi broadcast/pesan massal, dan ajukan banding lewat WhatsApp di HP (Setelan > Bantuan) bila ada banner._'
    } else {
        teks += '🟢 *Tidak ada restriksi reachout aktif*\n'
        teks += 'Kalau masih ada kontak yang kena 463, berarti tinggal menunggu trust token kontak itu terbit ulang.'
    }

    if (cap && typeof cap === 'object') {
        const status = cap.status || cap.capping_status || null
        const quota = cap.quota ?? cap.limit ?? null
        const usage = cap.usage ?? cap.used ?? null
        if (status || quota !== null) {
            teks += '\n\n*LIMIT CHAT BARU*\n'
            if (status) teks += `*Status:* ${status}\n`
            if (quota !== null) teks += `*Kuota:* ${usage ?? '?'} / ${quota}\n`
        }
    }

    await m.reply(teks.trim())
}

zansxart.help = ['restrict', 'cekbanned']
zansxart.tags = ['owner']
zansxart.command = /^(restrict|cekrestrict|cekbanned|banned\?)$/i
zansxart.rowner = true

export default zansxart
