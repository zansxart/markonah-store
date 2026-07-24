import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const execPromise = promisify(exec);

// --- SETUP PATH DINAMIS ---
// process.cwd() = folder tempat lu jalanin bot (/root/onah)
const BINARY_PATH = path.join(process.cwd(), 'engine_upscale', 'realesrgan-ncnn-vulkan');

export const upscaleImage = async (inputPath, outputPath, modelName = 'realesrgan-x4plus') => {
    // Cek dulu binary-nya ada ga (buat debugging)
    if (!fs.existsSync(BINARY_PATH)) {
        throw new Error(`Engine Upscale ga ketemu di: ${BINARY_PATH}`);
    }

    if (!fs.existsSync(inputPath)) throw new Error(`Input hilang: ${inputPath}`);
    
    // Command Linux
    const command = `"${BINARY_PATH}" -i "${path.resolve(inputPath)}" -o "${path.resolve(outputPath)}" -n ${modelName}`;
    
    try {
        await execPromise(command);
    } catch (e) {
        throw new Error(`Gagal Exec: ${e.message}`);
    }

    if (!fs.existsSync(outputPath)) throw new Error('Gagal: File output tidak terbentuk.');
    return outputPath;
};
