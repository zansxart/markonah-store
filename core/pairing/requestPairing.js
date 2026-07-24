/**
 * @credit zansxart
 * tiktok: https://tiktok.com/zansxart
 * Instagram: https://instagram.com/zansxart
 */

import fetch from 'node-fetch'
import chalk from 'chalk'
import {
  animateProgress,
  formatCodeGroups,
  gradientText,
  renderKeyValueRows,
  renderPanel,
  showHeroBanner,
  statusLine,
  terminalTheme,
  typeText,
  wait,
} from '../services/system/terminal-ui.js'

// Pairing whitelist verification and code request flow.

const LICENSE_SOURCES = [
  {
    name: 'raw-github',
    type: 'json',
    url: 'https://raw.githubusercontent.com/zansxart/db-markonah/main/users.json'
  },
  {
    name: 'github-api',
    type: 'github-content',
    url: 'https://api.github.com/repos/zansxart/db-markonah/contents/users.json?ref=main'
  }
]

const DEFAULT_LICENSE_POLL_INTERVAL_MS = 15000
const DEFAULT_LICENSE_MAX_WAIT_MS = 0
const DEFAULT_LICENSE_API_FALLBACK_EVERY = 4

function normalizePhoneNumber(value) {
  return String(value ?? '').replace(/[^0-9]/g, '')
}

function getErrorStatusCode(error) {
  return error?.output?.statusCode || error?.output?.payload?.statusCode || error?.data || 0
}

function isRetryablePairingSocketError(error) {
  const message = String(error?.message || error || '')
  return Number(getErrorStatusCode(error)) === 428 || /Connection Closed/i.test(message)
}

function getLicensePollingConfig() {
  const pollMs = Number(global.config?.pairingLicensePollMs)
  const maxWaitMs = Number(global.config?.pairingLicenseMaxWaitMs)
  const apiFallbackEvery = Number(global.config?.pairingLicenseApiFallbackEvery)

  return {
    pollMs: Number.isFinite(pollMs) && pollMs >= 3000 ? pollMs : DEFAULT_LICENSE_POLL_INTERVAL_MS,
    maxWaitMs: Number.isFinite(maxWaitMs) && maxWaitMs > 0 ? maxWaitMs : DEFAULT_LICENSE_MAX_WAIT_MS,
    apiFallbackEvery: Number.isFinite(apiFallbackEvery) && apiFallbackEvery > 0 ? apiFallbackEvery : DEFAULT_LICENSE_API_FALLBACK_EVERY
  }
}

function normalizeUsers(payload) {
  const items = Array.isArray(payload) ? payload : []
  const users = new Set()

  for (const item of items) {
    if (item == null) continue

    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'bigint') {
      const normalized = normalizePhoneNumber(item)
      if (normalized) users.add(normalized)
      continue
    }

    if (typeof item === 'object') {
      const candidate =
        item.number ??
        item.phone ??
        item.phoneNumber ??
        item.msisdn ??
        item.jid ??
        item.id

      const normalized = normalizePhoneNumber(candidate)
      if (normalized) users.add(normalized)
    }
  }

  return [...users]
}

async function parseLicenseResponse(response, sourceType) {
  if (sourceType === 'github-content') {
    const body = await response.json()
    if (typeof body?.content !== 'string') throw new Error('ERR_DB_FORMAT')

    const decoded = Buffer.from(body.content.replace(/\n/g, ''), 'base64').toString('utf8')
    return decoded.trim() === '' ? [] : JSON.parse(decoded)
  }

  const text = await response.text()
  return text.trim() === '' ? [] : JSON.parse(text)
}

export async function fetchLicenseUsers(options = {}) {
  const {
    includeApiFallback = true,
    cycles = 1,
    cycleDelayMs = 1500
  } = options

  const activeSources = includeApiFallback
    ? LICENSE_SOURCES
    : LICENSE_SOURCES.filter(source => source.name !== 'github-api')

  let lastError = null

  for (let cycle = 0; cycle < cycles; cycle++) {
    const collectedUsers = new Set()
    const successfulSources = []

    for (const source of activeSources) {
      try {
        const requestUrl = new URL(source.url)
        requestUrl.searchParams.set('_', `${Date.now()}-${cycle}`)

        const response = await fetch(requestUrl, {
          headers: {
            'cache-control': 'no-cache, no-store, max-age=0',
            pragma: 'no-cache',
            expires: '0',
            accept: 'application/json, text/plain, */*',
            'user-agent': 'markonah-md-license-check'
          }
        })

        if (!response.ok) throw new Error(`HTTP_${response.status}`)

        const payload = await parseLicenseResponse(response, source.type)
        const users = normalizeUsers(payload)

        successfulSources.push(source.name)
        for (const user of users) {
          collectedUsers.add(user)
        }
      } catch (error) {
        lastError = error
      }
    }

    if (successfulSources.length > 0) {
      return {
        users: [...collectedUsers],
        source: successfulSources.join('+'),
        attempts: cycle + 1
      }
    }

    await wait(cycleDelayMs)
  }

  throw lastError || new Error('ERR_DB')
}

async function waitForLicenseAccess(normalizedPhone) {
  const { pollMs, maxWaitMs, apiFallbackEvery } = getLicensePollingConfig()
  const startedAt = Date.now()
  let checks = 0
  let pendingShown = false
  let lastKnownState = null
  let lastError = null

  while (true) {
    checks += 1
    const includeApiFallback = checks === 1 || checks % apiFallbackEvery === 0

    try {
      const result = await fetchLicenseUsers({
        includeApiFallback,
        cycles: includeApiFallback ? 2 : 1,
        cycleDelayMs: 800
      })

      const allowed = result.users.includes(normalizedPhone)
      if (allowed) {
        return {
          ...result,
          waitedMs: Date.now() - startedAt,
          checks
        }
      }

      lastKnownState = result
      if (!pendingShown) {
        console.log()
        console.log(renderPanel({
          eyebrow: 'License Sync Pending',
          title: 'Waiting for whitelist propagation',
          subtitle: `Nomor +${normalizedPhone} belum muncul di registry.`,
          lines: [
            renderKeyValueRows({
              Interval: `${Math.round(pollMs / 1000)} detik`,
              Mode: includeApiFallback ? 'Raw + GitHub API fallback' : 'Raw source only',
            }, {
              keyWidth: 8,
              keyColor: terminalTheme.muted,
              valueColor: terminalTheme.text,
            }),
            '',
            statusLine('info', 'Bot akan recheck otomatis tanpa perlu restart manual.'),
            statusLine('warning', 'Begitu nomor masuk registry, pairing dilanjutkan otomatis.'),
          ],
          accent: terminalTheme.amber,
          backgroundColor: '#1A1600',
          margin: { top: 0, bottom: 1, left: 1, right: 1 },
        }))
        pendingShown = true
      } else if (checks % 3 === 0) {
        console.log(statusLine('info', `Nomor belum sinkron. Recheck ${Math.round(pollMs / 1000)} detik lagi...`))
      }
    } catch (error) {
      lastError = error
      if (!pendingShown) {
        console.log(statusLine('info', 'Server lisensi belum memberi data valid. Retry otomatis aktif.'))
        pendingShown = true
      } else if (checks % 3 === 0) {
        console.log(statusLine('warning', `Fetch lisensi gagal (${error.message}). Retry ${Math.round(pollMs / 1000)} detik lagi...`))
      }
    }

    if (maxWaitMs > 0 && Date.now() - startedAt >= maxWaitMs) {
      const timeoutError = new Error('PAIRING_LICENSE_TIMEOUT')
      timeoutError.lastState = lastKnownState
      timeoutError.cause = lastError
      throw timeoutError
    }

    await wait(pollMs)
  }
}

/**
 * Verifikasi lisensi dan request pairing code
 * @param {import('@zansxart/baileys').WASocket} conn
 * @param {string} phoneNumber
 * @param {string} pairingCode
 * @param {import('spinnies')} spinnies
 */
export default async function requestPairing(conn, phoneNumber, pairingCode, spinnies) {
  const normalizedPhone = normalizePhoneNumber(phoneNumber)

  // Stop spinner sementara, kita pakai animasi custom
  spinnies.update('pairing', { text: '' })

  console.clear()
  console.log()

  showHeroBanner({
    title: global.info?.nameBot || 'ONAH',
    font: 'block',
    colors: [terminalTheme.amber, terminalTheme.mint, terminalTheme.sky],
    subtitle: 'Secure Pairing Portal',
    byline: `license gate for +${normalizedPhone}`,
    accent: terminalTheme.mint,
  })

  console.log(renderPanel({
    eyebrow: 'Pairing Session',
    title: gradientText('DEVICE LINK REQUEST', [
      terminalTheme.amber,
      terminalTheme.mint,
      terminalTheme.sky,
    ]),
    subtitle: 'Clean startup visuals with the original pairing logic intact.',
    lines: [
      renderKeyValueRows({
        Target: `+${normalizedPhone}`,
        License: 'Remote whitelist sync',
        Flow: 'Link with phone number',
      }, {
        keyWidth: 8,
        keyColor: terminalTheme.muted,
        valueColor: terminalTheme.text,
      }),
    ],
    accent: terminalTheme.mint,
    backgroundColor: terminalTheme.panelAlt,
    margin: { top: 0, bottom: 1, left: 1, right: 1 },
  }))

  console.log(statusLine('info', 'Initializing secure bridge to the license registry...'))
  await wait(250)

  await animateProgress('connecting registry', {
    duration: 900,
    width: 28,
    accent: terminalTheme.sky,
    glow: terminalTheme.amber,
  })
  console.log(statusLine('success', 'Secure channel to license server established.'))
  await wait(180)

  try {
    console.log(statusLine('info', `Verifying entitlement for +${normalizedPhone}...`))
    await animateProgress('syncing whitelist', {
      duration: 1150,
      width: 28,
      accent: terminalTheme.mint,
      glow: terminalTheme.amber,
    })

    const { users, source, attempts } = await fetchLicenseUsers({
      includeApiFallback: true,
      cycles: 2,
      cycleDelayMs: 800
    })

    console.log(renderPanel({
      eyebrow: 'License Registry',
      title: 'Registry synchronized',
      subtitle: `Source chain: ${source}`,
      lines: [
        renderKeyValueRows({
          Attempts: String(attempts),
          Records: String(users.length),
          Target: `+${normalizedPhone}`,
        }, {
          keyWidth: 8,
          keyColor: terminalTheme.muted,
          valueColor: terminalTheme.text,
        }),
      ],
      accent: terminalTheme.sky,
      backgroundColor: terminalTheme.panelAlt,
      margin: { top: 0, bottom: 1, left: 1, right: 1 },
    }))
    await wait(180)

    await animateProgress('checking entitlement', {
      duration: 760,
      width: 24,
      accent: terminalTheme.mint,
      glow: terminalTheme.amber,
    })

    let verifiedSource = source
    let verifiedAttempts = attempts

    if (!users.includes(normalizedPhone)) {
      const waited = await waitForLicenseAccess(normalizedPhone)
      verifiedSource = waited.source
      verifiedAttempts = waited.checks

      console.log(statusLine('success', `Nomor +${normalizedPhone} akhirnya terdeteksi di registry lisensi.`))
      console.log(statusLine('info', `Sync chain: ${verifiedSource} • total checks ${verifiedAttempts}`))
      await wait(180)
    }

    console.log(statusLine('success', 'License validation passed. Pairing access unlocked.'))
    console.log()
    await wait(240)

    console.log(statusLine('info', 'Generating pairing code...'))
    await animateProgress('minting code', {
      duration: 1320,
      width: 30,
      accent: terminalTheme.mint,
      glow: terminalTheme.amber,
    })

    const code = await conn.requestPairingCode(normalizedPhone)
    const formattedCode = formatCodeGroups(code, 4, ' - ')

    console.log()

    console.log(renderPanel({
      eyebrow: 'Pairing Access Granted',
      title: gradientText('PAIRING CODE', [
        terminalTheme.mint,
        terminalTheme.sky,
        terminalTheme.amber,
      ]),
      subtitle: chalk.hex(terminalTheme.text).bold(formattedCode),
      lines: [
        renderKeyValueRows({
          Number: `+${normalizedPhone}`,
          Source: verifiedSource,
          Checks: String(verifiedAttempts),
        }, {
          keyWidth: 7,
          keyColor: terminalTheme.muted,
          valueColor: terminalTheme.text,
        }),
        '',
        statusLine('info', 'Open WhatsApp > Linked Devices > Link with phone number.'),
        statusLine('success', 'Masukkan kode persis seperti yang tampil di atas.'),
      ],
      footer: 'Kalau kode expired, jalankan pairing ulang untuk membuat kode baru.',
      accent: terminalTheme.mint,
      borderStyle: 'double',
      backgroundColor: '#001A1A',
      margin: { top: 0, bottom: 1, left: 1, right: 1 },
    }))
    await typeText(chalk.hex(terminalTheme.dim)('  secure relay complete'), { charDelay: 7 })
    console.log()

    spinnies.succeed('pairing', {
      text: `Lisensi Valid! Pairing Code: ${chalk.white(formattedCode)}`,
      successColor: 'greenBright'
    })

    return true

  } catch (error) {
    if (isRetryablePairingSocketError(error)) {
      console.log()
      console.log(statusLine('warning', 'Socket pairing tertutup, menunggu reconnect sebelum retry...'))
      spinnies.update('pairing', {
        text: 'Socket pairing tertutup, menunggu reconnect...',
        color: 'yellow'
      })
      throw error
    }

    console.log()

    if (
      error.message === 'ERR_DB' ||
      error.message === 'ERR_DB_FORMAT' ||
      error.message === 'EMPTY_LICENSE_DB' ||
      error.message === 'PAIRING_LICENSE_TIMEOUT' ||
      error.message?.startsWith('HTTP_')
    ) {
      console.log(statusLine('error', 'Gagal menghubungi server lisensi.'))

      console.log(renderPanel({
        eyebrow: 'Connection Error',
        title: 'License registry unavailable',
        subtitle: 'Tidak dapat menyinkronkan whitelist dari server lisensi.',
        lines: [
          statusLine('warning', 'Periksa koneksi internet, rate limit, atau status GitHub source.'),
          statusLine('info', 'Bot akan tetap aman, tapi pairing belum bisa dilanjutkan sekarang.'),
        ],
        accent: terminalTheme.rose,
        backgroundColor: '#1B1114',
        margin: { top: 0, bottom: 1, left: 1, right: 1 },
      }))

      spinnies.fail('pairing', {
        text: '[ERROR] Gagal menghubungi server lisensi.',
        failColor: 'red'
      })
    } else {
      console.log(statusLine('error', 'Sistem gagal memproses pairing code.'))

      console.log(renderPanel({
        eyebrow: 'System Error',
        title: 'Pairing pipeline failed',
        subtitle: error.message || 'Unknown error',
        lines: [
          statusLine('warning', 'Periksa session, koneksi, atau payload pairing code yang dipakai.'),
        ],
        accent: terminalTheme.rose,
        backgroundColor: '#1B1114',
        margin: { top: 0, bottom: 1, left: 1, right: 1 },
      }))
      console.error(error)

      spinnies.fail('pairing', {
        text: '[ERROR] Sistem gagal memproses pairing code.',
        failColor: 'red'
      })
    }

    return false
  }
}
