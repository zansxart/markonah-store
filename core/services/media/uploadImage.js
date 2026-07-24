/***
* tiktok: https://tiktok.com/zansart
* Instagram: https://instagram.com/_zansart
***/

/***
* tiktok: https://tiktok.com/zansart
* Instagram: https://instagram.com/_zansart
***/

import fetch from 'node-fetch';
import { FormData, Blob } from 'formdata-node';
import { fileTypeFromBuffer } from 'file-type';

/**
 * Upload image to Catbox
 * Supported mimetype:
 * - `image/jpeg`
 * - `image/jpg`
 * - `image/png`
 * @param {Buffer} buffer Image Buffer
 * @return {Promise<string>}
 */
export default async buffer => {
  const { ext, mime } = await fileTypeFromBuffer(buffer);
  const blob = new Blob([buffer], { type: mime });
  let form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', blob, 'tmp.' + ext);
  
  let res = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    body: form,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36',
    },
  });
  
  let textResponse = await res.text();
  if (!res.ok) throw new Error(`Error: ${textResponse}`);
  
  return textResponse.trim();
};