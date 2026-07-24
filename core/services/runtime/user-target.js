import { areJidsSameUser } from '@zansxart/baileys'

const USER_RECORD_DEFAULTS = Object.freeze({
    name: '',
    premium: false,
    premiumTime: 0,
    owner: false,
    ownerTime: 0,
    registered: false,
    banned: false,
    level: 0,
    limit: 0,
    money: 0,
})

const toDigits = (value = '') => String(value).replace(/\D/g, '')

const normalizePhoneDigits = (value = '') => {
    const digits = toDigits(value)
    if (!digits) return ''
    return digits.startsWith('0') ? `62${digits.slice(1)}` : digits
}

export const toUserJid = (value = '') => {
    const digits = normalizePhoneDigits(value)
    return digits ? `${digits}@s.whatsapp.net` : null
}

export const isGroupJid = (value = '') => String(value || '').trim().endsWith('@g.us')

export const isUserJid = (value = '') => /@(s\.whatsapp\.net|lid|pn)$/i.test(String(value || '').trim())

const pushOrderedJid = (list, value) => {
    const raw = String(value || '').trim()
    if (!raw || isGroupJid(raw) || !isUserJid(raw) || list.includes(raw)) return
    list.push(raw)
}

const buildJidCandidates = (conn, value, extraValues = []) => {
    const candidates = new Set()

    const pushCandidate = (input) => {
        if (input === null || input === undefined) return

        const raw = String(input).trim()
        if (!raw) return

        candidates.add(raw)

        const decoded = conn?.decodeJid ? conn.decodeJid(raw) : raw
        if (decoded) candidates.add(decoded)

        const digits = toDigits(decoded || raw)
        if (!digits) return

        candidates.add(digits)
        candidates.add(`${digits}@s.whatsapp.net`)
        candidates.add(`${digits}@lid`)
        candidates.add(`${digits}@pn`)

        const phoneJid = toUserJid(digits)
        if (phoneJid) candidates.add(phoneJid)
    }

    pushCandidate(value)
    for (const extraValue of extraValues) pushCandidate(extraValue)

    return candidates
}

const buildActionJids = (conn, value, extraValues = []) => {
    const actionJids = []

    const pushValue = (input) => {
        if (input === null || input === undefined) return

        const raw = String(input).trim()
        if (!raw) return

        pushOrderedJid(actionJids, raw)

        const decoded = conn?.decodeJid ? conn.decodeJid(raw) : raw
        pushOrderedJid(actionJids, decoded)

        const digits = toDigits(decoded || raw)
        if (!digits) return

        pushOrderedJid(actionJids, `${digits}@s.whatsapp.net`)
        pushOrderedJid(actionJids, `${digits}@lid`)
        pushOrderedJid(actionJids, `${digits}@pn`)
    }

    pushValue(value)
    for (const extraValue of extraValues) pushValue(extraValue)

    return actionJids
}

const pickParticipantJid = (conn, participant = {}) => {
    const phoneJid = toUserJid(participant?.phoneNumber || participant?.pn)
    if (phoneJid) return phoneJid

    const participantId = participant?.id || participant?.jid || participant?.lid
    if (!participantId) return null

    const decoded = conn?.decodeJid ? conn.decodeJid(participantId) : participantId
    if (!decoded || isGroupJid(decoded)) return null

    return decoded
}

export function findParticipantByJid(conn, value, participants = []) {
    if (!Array.isArray(participants) || !participants.length) return null

    const normalized = normalizeUserJid(conn, value, participants)
    const targetCandidates = buildJidCandidates(conn, value, [normalized])

    return participants.find((participant) => {
        const participantCandidates = buildJidCandidates(conn, participant?.id || participant?.jid || participant?.lid, [
            participant?.id,
            participant?.jid,
            participant?.lid,
            participant?.phoneNumber,
            participant?.pn,
        ])

        for (const candidate of targetCandidates) {
            if (participantCandidates.has(candidate)) return true
        }

        const participantJid = pickParticipantJid(conn, participant)
        return participantJid && normalized ? areJidsSameUser(participantJid, normalized) : false
    }) || null
}

export function getParticipantActionJid(conn, participant = {}) {
    const participantId = participant?.id || participant?.jid || participant?.lid
    if (participantId) {
        const decoded = conn?.decodeJid ? conn.decodeJid(participantId) : participantId
        if (decoded && !isGroupJid(decoded)) return decoded
    }

    return pickParticipantJid(conn, participant)
}

export function getParticipantActionJids(conn, participant = {}, extraValues = []) {
    const phoneJid = toUserJid(participant?.phoneNumber || participant?.pn)
    return buildActionJids(conn, participant?.id || participant?.jid || participant?.lid || phoneJid, [
        participant?.id,
        participant?.jid,
        participant?.lid,
        participant?.phoneNumber,
        participant?.pn,
        phoneJid,
        ...extraValues,
    ])
}

export function resolveGroupTarget(conn, value, participants = []) {
    const participant = findParticipantByJid(conn, value, participants)
    const mentionJid = participant ? pickParticipantJid(conn, participant) : normalizeUserJid(conn, value, participants)
    const actionJids = participant
        ? getParticipantActionJids(conn, participant, [value, mentionJid])
        : buildActionJids(conn, mentionJid || value, [value])
    const jid = actionJids[0] || (participant ? getParticipantActionJid(conn, participant) : mentionJid)

    if (!jid) return null

    return {
        participant,
        actionJids,
        jid,
        mentionJid: mentionJid || jid,
    }
}

const isSuccessfulGroupUpdateResult = (result) => {
    if (!Array.isArray(result) || !result.length) return true

    return result.every((entry) => {
        const status = Number(entry?.status)
        if (Number.isFinite(status)) return status >= 200 && status < 300
        return /^2/.test(String(entry?.status || '200'))
    })
}

export async function applyGroupParticipantAction(conn, chatId, value, action, participants = []) {
    let currentParticipants = Array.isArray(participants) ? participants : []
    let resolved = resolveGroupTarget(conn, value, currentParticipants)

    if ((!resolved?.participant || !resolved?.actionJids?.length) && isGroupJid(chatId)) {
        try {
            currentParticipants = (await conn.groupMetadata(chatId))?.participants || currentParticipants
            resolved = resolveGroupTarget(conn, value, currentParticipants)
        } catch {}
    }

    const mentionJid = resolved?.mentionJid || normalizeUserJid(conn, value, currentParticipants) || value
    const actionJids = [
        ...(resolved?.actionJids || []),
        ...buildActionJids(conn, mentionJid, [value]),
    ].filter((jid, index, list) => isUserJid(jid) && list.indexOf(jid) === index)

    let lastError = null
    let lastResult = null

    for (const jid of actionJids) {
        try {
            const result = await conn.groupParticipantsUpdate(chatId, [jid], action)
            lastResult = result
            if (isSuccessfulGroupUpdateResult(result)) {
                return {
                    jid,
                    mentionJid,
                    participant: resolved?.participant || findParticipantByJid(conn, jid, currentParticipants),
                    participants: currentParticipants,
                    result,
                }
            }
            lastError = new Error(`Group update failed for ${jid}: ${JSON.stringify(result)}`)
        } catch (error) {
            lastError = error
        }
    }

    if (lastError) throw lastError

    return null
}

export function normalizeUserJid(conn, value, participants = []) {
    if (value === null || value === undefined) return null

    const raw = String(value).trim()
    if (!raw) return null

    const decoded = conn?.decodeJid ? conn.decodeJid(raw) : raw
    if (decoded && isGroupJid(decoded)) return null

    const targetCandidates = buildJidCandidates(conn, raw, [decoded])
    const participantMatch = (Array.isArray(participants) ? participants : []).find((participant) => {
        const participantCandidates = buildJidCandidates(conn, participant?.id || participant?.jid || participant?.lid, [
            participant?.id,
            participant?.jid,
            participant?.lid,
            participant?.phoneNumber,
            participant?.pn,
        ])

        for (const candidate of targetCandidates) {
            if (participantCandidates.has(candidate)) return true
        }

        const participantJid = pickParticipantJid(conn, participant)
        return participantJid && decoded ? areJidsSameUser(participantJid, decoded) : false
    })

    if (participantMatch) {
        return pickParticipantJid(conn, participantMatch)
    }

    // If decoded is a @lid JID, try to resolve it via dbJidAliases before returning
    if (decoded && String(decoded).endsWith('@lid')) {
        const jidAliases = global.db?.data?.jidAliases
        if (jidAliases && typeof jidAliases === 'object') {
            const strippedLid = String(decoded).replace(/@lid$/, '')
            const resolved = jidAliases[decoded] || jidAliases[strippedLid] || jidAliases[raw]
            if (typeof resolved === 'string' && resolved.endsWith('@s.whatsapp.net')) {
                return resolved
            }
        }
    }

    if (decoded && String(decoded).includes('@')) {
        return decoded
    }

    return toUserJid(raw)
}

export function resolveUserTarget({ conn, m, args = [], text = '', participants = [] } = {}) {
    const directCandidates = [
        m?.quoted?.rawSender,
        m?.quoted?.realSender,
        m?.quoted?.sender,
        ...(Array.isArray(m?.rawMentionedJid) ? m.rawMentionedJid : []),
        ...(Array.isArray(m?.quoted?.rawMentionedJid) ? m.quoted.rawMentionedJid : []),
        ...(Array.isArray(m?.mentionedJid) ? m.mentionedJid : []),
    ]

    for (const candidate of directCandidates) {
        const normalized = normalizeUserJid(conn, candidate, participants)
        if (normalized) return normalized
    }

    const fallbackCandidates = []
    const argValues = Array.isArray(args) ? args : []

    for (const value of argValues) {
        if (toDigits(value).length >= 7) fallbackCandidates.push(value)
    }

    if (typeof text === 'string' && text.trim()) {
        const textTokens = text.trim().split(/\s+/)
        for (const value of textTokens) {
            if (toDigits(value).length >= 7) fallbackCandidates.push(value)
        }

        const mentionMatches = [...text.matchAll(/@(\d{5,20})/g)].map((match) => match[1])
        fallbackCandidates.push(...mentionMatches)
    }

    for (const candidate of fallbackCandidates) {
        const normalized = normalizeUserJid(conn, candidate, participants)
        if (normalized) return normalized
    }

    return null
}

export async function getSafeUserName(conn, jid, fallback = '') {
    const safeFallback = fallback || String(jid || '').split('@')[0] || ''

    try {
        const name = await Promise.resolve(conn?.getName ? conn.getName(jid) : '')
        if (typeof name === 'string' && name.trim()) return name.trim()
    } catch {}

    return safeFallback
}

export async function ensureUserRecord(conn, jid, defaults = {}) {
    const users = global.db?.data?.users
    if (!users || !jid) return null

    const current = users[jid] || {}
    const record = {
        ...USER_RECORD_DEFAULTS,
        ...defaults,
        ...current,
    }

    if (!record.name) {
        record.name = await getSafeUserName(conn, jid)
    }

    users[jid] = record
    return record
}
