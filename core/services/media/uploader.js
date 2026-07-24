import fetch from 'node-fetch';
import { FormData, Blob } from 'formdata-node';
import formData from 'form-data';
import { fileTypeFromBuffer } from 'file-type';
import axios from 'axios';
import crypto from 'crypto';
const randomBytes = crypto.randomBytes(5).toString('hex');

async function uploadFile(buffer) {
  const { ext, mime } = await fileTypeFromBuffer(buffer) || {};
  const form = new FormData();
  const blob = new Blob([buffer.toArrayBuffer()], { type: mime });
  form.append('file', blob, 'tmp.' + ext);
  const res = await fetch('https://file.io/?expires=1d', {
    method: 'POST',
    body: form,
  });
  const json = await res.json();
  if (!json.success) throw json;
  return json.link;
}

async function qu(buffer) {
  const { ext, mime } = await fileTypeFromBuffer(buffer);
  const form = new formData();
  form.append('files[]', buffer, {
    filename: new Date() * 1 + '.' + ext,
    contentType: mime,
  });
  form.append("file-expiry", "-1");
  const { data } = await axios.post('https://qu.ax/upload.php', form, {
    headers: { 
  "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36",
  "Referer": "https://qu.ax/",
  ...form.getHeaders() },
  });
  return data
  }
  
async function tmpFiles(buffer) {
  const { ext, mime } = await fileTypeFromBuffer(buffer);
  const form = new formData();
  form.append('file', buffer, {
    filename: new Date() * 1 + '.' + ext,
    contentType: mime,
  });
  const { data } = await axios.post('https://tmpfiles.org/api/v1/upload', form, {
    headers: { ...form.getHeaders() },
  });
  const result = data.data.url.split('org')[1];
  return `https://tmpfiles.org/dl${result}`;
}

async function uploadImage(buffer) {
  const { ext, mime } = await fileTypeFromBuffer(buffer);
  const form = new FormData();
  const blob = new Blob([buffer.toArrayBuffer()], { type: mime });
  form.append('file', blob, 'tmp.' + ext);
  const res = await fetch('https://telegra.ph/upload', {
    method: 'POST',
    body: form,
  });
  const img = await res.json();
  if (img.error) throw img.error;
  return 'https://telegra.ph' + img[0].src;
}

async function pomf(buffer) {
  const { ext, mime } = await fileTypeFromBuffer(buffer);
  const form = new FormData();
  const blob = new Blob([buffer.toArrayBuffer()], { type: mime });
  form.append('files[]', blob, 'tmp.' + ext);
  const res = await fetch('https://pomf2.lain.la/upload.php', {
    method: 'POST',
    body: form,
  });
  const img = await res.json();
  if (img.error) throw img.error;
  return img;
};

async function media(buffer) {
  const { ext, mime } = await fileTypeFromBuffer(buffer);
  const form = new FormData();
  const blob = new Blob([buffer.toArrayBuffer()], { type: mime });
  form.append('files[]', blob, 'tmp.' + ext);
  const res = await fetch('https://media-upload.net/php/ajax_upload_file.php', {
    method: 'POST',
    body: form,
  });
  const files = await res.json();
  return files.files[0]?.fileUrl;
}

async function uploadVideo(buffer) {
  const { ext, mime } = await fileTypeFromBuffer(buffer);
  const form = new FormData();
  const blob = new Blob([buffer.toArrayBuffer()], { type: mime });
  form.append('file', blob, 'tmp.' + ext);
  const res = await fetch('https://videy.co/api/upload', {
    method: 'POST',
    body: form,
  });
  const vid = await res.json();
  if (!vid) throw 'error';
  return {
    cdn: 'https://cdn.videy.co/' + vid.id + '.mp4',
    ori: 'https://videy.co/v?id=' + vid.id,
  };
}

async function cdnTixo(buffer) {
  const { ext, mime } = await fileTypeFromBuffer(buffer);
  const form = new FormData();
  const blob = new Blob([buffer.toArrayBuffer()], { type: mime });
  form.append('file', blob, 'tmp.' + ext);
  const res = await fetch('https://cdn.xteam.biz.id/api/upload', {
    method: 'POST',
    body: form,
  });
  const img = await res.json();
  return img;
}

async function catbox(buffer) {
  const { ext } = await fileTypeFromBuffer(buffer);
  const bodyForm = new formData();
  bodyForm.append('fileToUpload', buffer, 'file.' + ext);
  bodyForm.append('reqtype', 'fileupload');

  const res = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    body: bodyForm,
  });
  const data = await res.text();
  return data;
}

async function cdncare(buffer) {
  try {
    const { ext, mime } = await fileTypeFromBuffer(buffer);
    const form = new FormData();
    const blob = new Blob([buffer.toArrayBuffer()], { type: mime });
    const formData = new FormData();
    formData.append('file', blob, `${randomBytes}.${ext}`);
    formData.append('UPLOADCARE_PUB_KEY', 'demopublickey');
    formData.append('UPLOADCARE_STORE', '1');
    const response = await fetch('https://upload.uploadcare.com/base/', {
      method: 'POST',
      body: formData,
    });
    const { file } = await response.json();
    return `https://ucarecdn.com/${file}/${randomBytes}.${ext}`;
  } catch (error) {
    throw error;
    console.log(error)
  }
};

async function puticu(buffer) {
    try {
      const response = await fetch("https://put.icu/upload/", {
        method: "PUT",
        body: buffer,
        headers: {
          "User-Agent": fakeUserAgent(),
          Accept: "application/json"
        }
      });
      const files = await response.json();
      return files.direct_url
    } catch (error) {
      console.error("Error uploading file:", error);
      throw new Error(String(error));
    }
  };

export {
  uploadFile,
  tmpFiles,
  uploadImage,
  pomf,
  uploadVideo,
  cdnTixo,
  catbox,
  cdncare,
  puticu,
  media,
  qu
};
