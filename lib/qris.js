/**
 * @credit zansxart
 * Instagram: https://instagram.com/zansxart
 */

/**
 * QRIS Dynamic Amount (Dabis) Generator
 * Mengubah string QRIS statis menjadi QRIS dinamis dengan nominal tertentu
 */

export function convertCRC16(data) {
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
        crc ^= data.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            if ((crc & 0x8000) !== 0) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc <<= 1;
            }
        }
        crc &= 0xFFFF;
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function createQRIS(qrisData, paymentAmount) {
    try {
        // Hapus CRC lama (4 char terakhir)
        qrisData = qrisData.slice(0, -4);

        // Ubah dari static (010211) ke dynamic (010212)
        const modifiedData = qrisData.replace("010211", "010212");

        // Split berdasarkan country code Indonesia
        const splitData = modifiedData.split("5802ID");
        if (splitData.length !== 2) {
            throw new Error("Invalid QRIS data format");
        }

        // Inject field 54 (Transaction Amount)
        const amountStr = paymentAmount.toString();
        const formattedAmount = "54" + ("0" + amountStr.length).slice(-2) + amountStr;
        const finalData = splitData[0] + formattedAmount + "5802ID" + splitData[1];

        // Hitung CRC16 baru & append
        return finalData + convertCRC16(finalData);
    } catch (error) {
        console.error("Error creating QRIS:", error.message);
        throw error;
    }
}
