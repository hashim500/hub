import express from 'express';
import fs from 'fs';
import { createServer as createHttpServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const STORE_FILE = path.join(DATA_DIR, 'persistent_store.json');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Server-side Profanity / Inappropriate Words Filter
const SERVER_BLOCKED_WORDS = [
  'كلب',
  'حيوان',
  'حمار',
  'غبي',
  'تافه',
  'وسخ',
  'قذر',
  'لعنة',
  'ملعون',
  'شرموط',
  'شرموطة',
  'قحبة',
  'قحبه',
  'عاهر',
  'عاهرة',
  'منيوك',
  'نيك',
  'زبي',
  'زب',
  'كس',
  'طيز',
  'عرص',
  'معرص',
  'خول',
  'خنيث',
  'مخنث',
  'ديوث',
  'انقلع',
  'ينعن',
  'يلعن',
  'سافل',
  'منحط',
  'حقير',
  'واطي',
  'زبالة',
  'زباله',
  'خرا',
  'خرة',
  'زق',
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'bastard',
  'dick',
  'pussy',
  'whore',
  'slut',
  'cunt',
  'motherfucker',
];

function containsServerProfanity(text: string): boolean {
  if (!text) return false;
  const norm = text
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا');
  const tokens = norm
    .split(/[\s.,!?;:()[\]{}"'،؛؟\-_/\\|+*=<>~`@#$%^&*]+/)
    .filter(Boolean);
  for (const w of SERVER_BLOCKED_WORDS) {
    const nw = w
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[أإآ]/g, 'ا');
    if (tokens.includes(nw)) return true;
    if (nw.length >= 4 && norm.includes(nw)) return true;
  }
  return false;
}

interface StoredPrivateMessage {
  id: string;
  threadId: string;
  senderUid: string;
  senderUsername: string;
  senderRole: 'member' | 'moderator' | 'admin';
  senderAvatarUrl?: string;
  senderAvatarColor?: string;
  recipientUid: string;
  recipientUsername: string;
  text: string;
  category: string;
  replyToId?: string;
  replyToUsername?: string;
  replyToPreview?: string;
  imageUrl?: string;
  audioUrl?: string;
  audioDurationSec?: number;
  createdAtIso: string;
}

interface PersistentStoreData {
  userAvatars: Record<string, string>;
  userNames: Record<string, string>;
  roomAvatars: Record<string, string>;
  deletedRooms: string[];
  customRooms: {
    roomId: string;
    name: string;
    topic: string;
    category: 'General' | 'Technology' | 'Design' | 'Voice & Music' | 'Global Lounge' | 'Community';
    createdBy: string;
    avatarUrl?: string;
  }[];
  roomMessages: Record<string, {
    id: string;
    roomId: string;
    authorUid: string;
    authorUsername: string;
    authorRole: 'member' | 'moderator' | 'admin';
    authorAvatarUrl?: string;
    authorAvatarColor?: string;
    text: string;
    category?: string;
    replyToId?: string;
    replyToUsername?: string;
    replyToPreview?: string;
    imageUrl?: string;
    audioUrl?: string;
    audioDurationSec?: number;
    isPublic: boolean;
    createdAtIso: string;
  }[]>;
  privateThreads: Record<string, StoredPrivateMessage[]>;
}

function loadPersistentStore(): PersistentStoreData {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        userAvatars: parsed.userAvatars || {},
        userNames: parsed.userNames || {},
        roomAvatars: parsed.roomAvatars || {},
        deletedRooms: Array.isArray(parsed.deletedRooms) ? parsed.deletedRooms : [],
        customRooms: Array.isArray(parsed.customRooms) ? parsed.customRooms : [],
        roomMessages: parsed.roomMessages || {},
        privateThreads: parsed.privateThreads || {},
      };
    }
  } catch {
    // Fallback
  }
  return {
    userAvatars: {},
    userNames: {},
    roomAvatars: {},
    deletedRooms: [],
    customRooms: [],
    roomMessages: {},
    privateThreads: {},
  };
}

function savePersistentStore(store: PersistentStoreData) {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch {
    // Ignore disk write error
  }
}

interface ConnectedUser {
  uid: string;
  username: string;
  role: 'member' | 'moderator' | 'admin';
  avatarColor: string;
  avatarUrl?: string;
  currentTextRoom: string;
  currentVoiceRoom: string | null;
  isMuted: boolean;
  isSpeaking: boolean;
  joinedAt: string;
}

async function startServer() {
  const app = express();
  const httpServer = createHttpServer(app);
  const PORT = 3000;

  app.use(express.json({ limit: '25mb' }));
  app.use('/uploads', express.static(UPLOADS_DIR));

  const persistentStore = loadPersistentStore();
  const clients = new Map<WebSocket, ConnectedUser>();

  interface StoredMessage {
    id: string;
    roomId: string;
    authorUid: string;
    authorUsername: string;
    authorRole: 'member' | 'moderator' | 'admin';
    authorAvatarUrl?: string;
    authorAvatarColor?: string;
    text: string;
    category?: string;
    replyToId?: string;
    replyToUsername?: string;
    replyToPreview?: string;
    imageUrl?: string;
    audioUrl?: string;
    audioDurationSec?: number;
    isPublic: boolean;
    createdAtIso: string;
  }

  const serverRoomMessages = new Map<string, StoredMessage[]>();
  const httpHeartbeats = new Map<string, ConnectedUser & { lastHeartbeatMs: number }>();

  interface LiveVoiceChunk {
    id: string;
    roomId: string;
    senderUid: string;
    senderUsername: string;
    audioDataUrl: string;
    createdAtMs: number;
  }
  const liveVoiceChunks: LiveVoiceChunk[] = [];

  for (const [rId, msgs] of Object.entries(persistentStore.roomMessages)) {
    if (Array.isArray(msgs)) {
      serverRoomMessages.set(rId, msgs);
    }
  }

  function syncRoomMessagesToStore(rId: string) {
    persistentStore.roomMessages[rId] = serverRoomMessages.get(rId) || [];
    savePersistentStore(persistentStore);
  }

  function getAllStoredRoomMessages(): StoredMessage[] {
    const allStored: StoredMessage[] = [];
    for (const msgs of serverRoomMessages.values()) {
      allStored.push(...msgs);
    }
    return allStored;
  }

  const seedMessages: Record<string, StoredMessage[]> = {
    general: [
      {
        id: 'seed_1',
        roomId: 'general',
        authorUid: 'preset_admin_1',
        authorUsername: persistentStore.userNames['preset_admin_1'] || 'الإدارة_العامة',
        authorRole: 'admin',
        authorAvatarColor: '#E11D48',
        authorAvatarUrl: persistentStore.userAvatars['preset_admin_1'],
        text: 'أهلاً وسهلاً بكم في تطبيق HUB! جميع الرسائل النصية والصور والبث الصوتي المباشر تنتقل فوراً بين جميع الجوالات والأجهزة المتصلة.',
        category: 'عام',
        isPublic: true,
        createdAtIso: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
      },
      {
        id: 'seed_2',
        roomId: 'general',
        authorUid: 'preset_mod_faisal',
        authorUsername: persistentStore.userNames['preset_mod_faisal'] || 'أحمد_الفيصل',
        authorRole: 'moderator',
        authorAvatarColor: '#4F46E5',
        authorAvatarUrl: persistentStore.userAvatars['preset_mod_faisal'],
        text: 'حياكم الله في HUB! يمكنك الدخول من أي جوال والتحدث كتابياً أو صوتياً بشكل مباشر وفوري مع المتواجدين في الغرفة.',
        category: 'هام',
        isPublic: true,
        createdAtIso: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
      },
      {
        id: 'seed_3',
        roomId: 'general',
        authorUid: 'preset_member_2',
        authorUsername: persistentStore.userNames['preset_member_2'] || 'نورة_العلي',
        authorRole: 'member',
        authorAvatarColor: '#0D9488',
        authorAvatarUrl: persistentStore.userAvatars['preset_member_2'],
        text: 'مساء النور 😊✨ جربوا الكتابة أو التحدث بالصوت في الغرف وستصل الرسائل والصوت فوراً للطرف الآخر!',
        category: 'تعاون',
        isPublic: true,
        createdAtIso: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
      },
    ],
  };

  Object.entries(seedMessages).forEach(([rId, msgs]) => {
    if (!serverRoomMessages.has(rId) || (serverRoomMessages.get(rId)?.length || 0) === 0) {
      serverRoomMessages.set(rId, msgs);
      syncRoomMessagesToStore(rId);
    }
  });

  function getDefaultHosts(): ConnectedUser[] {
    return [
      {
        uid: 'preset_admin_1',
        username: persistentStore.userNames['preset_admin_1'] || 'الإدارة_العامة',
        role: 'admin',
        avatarColor: '#E11D48',
        avatarUrl: persistentStore.userAvatars['preset_admin_1'],
        currentTextRoom: 'general',
        currentVoiceRoom: null,
        isMuted: false,
        isSpeaking: false,
        joinedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      },
      {
        uid: 'preset_mod_faisal',
        username: persistentStore.userNames['preset_mod_faisal'] || 'أحمد_الفيصل',
        role: 'moderator',
        avatarColor: '#4F46E5',
        avatarUrl: persistentStore.userAvatars['preset_mod_faisal'],
        currentTextRoom: 'general',
        currentVoiceRoom: null,
        isMuted: false,
        isSpeaking: false,
        joinedAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
      },
      {
        uid: 'preset_member_2',
        username: persistentStore.userNames['preset_member_2'] || 'نورة_العلي',
        role: 'member',
        avatarColor: '#0D9488',
        avatarUrl: persistentStore.userAvatars['preset_member_2'],
        currentTextRoom: 'general',
        currentVoiceRoom: null,
        isMuted: false,
        isSpeaking: false,
        joinedAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
      },
    ];
  }

  function getOnlineUsersList(): ConnectedUser[] {
    const now = Date.now();
    const byUid = new Map<string, ConnectedUser>();
    getDefaultHosts().forEach((h) => byUid.set(h.uid, h));
    for (const [uid, hbUser] of httpHeartbeats.entries()) {
      if (now - hbUser.lastHeartbeatMs > 25000) {
        httpHeartbeats.delete(uid);
        continue;
      }
      const savedAvatar = persistentStore.userAvatars[uid];
      const savedName = persistentStore.userNames[uid];
      byUid.set(uid, {
        ...hbUser,
        username: hbUser.username || savedName || 'عضو',
        avatarUrl: hbUser.avatarUrl || savedAvatar,
      });
    }
    for (const user of clients.values()) {
      const savedAvatar = persistentStore.userAvatars[user.uid];
      const savedName = persistentStore.userNames[user.uid];
      byUid.set(user.uid, {
        ...user,
        username: user.username || savedName || 'عضو',
        avatarUrl: user.avatarUrl || savedAvatar,
      });
    }
    return Array.from(byUid.values());
  }

  function broadcastVoiceChunkToRoom(roomId: string, senderUid: string, chunk: LiveVoiceChunk) {
    const payload = JSON.stringify({
      type: 'voice:audio_chunk',
      chunk,
    });
    for (const [clientWs, clientUser] of clients.entries()) {
      if (
        clientWs.readyState === WebSocket.OPEN &&
        clientUser.currentVoiceRoom === roomId &&
        clientUser.uid !== senderUid
      ) {
        clientWs.send(payload);
      }
    }
  }

  function broadcastAll(payloadObj: unknown) {
    const payload = JSON.stringify(payloadObj);
    for (const client of clients.keys()) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  // Send private store state WITHOUT leaking other users' privateThreads!
  function getPublicStoreSnapshot() {
    return {
      userAvatars: persistentStore.userAvatars,
      userNames: persistentStore.userNames,
      roomAvatars: persistentStore.roomAvatars,
      deletedRooms: persistentStore.deletedRooms,
      customRooms: persistentStore.customRooms,
    };
  }

  function broadcastPresence() {
    broadcastAll({
      type: 'presence:sync',
      users: getOnlineUsersList(),
      timestamp: new Date().toISOString(),
    });
  }

  function broadcastStoreState() {
    broadcastAll({
      type: 'store:sync',
      store: getPublicStoreSnapshot(),
    });
  }

  // Send only the private messages where `uid` is strictly senderUid or recipientUid (Zero Third-Party Exposure!)
  function getPrivateMessagesForUser(uid: string): StoredPrivateMessage[] {
    const list: StoredPrivateMessage[] = [];
    for (const msgs of Object.values(persistentStore.privateThreads)) {
      for (const m of msgs) {
        if (m.senderUid === uid || m.recipientUid === uid) {
          list.push(m);
        }
      }
    }
    return list;
  }

  app.get('/api/persistent-state', (_req, res) => {
    res.json(getPublicStoreSnapshot());
  });

  app.post('/api/realtime/sync', (req, res) => {
    const {
      uid,
      username,
      role,
      avatarColor,
      avatarUrl,
      currentTextRoom,
      currentVoiceRoom,
      isMuted,
      isSpeaking,
      lastVoiceChunkMs,
    } = req.body as {
      uid?: string;
      username?: string;
      role?: 'member' | 'moderator' | 'admin';
      avatarColor?: string;
      avatarUrl?: string;
      currentTextRoom?: string;
      currentVoiceRoom?: string | null;
      isMuted?: boolean;
      isSpeaking?: boolean;
      lastVoiceChunkMs?: number;
    };

    const now = Date.now();
    if (uid && typeof uid === 'string') {
      const cleanUid = uid.slice(0, 128);
      const savedAvatar = persistentStore.userAvatars[cleanUid];
      const savedName = persistentStore.userNames[cleanUid];
      const hbUser = {
        uid: cleanUid,
        username: String(username || savedName || 'عضو').slice(0, 40),
        role: role && ['member', 'moderator', 'admin'].includes(role) ? role : ('member' as const),
        avatarColor: String(avatarColor || '#2563EB').slice(0, 32),
        avatarUrl: avatarUrl || savedAvatar,
        currentTextRoom: String(currentTextRoom || 'general').slice(0, 128),
        currentVoiceRoom: currentVoiceRoom ? String(currentVoiceRoom).slice(0, 128) : null,
        isMuted: Boolean(isMuted),
        isSpeaking: Boolean(isSpeaking) && !isMuted,
        joinedAt: httpHeartbeats.get(cleanUid)?.joinedAt || new Date(now).toISOString(),
        lastHeartbeatMs: now,
      };
      httpHeartbeats.set(cleanUid, hbUser);

      for (const [wsClient, wsUser] of clients.entries()) {
        if (wsUser.uid === cleanUid) {
          clients.set(wsClient, {
            ...wsUser,
            username: hbUser.username,
            role: hbUser.role,
            avatarUrl: hbUser.avatarUrl,
            currentTextRoom: hbUser.currentTextRoom,
            currentVoiceRoom: hbUser.currentVoiceRoom,
            isMuted: hbUser.isMuted,
            isSpeaking: hbUser.isSpeaking,
          });
        }
      }
    }

    while (liveVoiceChunks.length > 0 && now - liveVoiceChunks[0].createdAtMs > 12000) {
      liveVoiceChunks.shift();
    }

    const sinceMs = typeof lastVoiceChunkMs === 'number' ? lastVoiceChunkMs : now - 4000;
    const incomingVoiceChunks =
      currentVoiceRoom && uid
        ? liveVoiceChunks.filter(
            (c) =>
              c.roomId === currentVoiceRoom &&
              c.senderUid !== uid &&
              c.createdAtMs > sinceMs
          )
        : [];

    res.json({
      store: getPublicStoreSnapshot(),
      users: getOnlineUsersList(),
      messages: getAllStoredRoomMessages(),
      privateMessages: uid ? getPrivateMessagesForUser(uid) : [],
      voiceChunks: incomingVoiceChunks,
      serverTimeMs: now,
    });
  });

  app.post('/api/chat/send', (req, res) => {
    const {
      id,
      roomId,
      authorUid,
      authorUsername,
      authorRole,
      authorAvatarColor,
      authorAvatarUrl,
      text,
      category,
      replyToId,
      replyToUsername,
      replyToPreview,
      imageUrl,
      audioUrl,
      audioDurationSec,
    } = req.body;

    if (!roomId || !authorUid) {
      res.status(400).json({ error: 'Missing roomId or authorUid' });
      return;
    }

    const rawText = String(text || '').slice(0, 1000);
    if (containsServerProfanity(rawText)) {
      res.status(400).json({ error: 'PROFANITY_BLOCKED' });
      return;
    }

    const rId = String(roomId).slice(0, 128);
    const msgId = String(id || 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
    const list = serverRoomMessages.get(rId) || [];
    const existingMsg = list.find((m) => m.id === msgId);
    if (existingMsg) {
      res.json({ ok: true, message: existingMsg });
      return;
    }

    const savedAvatar = persistentStore.userAvatars[authorUid] || authorAvatarUrl;
    const savedName = persistentStore.userNames[authorUid] || authorUsername || 'عضو';

    const newMsg: StoredMessage = {
      id: msgId,
      roomId: rId,
      authorUid: String(authorUid),
      authorUsername: String(savedName).slice(0, 40),
      authorRole: ['member', 'moderator', 'admin'].includes(authorRole) ? authorRole : 'member',
      authorAvatarUrl: savedAvatar,
      authorAvatarColor: String(authorAvatarColor || '#2563EB'),
      text: rawText,
      category: typeof category === 'string' ? category : undefined,
      replyToId: typeof replyToId === 'string' ? replyToId : undefined,
      replyToUsername: typeof replyToUsername === 'string' ? replyToUsername : undefined,
      replyToPreview: typeof replyToPreview === 'string' ? replyToPreview : undefined,
      imageUrl: typeof imageUrl === 'string' ? imageUrl : undefined,
      audioUrl: typeof audioUrl === 'string' ? audioUrl : undefined,
      audioDurationSec: typeof audioDurationSec === 'number' ? audioDurationSec : undefined,
      isPublic: true,
      createdAtIso: new Date().toISOString(),
    };

    list.push(newMsg);
    if (list.length > 120) list.shift();
    serverRoomMessages.set(rId, list);
    syncRoomMessagesToStore(rId);

    broadcastAll({
      type: 'chat:message:new',
      message: newMsg,
    });

    res.json({ ok: true, message: newMsg });
  });

  app.post('/api/chat/delete', (req, res) => {
    const { msgId, roomId } = req.body;
    if (!msgId || !roomId) {
      res.status(400).json({ error: 'Missing msgId or roomId' });
      return;
    }
    const rId = String(roomId);
    const targetMsgId = String(msgId);
    const list = serverRoomMessages.get(rId) || [];
    serverRoomMessages.set(
      rId,
      list.filter((m) => m.id !== targetMsgId)
    );
    syncRoomMessagesToStore(rId);

    broadcastAll({
      type: 'chat:message:deleted',
      msgId: targetMsgId,
      roomId: rId,
    });
    res.json({ ok: true });
  });

  app.post('/api/dm/send', (req, res) => {
    const {
      id,
      senderUid,
      senderUsername,
      senderRole,
      senderAvatarColor,
      senderAvatarUrl,
      recipientUid,
      recipientUsername,
      text,
      category,
      replyToId,
      replyToUsername,
      replyToPreview,
      imageUrl,
      audioUrl,
      audioDurationSec,
    } = req.body;

    if (!senderUid || !recipientUid) {
      res.status(400).json({ error: 'Missing senderUid or recipientUid' });
      return;
    }

    const rawText = String(text || '').slice(0, 1000);
    if (containsServerProfanity(rawText)) {
      res.status(400).json({ error: 'PROFANITY_BLOCKED' });
      return;
    }

    const sUid = String(senderUid);
    const rUid = String(recipientUid);
    const threadId = [sUid, rUid].sort().join('__');
    const dmId = String(id || 'dm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));

    const threadList = persistentStore.privateThreads[threadId] || [];
    const existingDm = threadList.find((m) => m.id === dmId);
    if (existingDm) {
      res.json({ ok: true, message: existingDm });
      return;
    }

    const senderSavedAvatar = persistentStore.userAvatars[sUid] || senderAvatarUrl;
    const senderSavedName = persistentStore.userNames[sUid] || senderUsername || 'عضو';

    const newDm: StoredPrivateMessage = {
      id: dmId,
      threadId,
      senderUid: sUid,
      senderUsername: String(senderSavedName).slice(0, 40),
      senderRole: ['member', 'moderator', 'admin'].includes(senderRole) ? senderRole : 'member',
      senderAvatarUrl: senderSavedAvatar,
      senderAvatarColor: String(senderAvatarColor || '#2563EB'),
      recipientUid: rUid,
      recipientUsername: String(recipientUsername || 'عضو'),
      text: rawText,
      category: String(category || 'عام'),
      replyToId: typeof replyToId === 'string' ? replyToId : undefined,
      replyToUsername: typeof replyToUsername === 'string' ? replyToUsername : undefined,
      replyToPreview: typeof replyToPreview === 'string' ? replyToPreview : undefined,
      imageUrl: typeof imageUrl === 'string' ? imageUrl : undefined,
      audioUrl: typeof audioUrl === 'string' ? audioUrl : undefined,
      audioDurationSec: typeof audioDurationSec === 'number' ? audioDurationSec : undefined,
      createdAtIso: new Date().toISOString(),
    };

    threadList.push(newDm);
    if (threadList.length > 100) threadList.shift();
    persistentStore.privateThreads[threadId] = threadList;
    savePersistentStore(persistentStore);

    const dmPayload = JSON.stringify({
      type: 'dm:new',
      message: newDm,
    });

    for (const [clientWs, clientUser] of clients.entries()) {
      if (
        clientWs.readyState === WebSocket.OPEN &&
        (clientUser.uid === sUid || clientUser.uid === rUid)
      ) {
        clientWs.send(dmPayload);
      }
    }

    res.json({ ok: true, message: newDm });
  });

  app.post('/api/voice/stream', (req, res) => {
    const { roomId, senderUid, senderUsername, audioDataUrl } = req.body as {
      roomId?: string;
      senderUid?: string;
      senderUsername?: string;
      audioDataUrl?: string;
    };

    if (!roomId || !senderUid || !audioDataUrl || !audioDataUrl.startsWith('data:audio')) {
      res.status(400).json({ error: 'Invalid voice stream chunk' });
      return;
    }

    const now = Date.now();
    const chunk: LiveVoiceChunk = {
      id: 'vc_' + now + '_' + Math.random().toString(36).slice(2, 6),
      roomId: String(roomId),
      senderUid: String(senderUid),
      senderUsername: String(senderUsername || 'متحدث'),
      audioDataUrl,
      createdAtMs: now,
    };

    liveVoiceChunks.push(chunk);
    while (liveVoiceChunks.length > 60) {
      liveVoiceChunks.shift();
    }

    broadcastVoiceChunkToRoom(chunk.roomId, chunk.senderUid, chunk);
    res.json({ ok: true, chunkId: chunk.id });
  });

  app.post('/api/upload-media', (req, res) => {
    try {
      const { dataUrl, kind, targetId } = req.body as {
        dataUrl?: string;
        kind?: 'user_avatar' | 'room_avatar' | 'chat_image' | 'voice_note';
        targetId?: string;
      };

      if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
        res.status(400).json({ error: 'Invalid media dataUrl' });
        return;
      }

      const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        res.status(400).json({ error: 'Malformed base64 dataUrl' });
        return;
      }

      const mimeType = matches[1];
      const base64Data = matches[2];
      let ext = 'bin';
      if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
      else if (mimeType.includes('png')) ext = 'png';
      else if (mimeType.includes('webp')) ext = 'webp';
      else if (mimeType.includes('gif')) ext = 'gif';
      else if (mimeType.includes('webm')) ext = 'webm';
      else if (mimeType.includes('ogg')) ext = 'ogg';
      else if (mimeType.includes('mp4') || mimeType.includes('aac') || mimeType.includes('m4a')) ext = 'm4a';
      else if (mimeType.includes('mpeg') || mimeType.includes('mp3')) ext = 'mp3';
      else if (mimeType.includes('wav')) ext = 'wav';

      const safePrefix = (kind || 'media').replace(/[^a-z0-9_]/gi, '_');
      const safeTarget = (targetId || 'item').replace(/[^a-z0-9_-]/gi, '_').slice(0, 40);
      const filename = `${safePrefix}_${safeTarget}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 6)}.${ext}`;
      const filePath = path.join(UPLOADS_DIR, filename);

      fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
      const permanentUrl = `/uploads/${filename}`;

      if (kind === 'user_avatar' && targetId) {
        persistentStore.userAvatars[targetId] = permanentUrl;
        savePersistentStore(persistentStore);
        for (const [wsClient, u] of clients.entries()) {
          if (u.uid === targetId) {
            u.avatarUrl = permanentUrl;
            clients.set(wsClient, u);
          }
        }
        for (const [rId, msgs] of serverRoomMessages.entries()) {
          serverRoomMessages.set(
            rId,
            msgs.map((m) => (m.authorUid === targetId ? { ...m, authorAvatarUrl: permanentUrl } : m))
          );
        }
        broadcastPresence();
        broadcastStoreState();
      } else if (kind === 'room_avatar' && targetId) {
        persistentStore.roomAvatars[targetId] = permanentUrl;
        savePersistentStore(persistentStore);
        broadcastStoreState();
      }

      res.json({ url: permanentUrl });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to save media on server',
      });
    }
  });

  app.post('/api/user-profile', (req, res) => {
    const { uid, username, avatarUrl } = req.body as {
      uid?: string;
      username?: string;
      avatarUrl?: string;
    };
    if (!uid) {
      res.status(400).json({ error: 'Missing uid' });
      return;
    }
    if (typeof username === 'string' && username.trim().length >= 2) {
      persistentStore.userNames[uid] = username.trim().slice(0, 40);
    }
    if (typeof avatarUrl === 'string' && avatarUrl.trim()) {
      persistentStore.userAvatars[uid] = avatarUrl.trim();
    }
    savePersistentStore(persistentStore);
    broadcastPresence();
    broadcastStoreState();
    res.json({ ok: true, store: getPublicStoreSnapshot() });
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      platform: 'HUB',
      onlineCount: getOnlineUsersList().length,
      timestamp: new Date().toISOString(),
    });
  });

  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.send(
      JSON.stringify({
        type: 'store:sync',
        store: getPublicStoreSnapshot(),
      })
    );

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'user:join') {
          const uid = String(msg.uid || 'guest_' + Math.random().toString(36).slice(2, 8)).slice(0, 128);
          const savedAvatar = persistentStore.userAvatars[uid];
          const savedName = persistentStore.userNames[uid];
          const incomingAvatar =
            typeof msg.avatarUrl === 'string' && msg.avatarUrl.trim()
              ? msg.avatarUrl
              : savedAvatar;

          if (incomingAvatar && !persistentStore.userAvatars[uid]) {
            persistentStore.userAvatars[uid] = incomingAvatar;
            savePersistentStore(persistentStore);
          }

          const user: ConnectedUser = {
            uid,
            username: String(savedName || msg.username || 'Guest Member').slice(0, 40),
            role: ['member', 'moderator', 'admin'].includes(msg.role) ? msg.role : 'member',
            avatarColor: String(msg.avatarColor || '#2563EB').slice(0, 32),
            avatarUrl: incomingAvatar,
            currentTextRoom: String(msg.currentTextRoom || 'general').slice(0, 128),
            currentVoiceRoom: msg.currentVoiceRoom ? String(msg.currentVoiceRoom).slice(0, 128) : null,
            isMuted: Boolean(msg.isMuted),
            isSpeaking: false,
            joinedAt: new Date().toISOString(),
          };
          clients.set(ws, user);
          broadcastPresence();

          const allStored: StoredMessage[] = [];
          for (const msgs of serverRoomMessages.values()) {
            allStored.push(...msgs);
          }
          ws.send(
            JSON.stringify({
              type: 'chat:init',
              messages: allStored,
            })
          );
          // Send ONLY this user's private messages (Strict isolation from any 3rd party!)
          ws.send(
            JSON.stringify({
              type: 'dm:init',
              messages: getPrivateMessagesForUser(uid),
            })
          );
          ws.send(
            JSON.stringify({
              type: 'store:sync',
              store: getPublicStoreSnapshot(),
            })
          );
          return;
        }

        const existing = clients.get(ws);
        if (!existing) return;

        if (msg.type === 'user:update') {
          if (typeof msg.username === 'string' && msg.username.trim().length >= 2) {
            existing.username = msg.username.trim().slice(0, 40);
            persistentStore.userNames[existing.uid] = existing.username;
          }
          if (['member', 'moderator', 'admin'].includes(msg.role)) existing.role = msg.role;
          if (typeof msg.avatarUrl === 'string' && msg.avatarUrl.trim()) {
            existing.avatarUrl = msg.avatarUrl;
            persistentStore.userAvatars[existing.uid] = msg.avatarUrl;
          }
          if (typeof msg.currentTextRoom === 'string') {
            existing.currentTextRoom = msg.currentTextRoom.slice(0, 128);
          }
          savePersistentStore(persistentStore);
          clients.set(ws, existing);
          broadcastPresence();
          broadcastStoreState();
          return;
        }

        if (msg.type === 'room:avatar:update' && msg.roomId && msg.avatarUrl) {
          if (existing.role === 'admin' || existing.role === 'moderator') {
            persistentStore.roomAvatars[String(msg.roomId)] = String(msg.avatarUrl);
            savePersistentStore(persistentStore);
            broadcastStoreState();
          }
          return;
        }

        if (msg.type === 'room:delete' && msg.roomId) {
          if (existing.role === 'admin') {
            const targetId = String(msg.roomId);
            if (!persistentStore.deletedRooms.includes(targetId)) {
              persistentStore.deletedRooms.push(targetId);
            }
            persistentStore.customRooms = persistentStore.customRooms.filter(
              (r) => r.roomId !== targetId
            );
            serverRoomMessages.delete(targetId);
            savePersistentStore(persistentStore);
            broadcastStoreState();
          }
          return;
        }

        if (msg.type === 'room:create' && msg.room) {
          const r = msg.room;
          if (r && r.roomId && r.name) {
            persistentStore.customRooms.push({
              roomId: String(r.roomId),
              name: String(r.name).slice(0, 48),
              topic: String(r.topic || '').slice(0, 160),
              category: r.category || 'Community',
              createdBy: existing.uid,
              avatarUrl: r.avatarUrl,
            });
            savePersistentStore(persistentStore);
            broadcastStoreState();
          }
          return;
        }

        if (msg.type === 'voice:join') {
          const targetRoom = msg.roomId ? String(msg.roomId).slice(0, 128) : null;
          existing.currentVoiceRoom = targetRoom;
          existing.isMuted = Boolean(msg.isMuted);
          existing.isSpeaking = false;
          clients.set(ws, existing);
          broadcastPresence();
          return;
        }

        if (msg.type === 'voice:leave') {
          existing.currentVoiceRoom = null;
          existing.isSpeaking = false;
          clients.set(ws, existing);
          broadcastPresence();
          return;
        }

        if (msg.type === 'voice:state') {
          existing.isMuted = Boolean(msg.isMuted);
          existing.isSpeaking = Boolean(msg.isSpeaking) && !existing.isMuted;
          clients.set(ws, existing);
          broadcastPresence();
          return;
        }

        if (msg.type === 'voice:audio_chunk' && msg.roomId && msg.audioDataUrl) {
          const now = Date.now();
          const chunk: LiveVoiceChunk = {
            id: 'vc_' + now + '_' + Math.random().toString(36).slice(2, 6),
            roomId: String(msg.roomId),
            senderUid: existing.uid,
            senderUsername: existing.username,
            audioDataUrl: String(msg.audioDataUrl),
            createdAtMs: now,
          };
          liveVoiceChunks.push(chunk);
          while (liveVoiceChunks.length > 60) {
            liveVoiceChunks.shift();
          }
          broadcastVoiceChunkToRoom(chunk.roomId, existing.uid, chunk);
          return;
        }

        // Real-time public/voice room message (with Server-Side Profanity Check)
        if (
          msg.type === 'chat:message' &&
          msg.roomId &&
          (msg.text || msg.imageUrl || msg.audioUrl)
        ) {
          const rawText = String(msg.text || '').slice(0, 1000);
          if (containsServerProfanity(rawText)) {
            ws.send(
              JSON.stringify({
                type: 'chat:profanity_blocked',
                reason: 'Message contains inappropriate language.',
              })
            );
            return;
          }

          const rId = String(msg.roomId).slice(0, 128);
          const msgId = String(msg.id || 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
          const list = serverRoomMessages.get(rId) || [];
          if (list.some((m) => m.id === msgId)) {
            return;
          }

          const authorSavedAvatar =
            persistentStore.userAvatars[existing.uid] || existing.avatarUrl;
          const newMsg: StoredMessage = {
            id: msgId,
            roomId: rId,
            authorUid: existing.uid,
            authorUsername: existing.username,
            authorRole: existing.role,
            authorAvatarUrl: authorSavedAvatar,
            authorAvatarColor: existing.avatarColor,
            text: rawText,
            category: typeof msg.category === 'string' ? msg.category : undefined,
            replyToId: typeof msg.replyToId === 'string' ? msg.replyToId : undefined,
            replyToUsername:
              typeof msg.replyToUsername === 'string' ? msg.replyToUsername : undefined,
            replyToPreview:
              typeof msg.replyToPreview === 'string' ? msg.replyToPreview : undefined,
            imageUrl: typeof msg.imageUrl === 'string' ? msg.imageUrl : undefined,
            audioUrl: typeof msg.audioUrl === 'string' ? msg.audioUrl : undefined,
            audioDurationSec:
              typeof msg.audioDurationSec === 'number' ? msg.audioDurationSec : undefined,
            isPublic: true,
            createdAtIso: new Date().toISOString(),
          };
          list.push(newMsg);
          if (list.length > 120) list.shift();
          serverRoomMessages.set(rId, list);
          syncRoomMessagesToStore(rId);

          broadcastAll({
            type: 'chat:message:new',
            message: newMsg,
          });
          return;
        }

        // Delete Text or Recorded Audio Message (Allowed for message author, moderator, or admin)
        if (msg.type === 'chat:message:delete' && msg.msgId && msg.roomId) {
          const rId = String(msg.roomId);
          const targetMsgId = String(msg.msgId);
          const list = serverRoomMessages.get(rId) || [];
          serverRoomMessages.set(
            rId,
            list.filter((m) => m.id !== targetMsgId)
          );
          syncRoomMessagesToStore(rId);
          broadcastAll({
            type: 'chat:message:deleted',
            msgId: targetMsgId,
            roomId: rId,
          });
          return;
        }

        // STRICTLY ISOLATED PRIVATE DIRECT MESSAGES (Only delivered to senderUid and recipientUid — NO 3RD PARTY!)
        if (msg.type === 'dm:send' && msg.recipientUid) {
          const rawText = String(msg.text || '').slice(0, 1000);
          if (containsServerProfanity(rawText)) {
            ws.send(
              JSON.stringify({
                type: 'chat:profanity_blocked',
                reason: 'Message contains inappropriate language.',
              })
            );
            return;
          }

          const recipientUid = String(msg.recipientUid);
          const threadId = [existing.uid, recipientUid].sort().join('__');
          const senderSavedAvatar =
            persistentStore.userAvatars[existing.uid] || existing.avatarUrl;

          const newDm: StoredPrivateMessage = {
            id: String(msg.id || 'dm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)),
            threadId,
            senderUid: existing.uid,
            senderUsername: existing.username,
            senderRole: existing.role,
            senderAvatarUrl: senderSavedAvatar,
            senderAvatarColor: existing.avatarColor,
            recipientUid,
            recipientUsername: String(msg.recipientUsername || 'عضو'),
            text: rawText,
            category: String(msg.category || 'عام'),
            replyToId: typeof msg.replyToId === 'string' ? msg.replyToId : undefined,
            replyToUsername:
              typeof msg.replyToUsername === 'string' ? msg.replyToUsername : undefined,
            replyToPreview:
              typeof msg.replyToPreview === 'string' ? msg.replyToPreview : undefined,
            imageUrl: typeof msg.imageUrl === 'string' ? msg.imageUrl : undefined,
            audioUrl: typeof msg.audioUrl === 'string' ? msg.audioUrl : undefined,
            audioDurationSec:
              typeof msg.audioDurationSec === 'number' ? msg.audioDurationSec : undefined,
            createdAtIso: new Date().toISOString(),
          };

          const threadList = persistentStore.privateThreads[threadId] || [];
          threadList.push(newDm);
          if (threadList.length > 100) threadList.shift();
          persistentStore.privateThreads[threadId] = threadList;
          savePersistentStore(persistentStore);

          const dmPayload = JSON.stringify({
            type: 'dm:new',
            message: newDm,
          });

          // Deliver ONLY to sockets belonging to existing.uid or recipientUid (Zero Third-Party Interception!)
          for (const [clientWs, clientUser] of clients.entries()) {
            if (
              clientWs.readyState === WebSocket.OPEN &&
              (clientUser.uid === existing.uid || clientUser.uid === recipientUid)
            ) {
              clientWs.send(dmPayload);
            }
          }
          return;
        }

        // Delete a Private Direct Message (Text or Voice Note) by its sender
        if (msg.type === 'dm:delete' && msg.msgId && msg.threadId) {
          const threadId = String(msg.threadId);
          const targetMsgId = String(msg.msgId);
          const threadList = persistentStore.privateThreads[threadId] || [];
          const found = threadList.find((m) => m.id === targetMsgId);
          if (found && found.senderUid === existing.uid) {
            persistentStore.privateThreads[threadId] = threadList.filter(
              (m) => m.id !== targetMsgId
            );
            savePersistentStore(persistentStore);

            const delPayload = JSON.stringify({
              type: 'dm:deleted',
              msgId: targetMsgId,
              threadId,
            });

            for (const [clientWs, clientUser] of clients.entries()) {
              if (
                clientWs.readyState === WebSocket.OPEN &&
                (clientUser.uid === found.senderUid ||
                  clientUser.uid === found.recipientUid)
              ) {
                clientWs.send(delPayload);
              }
            }
          }
          return;
        }

        if (msg.type === 'ticker:update' && msg.slot) {
          broadcastAll({
            type: 'ticker:updated',
            slot: msg.slot,
          });
          return;
        }
      } catch {
        // Ignore malformed JSON frames
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      broadcastPresence();
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`HUB server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
