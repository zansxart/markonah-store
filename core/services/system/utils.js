import { areJidsSameUser } from '@zansxart/baileys'
import { applyThumbnail, buildCoverMessage, resolveCover } from '../media/covers.js'
import { applyGroupParticipantAction, normalizeUserJid } from '../runtime/user-target.js'

async function fetchProfilePictures(conn, userJid, groupJid) {
  let userPic = media.avatar;
  let groupPic = media.avatar;

  try {
    userPic = await conn.profilePictureUrl(userJid, 'image');
    groupPic = await conn.profilePictureUrl(groupJid, 'image');
  } catch { }

  return { userPic, groupPic };
}

function buildCoverCardMessage(cover, text, mentions, title, body) {
  const externalAdReply = {
    title,
    body,
    sourceUrl: url.sgc || '',
    mediaType: 1,
    renderLargerThumbnail: true,
    showAdAttribution: false
  };

  applyThumbnail(externalAdReply, cover);

  return {
    text,
    mentions,
    contextInfo: {
      mentionedJid: mentions,
      externalAdReply
    }
  };
}

async function participantsUpdate({ id: chatId, participants, author, action }) {
  const botJid = conn.user?.jid;
  if (!botJid) return;

  let id = chatId;
  if (typeof id !== 'string') {
    id = id?.id || id?.jid || id?.lid || '';
  }
  if (!id) return;
  const decodedChatId = conn.decodeJid(id);

  // Invalidate group metadata cache for this chat instantly
  if (this.groupMetadataCache) {
    this.groupMetadataCache.delete(decodedChatId);
  }

  const botSettings = global.db.data.settings?.[botJid] || {};
  if (botSettings.self) return;

  const chatSettings = global.db.data.chats?.[decodedChatId] || {};

  // Normalize participants to ensure we are dealing with string JIDs
  const normalizedParticipants = (participants || []).map(p => {
    return typeof p === 'string' ? p : (p?.id || p?.jid || p?.lid || '');
  }).filter(Boolean);

  // Check if the bot itself was added to the group
  const isBotAdded = normalizedParticipants.some(p => areJidsSameUser(p, botJid));
  if (action === 'add' && isBotAdded) {
    setTimeout(async () => {
      // Pastikan entry chat ada di database
      if (!global.db.data.chats[decodedChatId]) {
        global.db.data.chats[decodedChatId] = {};
      }
      const chats = global.db.data.chats[decodedChatId];
      const isRented = chats && chats.expired && chats.expired > Date.now();
      if (!isRented) {
        // Tandai grup ini perlu sewa — flag ini yang dicek handler
        // untuk memblokir command dari non-owner
        chats.needSewa = true;
        global.markDbDirty?.();

        try {
          const greetingText = `👋 *Halo semuanya! Terima kasih sudah mengundang Onah!*\n\n` +
            `⚠️ *STATUS GRUP:* Belum Menyewa / Belum Aktif\n` +
            `Agar Onah bisa merespons semua perintah di grup ini, silakan hubungi *.owner* untuk melakukan penyewaan terlebih dahulu, atau ketik *.sewa* untuk melihat info sewa.\n\n` +
            `Terima kasih! ✨`;
          
          await conn.reply(decodedChatId, greetingText, null);
        } catch (e) {
          console.error('[GREET UNRENTED GROUP ERROR]', e);
        }
      }
    }, 5000); // Greet after 5 seconds
    return;
  }

  const metadata = await conn.groupMetadata(decodedChatId).catch(() => null) || (conn.chats?.[decodedChatId] || {}).metadata;
  if (!metadata || !metadata.participants) return;

  const memberCount = metadata.participants.length;
  const groupName = await conn.getName(decodedChatId).catch(() => 'Group WhatsApp');
  const groupDesc = metadata.desc?.toString() || 'unknown';

  for (const userJid of normalizedParticipants) {
    if (action === 'add' && chatSettings.welcome) {
      const isBotAdmin = metadata.participants.find(p => p.id === botJid && p.admin !== null);
      const blacklist = chatSettings.blacklist || [];
      const normalizedUserJid = normalizeUserJid(conn, userJid, metadata.participants) || userJid;
      const isBlacklisted = blacklist.find((user) => {
        if (!user?.id) return false;
        const normalizedBlacklistedJid = normalizeUserJid(conn, user.id, metadata.participants) || user.id;
        return normalizedBlacklistedJid && normalizedUserJid
          ? areJidsSameUser(normalizedBlacklistedJid, normalizedUserJid)
          : false;
      });

      if (isBotAdmin && isBlacklisted) {
        await conn.reply(decodedChatId, `Weee, @${normalizedUserJid.split('@')[0]} mau nyusup yaa? Gak bisa. Sana pergi dulu.`, null, {
          contextInfo: { mentionedJid: [normalizedUserJid] }
        });
        return applyGroupParticipantAction(conn, decodedChatId, userJid, 'remove', metadata.participants);
      }

      const welcomeCover = await resolveCover(conn, 'welcome');
      const welcomeText = (chatSettings.sWelcome || conn.welcome || 'Wihh, ada penghuni baru, @user! Selamat datang di grup *@subject* Jangan nakal ya.')
        .replace(/@user/g, `@${normalizedUserJid.split('@')[0]}`)
        .replace(/@subject/g, groupName)
        .replace(/@member/g, memberCount.toString())
        .replace(/@desc/g, groupDesc);

      const mentions = [normalizedUserJid];
      if (welcomeCover?.type === 'image') {
        await conn.sendMessage(
          decodedChatId,
          buildCoverCardMessage(
            welcomeCover,
            welcomeText,
            mentions,
            `WELCOME TO ${groupName}`,
            `Member ke-${memberCount}`
          )
        );
      } else {
        await conn.sendMessage(decodedChatId, buildCoverMessage(welcomeCover, welcomeText, mentions));
      }
    } else if (action === 'remove' && chatSettings.bye) {
      const byeCover = await resolveCover(conn, 'bye');
      const byeText = (chatSettings.sBye || conn.bye || 'Yah, @user kok pergi. Padahal lagi seru. Dadah!')
        .replace(/@user/g, `@${userJid.split('@')[0]}`)
        .replace(/@subject/g, groupName)
        .replace(/@member/g, memberCount.toString())
        .replace(/@desc/g, groupDesc);

      const mentions = [userJid];
      if (byeCover?.type === 'image') {
        await conn.sendMessage(
          decodedChatId,
          buildCoverCardMessage(
            byeCover,
            byeText,
            mentions,
            `GOODBYE FROM ${groupName}`,
            `Sisa member ${Math.max(memberCount, 0)}`
          )
        );
      } else {
        await conn.sendMessage(decodedChatId, buildCoverMessage(byeCover, byeText, mentions));
      }
    } else if ((action === 'promote' || action === 'demote') && chatSettings.detect) {
      const { userPic } = await fetchProfilePictures(conn, userJid, decodedChatId);
      const isPromote = action === 'promote';

      let authorJid = author;
      if (authorJid && typeof authorJid !== 'string') {
        authorJid = authorJid?.id || authorJid?.jid || authorJid?.lid || '';
      }
      const authorText = authorJid ? `@${authorJid.split('@')[0]}` : 'Admin';
      const mentionedJid = authorJid ? [userJid, authorJid] : [userJid];

      const title = isPromote ? 'NAIK JABATAN' : 'TURUN JABATAN';
      const promoteDemoteText = isPromote
        ? `Ciyeee, @${userJid.split('@')[0]} sekarang jadi admin. Semua berkat ${authorText}.`
        : `Yahh, @${userJid.split('@')[0]} sekarang turun jabatan. Dicopot sama ${authorText}.`;

      await conn.sendMessage(decodedChatId, {
        text: promoteDemoteText,
        contextInfo: {
          mentionedJid,
          externalAdReply: {
            title,
            body: `di Group ${groupName}`,
            thumbnailUrl: userPic,
            sourceUrl: '',
            mediaType: 1,
            renderLargerThumbnail: true
          }
        }
      });
    }
  }
}

async function deleteUpdate({ fromMe, id: msgId, remoteJid, participant }) {
  if (fromMe) return;

  try {
    const loaded = await conn.loadMessage(msgId);
    const message = await conn.serializeM(loaded);
    if (!message) return;
    const { isGroup, chat: chatId } = message;
    if (!isGroup) return;

    const chatSettings = global.db.data.chats[chatId];
    if (!chatSettings?.delete) return;

    const mention = `@${participant.split('@')[0]}`;
    const warningText = `
Ciee, ${mention} abis ngomong apa kok dihapus? Aku liat looh.

Kalo gak mau aku intipin lagi, ketik
*.disable antidelete*
    `.trim();

    await conn.reply(chatId, warningText, loaded, {
      contextInfo: { mentionedJid: [participant] }
    });
    await conn.copyNForward(chatId, loaded);
  } catch (e) {
    console.error(e);
  }
}

async function callUpdate(callUpdates) {
  const botJid = conn.user?.jid;
  if (!botJid) return;
  const botSettings = global.db.data.settings?.[botJid] || {};
  if (!botSettings.anticall) return;

  const { isGroup, status, from, isVideo } = callUpdates[0];
  if (isGroup || status !== 'offer' || from === `${global.owner}${global.info.jid}`) return;

  const callType = isVideo ? 'panggilan video' : 'panggilan suara';
  const mention = `@${from.split('@')[0]}`;
  const message = `
*JANGAN TELEPON AKU!*

Hadeeh, si ${mention} pake nelpon segala.

Gara-gara kamu nelpon pake ${callType}, sekarang kamu aku blokir dan aku masukin daftar banned.

Kalau salah pencet, hubungi owner:
https://wa.me/${global.owner}
  `.trim();

  global.db.data.users[from] = global.db.data.users[from] || {};
  global.db.data.users[from].banned = true;

  await conn.reply(from, message, false, {
    contextInfo: { mentionedJid: [from] }
  });
  await conn.rejectCall(msgId, from);
  await conn.updateBlockStatus(from, 'block');
}

export {
  participantsUpdate,
  deleteUpdate,
  callUpdate
};
