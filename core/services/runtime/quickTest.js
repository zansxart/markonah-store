import { spawn } from 'child_process'

function safeSpawn(command, args = []) {
  try {
    return spawn(command, args)
  } catch {
    return null
  }
}

export async function quickTest() {
  const test = await Promise.all([
    safeSpawn('ffmpeg'),
    safeSpawn('ffprobe'),
    safeSpawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-filter_complex', 'color', '-frames:v', '1', '-f', 'webp', '-']),
    safeSpawn('convert'),
    safeSpawn('magick'),
    safeSpawn('gm'),
    safeSpawn('find', ['--version']),
  ].map((p) => {
    if (!p) return Promise.resolve(false)
    return Promise.race([
      new Promise((resolve) => {
        p.on('close', (code) => {
          resolve(code !== 127)
        })
      }),
      new Promise((resolve) => {
        p.on('error', (_) => resolve(false))
      })
    ])
  }))
  const [ffmpeg, ffprobe, ffmpegWebp, convert, magick, gm, find] = test
  const s = global.support = {
    ffmpeg,
    ffprobe,
    ffmpegWebp,
    convert,
    magick,
    gm,
    find
  }
  Object.freeze(global.support)
}
