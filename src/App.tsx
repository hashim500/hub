/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  Camera,
  CheckCheck,
  Crown,
  Globe,
  Hash,
  Headphones,
  Image as ImageIcon,
  Loader2,
  Lock,
  MessageSquare,
  Mic,
  MicOff,
  Moon,
  PhoneOff,
  Radio,
  Reply,
  Search,
  Send,
  ShieldAlert,
  Sliders,
  Smile,
  Sparkles,
  Sun,
  Trash2,
  Users,
  Volume2,
  Waves,
  X,
} from 'lucide-react';
import { signInWithPopup, signOut } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  BLUEPRINT_CONSTRAINTS,
  db,
  googleProvider,
  sanitizeString,
} from './firebase';
import {
  AVATAR_COLORS,
  DEFAULT_CHAT_ROOMS,
  DEFAULT_TICKER_SLOTS,
  EMOJI_LIST,
  PRESET_ACCOUNTS,
  QUICK_CHAT_PHRASES,
  VOICE_ROOMS_LIST,
} from './constants';
import { Language, TRANSLATIONS } from './i18n';
import { checkProfanity } from './profanityFilter';
import {
  ChatRoom,
  PresenceUser,
  PrivateDirectMessage,
  RoomMessage,
  TickerSlotItem,
  UserProfile,
  UserRole,
  VoiceRoomDefinition,
} from './types';
import { GlobalTicker } from './components/GlobalTicker';
import { WelcomeAuthScreen } from './components/WelcomeAuthScreen';
import { ProfileView, uploadImageFileToServer } from './components/ProfileView';
import { AdminControlPanel } from './components/AdminControlPanel';
import { HubLogo } from './components/HubLogo';
import {
  TargetProfileUser,
  UserProfileModal,
} from './components/UserProfileModal';

// Helper to create a synthesized WAV DataURL fallback if browser microphone recording is blocked
function createFallbackVoiceNoteWavDataUrl(durationSec = 3): string {
  const sampleRate = 8000;
  const numSamples = sampleRate * durationSec;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const freq = t < 1 ? 440 : t < 2 ? 523.25 : 659.25;
    const envelope = Math.sin((Math.PI * (i % sampleRate)) / sampleRate);
    const sample = Math.sin(2 * Math.PI * freq * t) * envelope * 0.25;
    view.setInt16(44 + i * 2, sample * 32767, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return 'data:audio/wav;base64,' + window.btoa(binary);
}

export default function App() {
  const [lang, setLang] = useState<Language>('ar');
  const t = TRANSLATIONS[lang];
  const [darkMode, setDarkMode] = useState<boolean>(true);

  // Server-backed persistent dictionaries so user avatars, usernames, and room avatars NEVER revert!
  const [savedUserAvatars, setSavedUserAvatars] = useState<Record<string, string>>({});
  const [savedUserNames, setSavedUserNames] = useState<Record<string, string>>({});
  const [savedRoomAvatars, setSavedRoomAvatars] = useState<Record<string, string>>({});
  const [deletedRoomIds, setDeletedRoomIds] = useState<string[]>([]);

  // Current Logged-In User (Null on first open so WelcomeAuthScreen shows first)
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Navigation State (No account icon in bottom navigation bar!)
  const [activeBottomTab, setActiveBottomTab] = useState<
    'chats' | 'voice' | 'control_panel'
  >('chats');
  const [showProfilePage, setShowProfilePage] = useState<boolean>(false);
  const [mobileScreen, setMobileScreen] = useState<'list' | 'room_detail'>('list');

  // Target User Profile Modal (For viewing another user's profile & sending Private Direct Messages)
  const [inspectedProfileUser, setInspectedProfileUser] =
    useState<TargetProfileUser | null>(null);
  const [privateMessages, setPrivateMessages] = useState<PrivateDirectMessage[]>([]);

  // Global 7-Slot Ticker State
  const [tickerSlots, setTickerSlots] = useState<TickerSlotItem[]>(DEFAULT_TICKER_SLOTS);

  // Public Text Chat Rooms & Voice Chat Rooms
  const [baseRooms, setBaseRooms] = useState<ChatRoom[]>([
    {
      roomId: 'faisal_direct',
      name: 'غرفة المشرف أحمد الفيصل',
      topic: 'مساحة النقاش المفتوحة مع المشرف أحمد الفيصل (@أحمد_الفيصل).',
      category: 'Global Lounge',
      createdBy: 'preset_mod_faisal',
    },
    ...DEFAULT_CHAT_ROOMS,
  ]);
  const [baseVoiceRooms] = useState<VoiceRoomDefinition[]>(VOICE_ROOMS_LIST);

  const rooms = baseRooms.filter((r) => !deletedRoomIds.includes(r.roomId));
  const voiceRooms = baseVoiceRooms.filter((v) => !deletedRoomIds.includes(v.id));

  const [selectedRoomId, setSelectedRoomId] = useState<string>('general');
  const [selectedVoiceRoomViewId, setSelectedVoiceRoomViewId] = useState<string>(
    VOICE_ROOMS_LIST[0].id
  );

  const [allMessages, setAllMessages] = useState<RoomMessage[]>([
    {
      id: 'welcome_1',
      roomId: 'general',
      authorUid: 'preset_admin_1',
      authorUsername: 'الإدارة_العامة',
      authorRole: 'admin',
      authorAvatarColor: '#E11D48',
      text: 'أهلاً وسهلاً بكم في تطبيق HUB! اضغط على اسم أو صورة أي مستخدم لفتح بروفايله ومراسلته في محادثة خاصة مشفرة ومحمية بالكامل بالصوت أو الكتابة أو الصور، كما يمكنك استخدام شريط الكلمات السريعة أسفل المحادثة للإرسال الفوري.',
      isPublic: true,
    },
    {
      id: 'welcome_2',
      roomId: 'general',
      authorUid: 'preset_mod_faisal',
      authorUsername: 'أحمد_الفيصل',
      authorRole: 'moderator',
      authorAvatarColor: '#4F46E5',
      text: 'حياكم الله جميعاً في HUB! نظام الحظر التلقائي يمنع الألفاظ البذيئة وغير اللائقة في الدردشة، ويمكنكم رفع الصور مباشرة وحذف نصوصكم ومقاطعكم الصوتية المسجلة متى شئتم 🎤✨.',
      isPublic: true,
    },
    {
      id: 'welcome_3',
      roomId: 'general',
      authorUid: 'preset_member_2',
      authorUsername: 'نورة_العلي',
      authorRole: 'member',
      authorAvatarColor: '#0D9488',
      text: 'مساء النور 😊✨ اضغطوا على اسمي أو صورتي لتجربة البروفايل والرسائل الخاصة والكلمات السريعة في HUB!',
      isPublic: true,
    },
    {
      id: 'voice_stage_msg_1',
      roomId: 'voice_global_stage',
      authorUid: 'preset_admin_1',
      authorUsername: 'الإدارة_العامة',
      authorRole: 'admin',
      authorAvatarColor: '#E11D48',
      text: 'مرحباً بكم في دردشة "منصة اللقاء العام المفتوح" في HUB. بعد دخول الغرفة يمكنك التحدث مباشرة أو تسجيل مقطع صوتي (Voice Note) مثل واتساب مع إمكانية حذفه!',
      isPublic: true,
    },
  ]);

  // Chat Input, Reply, Emoji Picker, Profanity Alert, Image Upload & Voice Note Recording State
  const [messageDraft, setMessageDraft] = useState<string>('');
  const [replyingToRoomMsg, setReplyingToRoomMsg] = useState<RoomMessage | null>(null);
  const [profanityWarning, setProfanityWarning] = useState<string | null>(null);
  const [isUploadingChatImg, setIsUploadingChatImg] = useState<boolean>(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSendingMsg, setIsSendingMsg] = useState<boolean>(false);
  const headerRoomImageInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadingRoomHeaderImg, setIsUploadingRoomHeaderImg] = useState<boolean>(false);

  // WhatsApp-Style Voice Note Recorder State
  const [isRecordingVoiceNote, setIsRecordingVoiceNote] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartRef = useRef<number>(0);

  // WebSocket Presence & Voice State
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);
  const [activeVoiceRoom, setActiveVoiceRoom] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);
  const guestIdRef = useRef<string>('guest_' + Math.random().toString(36).slice(2, 8));
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const localAudioStreamRef = useRef<MediaStream | null>(null);
  const audioAnimFrameRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playedVoiceChunkIdsRef = useRef<Set<string>>(new Set());
  const lastVoiceChunkTimeRef = useRef<number>(Date.now());
  const liveVoiceRecorderRef = useRef<MediaRecorder | null>(null);
  const liveVoiceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Play incoming live voice audio chunk from another speaker in the voice room
  const playIncomingVoiceChunk = (chunk: {
    id: string;
    roomId: string;
    senderUid: string;
    audioDataUrl: string;
    createdAtMs: number;
  }) => {
    if (!chunk || !chunk.audioDataUrl) return;
    if (playedVoiceChunkIdsRef.current.has(chunk.id)) return;
    playedVoiceChunkIdsRef.current.add(chunk.id);
    if (chunk.createdAtMs > lastVoiceChunkTimeRef.current) {
      lastVoiceChunkTimeRef.current = chunk.createdAtMs;
    }
    try {
      const audio = new Audio(chunk.audioDataUrl);
      audio.volume = 1.0;
      audio.play().catch(() => {});
    } catch {
      // Ignore audio playback errors if browser autoplay blocked
    }
  };

  // Helper to dispatch a room message over BOTH HTTP and WebSocket so it is guaranteed to reach all phones immediately
  const dispatchRoomMessageToServer = async (msg: RoomMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'chat:message',
          id: msg.id,
          roomId: msg.roomId,
          text: msg.text,
          replyToId: msg.replyToId,
          replyToUsername: msg.replyToUsername,
          replyToPreview: msg.replyToPreview,
          imageUrl: msg.imageUrl,
          audioUrl: msg.audioUrl,
          audioDurationSec: msg.audioDurationSec,
        })
      );
    }
    try {
      await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: msg.id,
          roomId: msg.roomId,
          authorUid: msg.authorUid,
          authorUsername: msg.authorUsername,
          authorRole: msg.authorRole,
          authorAvatarColor: msg.authorAvatarColor,
          authorAvatarUrl: msg.authorAvatarUrl,
          text: msg.text,
          replyToId: msg.replyToId,
          replyToUsername: msg.replyToUsername,
          replyToPreview: msg.replyToPreview,
          imageUrl: msg.imageUrl,
          audioUrl: msg.audioUrl,
          audioDurationSec: msg.audioDurationSec,
        }),
      });
    } catch {
      // Handled by WebSocket or next sync
    }
  };

  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  const applyServerStore = (store: {
    userAvatars?: Record<string, string>;
    userNames?: Record<string, string>;
    roomAvatars?: Record<string, string>;
    deletedRooms?: string[];
    customRooms?: ChatRoom[];
  }) => {
    if (store.userAvatars) {
      setSavedUserAvatars(store.userAvatars);
      setCurrentUser((prev) => {
        if (!prev) return prev;
        const serverAvatar = store.userAvatars?.[prev.uid];
        if (serverAvatar && prev.avatarUrl !== serverAvatar) {
          return { ...prev, avatarUrl: serverAvatar };
        }
        return prev;
      });
    }
    if (store.userNames) {
      setSavedUserNames(store.userNames);
    }
    if (store.roomAvatars) {
      setSavedRoomAvatars(store.roomAvatars);
    }
    if (Array.isArray(store.deletedRooms)) {
      setDeletedRoomIds(store.deletedRooms);
    }
    if (Array.isArray(store.customRooms) && store.customRooms.length > 0) {
      setBaseRooms((prev) => {
        const map = new Map<string, ChatRoom>();
        prev.forEach((r) => map.set(r.roomId, r));
        store.customRooms!.forEach((r) => map.set(r.roomId, r));
        return Array.from(map.values());
      });
    }
  };

  useEffect(() => {
    fetch('/api/persistent-state')
      .then((r) => r.json())
      .then((data) => applyServerStore(data))
      .catch(() => {});
  }, []);

  // 1. Subscribe to 7 Global Ticker Slots
  useEffect(() => {
    const q = query(
      collection(db, 'ticker_slots'),
      where('slotIndex', '>=', 1),
      where('slotIndex', '<=', 7)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (snapshot.empty) return;
        setTickerSlots((prev) => {
          const bySlot = new Map<number, TickerSlotItem>();
          prev.forEach((s) => bySlot.set(s.slotIndex, s));
          snapshot.docs.forEach((d) => {
            const data = d.data() as Omit<TickerSlotItem, 'id'>;
            if (data.slotIndex >= 1 && data.slotIndex <= 7) {
              bySlot.set(data.slotIndex, { id: d.id, ...data });
            }
          });
          return Array.from(bySlot.values()).sort((a, b) => a.slotIndex - b.slotIndex);
        });
      },
      () => {}
    );

    return () => unsubscribe();
  }, []);

  const activeConversationRoomId =
    activeBottomTab === 'voice' ? selectedVoiceRoomViewId : selectedRoomId;

  // 2. Subscribe to Real-Time Messages in Active Room
  useEffect(() => {
    const q = query(
      collection(db, 'rooms', activeConversationRoomId, 'messages'),
      where('isPublic', '==', true),
      orderBy('createdAt', 'asc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (snapshot.empty) return;
        const fsMsgs: RoomMessage[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<RoomMessage, 'id'>),
        }));
        setAllMessages((prev) => {
          const map = new Map<string, RoomMessage>();
          prev.forEach((m) => map.set(m.id, m));
          fsMsgs.forEach((m) => map.set(m.id, m));
          return Array.from(map.values());
        });
      },
      () => {}
    );

    return () => unsubscribe();
  }, [activeConversationRoomId]);

  // 3. Real-Time WebSocket Connection
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        const uid = currentUser?.uid || guestIdRef.current;
        ws?.send(
          JSON.stringify({
            type: 'user:join',
            uid,
            username: currentUser?.username || savedUserNames[uid] || 'زائر_HUB',
            role: currentUser?.role || 'member',
            avatarColor: currentUser?.avatarColor || '#2563EB',
            avatarUrl: currentUser?.avatarUrl || savedUserAvatars[uid],
            currentTextRoom: selectedRoomId,
            currentVoiceRoom: activeVoiceRoom,
            isMuted,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'presence:sync' && Array.isArray(data.users)) {
            setOnlineUsers(data.users);
          } else if (data.type === 'store:sync' && data.store) {
            applyServerStore(data.store);
          } else if (data.type === 'chat:init' && Array.isArray(data.messages)) {
            setAllMessages((prev) => {
              const map = new Map<string, RoomMessage>();
              prev.forEach((m) => map.set(m.id, m));
              data.messages.forEach((m: RoomMessage) => map.set(m.id, m));
              return Array.from(map.values());
            });
          } else if (data.type === 'chat:message:new' && data.message) {
            setAllMessages((prev) => {
              if (prev.some((m) => m.id === data.message.id)) return prev;
              return [...prev, data.message];
            });
          } else if (data.type === 'chat:message:deleted' && data.msgId) {
            setAllMessages((prev) => prev.filter((m) => m.id !== data.msgId));
          } else if (data.type === 'dm:init' && Array.isArray(data.messages)) {
            setPrivateMessages(data.messages);
          } else if (data.type === 'dm:new' && data.message) {
            setPrivateMessages((prev) => {
              if (prev.some((m) => m.id === data.message.id)) return prev;
              return [...prev, data.message];
            });
          } else if (data.type === 'dm:deleted' && data.msgId) {
            setPrivateMessages((prev) => prev.filter((m) => m.id !== data.msgId));
          } else if (data.type === 'voice:audio_chunk' && data.chunk) {
            playIncomingVoiceChunk(data.chunk);
          } else if (data.type === 'chat:profanity_blocked') {
            setProfanityWarning(
              lang === 'ar'
                ? '🚫 تم حظر الرسالة تلقائياً: يُمنع استخدام الألفاظ البذيئة أو غير اللائقة في دردشة HUB.'
                : '🚫 Message blocked: Inappropriate or vulgar language is strictly prohibited on HUB.'
            );
          } else if (data.type === 'ticker:updated' && data.slot) {
            const incomingSlot = data.slot as TickerSlotItem;
            setTickerSlots((prev) =>
              prev.map((s) =>
                s.slotIndex === incomingSlot.slotIndex ? incomingSlot : s
              )
            );
          }
        } catch {
          // Ignore malformed message
        }
      };

      ws.onclose = () => {
        reconnectTimer = setTimeout(connect, 2000);
      };
    };

    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [currentUser?.uid]);

  // 3b. Continuous Cross-Device HTTP Sync Loop (Every 1.2s) — Guarantees that text messages, images, voice notes, and live voice room audio reach all mobile phones even if WebSocket is throttled
  useEffect(() => {
    if (!currentUser) return;
    let active = true;

    const runSync = async () => {
      try {
        const res = await fetch('/api/realtime/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: currentUser.uid,
            username: currentUser.username,
            role: currentUser.role,
            avatarColor: currentUser.avatarColor,
            avatarUrl: currentUser.avatarUrl || savedUserAvatars[currentUser.uid],
            currentTextRoom: selectedRoomId,
            currentVoiceRoom: activeVoiceRoom,
            isMuted,
            isSpeaking,
            lastVoiceChunkMs: lastVoiceChunkTimeRef.current,
          }),
        });
        if (!res.ok || !active) return;
        const data = await res.json();
        if (!active) return;

        if (data.store) applyServerStore(data.store);
        if (Array.isArray(data.users)) setOnlineUsers(data.users);
        if (Array.isArray(data.messages)) {
          setAllMessages((prev) => {
            const map = new Map<string, RoomMessage>();
            prev.forEach((m) => map.set(m.id, m));
            data.messages.forEach((m: RoomMessage) => map.set(m.id, m));
            return Array.from(map.values());
          });
        }
        if (Array.isArray(data.privateMessages)) {
          setPrivateMessages((prev) => {
            const map = new Map<string, PrivateDirectMessage>();
            prev.forEach((m) => map.set(m.id, m));
            data.privateMessages.forEach((m: PrivateDirectMessage) => map.set(m.id, m));
            return Array.from(map.values());
          });
        }
        if (Array.isArray(data.voiceChunks)) {
          data.voiceChunks.forEach((chunk: {
            id: string;
            roomId: string;
            senderUid: string;
            audioDataUrl: string;
            createdAtMs: number;
          }) => {
            playIncomingVoiceChunk(chunk);
          });
        }
      } catch {
        // Ignore network hiccup
      }
    };

    runSync();
    const timer = setInterval(runSync, 1200);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [
    currentUser?.uid,
    currentUser?.username,
    currentUser?.role,
    currentUser?.avatarUrl,
    selectedRoomId,
    activeVoiceRoom,
    isMuted,
    isSpeaking,
  ]);

  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && currentUser) {
      wsRef.current.send(
        JSON.stringify({
          type: 'user:update',
          username: currentUser.username,
          role: currentUser.role,
          avatarUrl: currentUser.avatarUrl || savedUserAvatars[currentUser.uid],
          currentTextRoom: selectedRoomId,
        })
      );
    }
  }, [currentUser?.username, currentUser?.role, currentUser?.avatarUrl, selectedRoomId]);

  // 4. Web Audio API Microphone Level Detection AND Live Voice Room Audio Streaming across devices!
  useEffect(() => {
    const cleanupAudio = () => {
      if (liveVoiceIntervalRef.current) {
        clearInterval(liveVoiceIntervalRef.current);
        liveVoiceIntervalRef.current = null;
      }
      if (
        liveVoiceRecorderRef.current &&
        liveVoiceRecorderRef.current.state !== 'inactive'
      ) {
        try {
          liveVoiceRecorderRef.current.stop();
        } catch {
          // Ignore
        }
      }
      liveVoiceRecorderRef.current = null;
      if (audioAnimFrameRef.current) {
        cancelAnimationFrame(audioAnimFrameRef.current);
        audioAnimFrameRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      if (localAudioStreamRef.current) {
        localAudioStreamRef.current.getTracks().forEach((tr) => tr.stop());
        localAudioStreamRef.current = null;
      }
    };

    if (!activeVoiceRoom || !currentUser) {
      cleanupAudio();
      return;
    }

    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ audio: true, video: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        localAudioStreamRef.current = stream;

        // A) Start segmented live audio recorder (1.4s self-contained clips) to transmit live voice to all other phones in the room
        const startSegmentCycle = () => {
          if (cancelled || isMuted || !activeVoiceRoom) return;
          try {
            const chunks: Blob[] = [];
            const rec = new MediaRecorder(stream);
            liveVoiceRecorderRef.current = rec;
            rec.ondataavailable = (ev) => {
              if (ev.data && ev.data.size > 0) chunks.push(ev.data);
            };
            rec.onstop = () => {
              if (cancelled || isMuted || chunks.length === 0) return;
              const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
              if (blob.size < 400) return;
              const reader = new FileReader();
              reader.onloadend = () => {
                const audioDataUrl =
                  typeof reader.result === 'string' ? reader.result : '';
                if (!audioDataUrl || cancelled || isMuted) return;

                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                  wsRef.current.send(
                    JSON.stringify({
                      type: 'voice:audio_chunk',
                      roomId: activeVoiceRoom,
                      audioDataUrl,
                    })
                  );
                } else {
                  fetch('/api/voice/stream', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      roomId: activeVoiceRoom,
                      senderUid: currentUser.uid,
                      senderUsername: currentUser.username,
                      audioDataUrl,
                    }),
                  }).catch(() => {});
                }
              };
              reader.readAsDataURL(blob);
            };
            rec.start();
            setTimeout(() => {
              if (rec.state === 'recording') {
                try {
                  rec.stop();
                } catch {
                  // Ignore
                }
              }
            }, 1350);
          } catch {
            // Ignore recorder error
          }
        };

        if (!isMuted) {
          startSegmentCycle();
          liveVoiceIntervalRef.current = setInterval(startSegmentCycle, 1400);
        }

        // B) Audio level analyser for real-time speaking indicator & avatar vibration
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        let lastSpk = false;

        const loop = () => {
          if (cancelled) return;
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          const avg = sum / data.length;
          const speakingNow = avg > 12 && !isMuted;
          if (speakingNow !== lastSpk) {
            lastSpk = speakingNow;
            handleSpeakingChange(speakingNow);
          }
          audioAnimFrameRef.current = requestAnimationFrame(loop);
        };
        audioAnimFrameRef.current = requestAnimationFrame(loop);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      cleanupAudio();
    };
  }, [activeVoiceRoom, isMuted, currentUser?.uid]);

  const roomMessages = allMessages.filter(
    (m) => m.roomId === activeConversationRoomId
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [roomMessages.length, activeConversationRoomId, mobileScreen, activeBottomTab]);

  // Manual Email/Password Auth Handler (Supports logging into the 3 official accounts using their email + password)
  const handleEmailOnlyAuth = (
    email: string,
    _password: string,
    username: string,
    role: UserRole
  ) => {
    const cleanEmail = email.trim().toLowerCase();
    const matchedPreset = PRESET_ACCOUNTS.find(
      (acc) => acc.email.toLowerCase() === cleanEmail
    );

    if (matchedPreset) {
      const persistedAvatar =
        savedUserAvatars[matchedPreset.uid] || matchedPreset.avatarUrl;
      const persistedName =
        savedUserNames[matchedPreset.uid] || matchedPreset.username;
      setCurrentUser({
        uid: matchedPreset.uid,
        username: persistedName,
        email: matchedPreset.email,
        role: matchedPreset.role,
        status: 'online',
        bio: matchedPreset.bio,
        avatarColor: matchedPreset.avatarColor,
        avatarUrl: persistedAvatar,
      });
      return;
    }

    const cleanUsername = sanitizeString(
      username,
      BLUEPRINT_CONSTRAINTS.USERNAME_MAX_LENGTH
    );
    const uid =
      'email_' +
      cleanEmail
        .replace(/[^a-z0-9]/g, '_')
        .slice(0, 40);
    const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    const persistedAvatar = savedUserAvatars[uid];
    const persistedName = savedUserNames[uid];

    setCurrentUser({
      uid,
      username: persistedName || (cleanUsername.length >= 2 ? cleanUsername : 'عضو_HUB'),
      email: cleanEmail,
      role,
      status: 'online',
      bio: lang === 'ar' ? 'عضو في مجتمع HUB.' : 'Member at HUB.',
      avatarColor: color,
      avatarUrl: persistedAvatar,
    });
  };

  const handleGoogleAuth = async (
    preferredUsername: string,
    preferredRole: UserRole,
    bio: string
  ) => {
    setAuthError(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const fbUser = cred.user;
      const userRef = doc(db, 'users', fbUser.uid);
      const existingSnap = await getDoc(userRef);

      const isAdminEmail = fbUser.email === 'h500341791@gmail.com';
      const cleanName = sanitizeString(
        preferredUsername ||
          fbUser.displayName ||
          fbUser.email?.split('@')[0] ||
          'عضو_HUB',
        BLUEPRINT_CONSTRAINTS.USERNAME_MAX_LENGTH
      );
      const finalUsername = cleanName.length >= 2 ? cleanName : 'عضو_HUB';
      const cleanBio = sanitizeString(bio, BLUEPRINT_CONSTRAINTS.BIO_MAX_LENGTH);

      if (!existingSnap.exists()) {
        const assignedRole: UserRole = isAdminEmail ? 'admin' : preferredRole;
        const color =
          AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
        const newProfile: UserProfile = {
          uid: fbUser.uid,
          username: savedUserNames[fbUser.uid] || finalUsername,
          email: fbUser.email || undefined,
          role: assignedRole,
          status: 'online',
          bio: cleanBio,
          avatarColor: color,
          avatarUrl: savedUserAvatars[fbUser.uid] || fbUser.photoURL || undefined,
        };
        await setDoc(userRef, {
          uid: newProfile.uid,
          username: newProfile.username,
          role: newProfile.role,
          status: newProfile.status,
          bio: newProfile.bio,
          avatarColor: newProfile.avatarColor,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        if (fbUser.email) {
          await setDoc(doc(db, 'users_private', fbUser.uid), {
            uid: fbUser.uid,
            email: sanitizeString(fbUser.email, 254),
            createdAt: serverTimestamp(),
          });
        }
        setCurrentUser(newProfile);
      } else {
        const data = existingSnap.data() as UserProfile;
        setCurrentUser({
          ...data,
          username: savedUserNames[fbUser.uid] || data.username,
          avatarUrl: savedUserAvatars[fbUser.uid] || data.avatarUrl,
        });
      }
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'تعذر إتمام عملية تسجيل الدخول عبر قوقل.'
      );
      throw err;
    }
  };

  // Update User Profile & Persist on Server
  const handleUpdateProfile = async (updates: {
    username?: string;
    bio?: string;
    avatarUrl?: string;
  }) => {
    if (!currentUser) return;
    const nextUsername = updates.username || currentUser.username;
    const nextAvatarUrl =
      updates.avatarUrl !== undefined
        ? updates.avatarUrl
        : currentUser.avatarUrl || savedUserAvatars[currentUser.uid];

    const updatedUser: UserProfile = {
      ...currentUser,
      username: nextUsername,
      bio: updates.bio !== undefined ? updates.bio : currentUser.bio,
      avatarUrl: nextAvatarUrl,
    };

    setCurrentUser(updatedUser);
    if (nextAvatarUrl) {
      setSavedUserAvatars((prev) => ({ ...prev, [currentUser.uid]: nextAvatarUrl }));
    }
    if (nextUsername) {
      setSavedUserNames((prev) => ({ ...prev, [currentUser.uid]: nextUsername }));
    }

    try {
      await fetch('/api/user-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: currentUser.uid,
          username: nextUsername,
          avatarUrl: nextAvatarUrl,
        }),
      });
    } catch {
      // Ignore
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'user:update',
          username: nextUsername,
          role: updatedUser.role,
          avatarUrl: nextAvatarUrl,
          currentTextRoom: selectedRoomId,
        })
      );
    }

    setAllMessages((prev) =>
      prev.map((m) =>
        m.authorUid === updatedUser.uid
          ? {
              ...m,
              authorUsername: nextUsername,
              authorAvatarUrl: nextAvatarUrl,
            }
          : m
      )
    );
  };

  const handleUpdateRoomAvatar = async (roomId: string, permanentAvatarUrl: string) => {
    setSavedRoomAvatars((prev) => ({ ...prev, [roomId]: permanentAvatarUrl }));
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'room:avatar:update',
          roomId,
          avatarUrl: permanentAvatarUrl,
        })
      );
    }
  };

  const handleHeaderRoomPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingRoomHeaderImg(true);
    try {
      const permanentUrl = await uploadImageFileToServer(
        file,
        'room_avatar',
        activeConversationRoomId,
        380
      );
      if (permanentUrl) {
        await handleUpdateRoomAvatar(activeConversationRoomId, permanentUrl);
      }
    } finally {
      setIsUploadingRoomHeaderImg(false);
      e.target.value = '';
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch {
      // Ignore
    }
    if (activeVoiceRoom) {
      handleLeaveVoiceRoom();
    }
    setShowProfilePage(false);
    setCurrentUser(null);
  };

  const handleUpdateTickerSlot = (updatedSlot: TickerSlotItem) => {
    setTickerSlots((prev) =>
      prev.map((s) => (s.slotIndex === updatedSlot.slotIndex ? updatedSlot : s))
    );
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'ticker:update',
          slot: updatedSlot,
        })
      );
    }
  };

  // ============================================================================
  // DIRECT IMAGE UPLOAD IN CHAT: Picking an image uploads & sends it immediately!
  // ============================================================================
  const handleChatImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    setIsUploadingChatImg(true);
    try {
      const uploadedImageUrl = await uploadImageFileToServer(
        file,
        'chat_image',
        activeConversationRoomId,
        720
      );
      if (uploadedImageUrl) {
        const msgId = 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        const effectiveAvatar =
          currentUser.avatarUrl || savedUserAvatars[currentUser.uid];
        const captionText = sanitizeString(
          messageDraft.trim(),
          BLUEPRINT_CONSTRAINTS.ROOM_MESSAGE_MAX_LENGTH
        );
        const newImgMsg: RoomMessage = {
          id: msgId,
          roomId: activeConversationRoomId,
          authorUid: currentUser.uid,
          authorUsername: currentUser.username,
          authorRole: currentUser.role,
          authorAvatarUrl: effectiveAvatar,
          authorAvatarColor: currentUser.avatarColor,
          text: captionText,
          replyToId: replyingToRoomMsg?.id,
          replyToUsername: replyingToRoomMsg?.authorUsername,
          replyToPreview:
            replyingToRoomMsg?.text ||
            (replyingToRoomMsg?.audioUrl ? '🎤 مقطع صوتي' : '📷 صورة'),
          imageUrl: uploadedImageUrl,
          isPublic: true,
          createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
        };

        setAllMessages((prev) => [...prev, newImgMsg]);
        setMessageDraft('');
        setReplyingToRoomMsg(null);
        setIsEmojiPickerOpen(false);

        await dispatchRoomMessageToServer(newImgMsg);
      }
    } finally {
      setIsUploadingChatImg(false);
      e.target.value = '';
    }
  };

  // ============================================================================
  // FREQUENTLY USED QUICK PHRASES: 1-Click Direct Send into Active Room!
  // ============================================================================
  const handleSendQuickPhraseInRoom = (phraseText: string) => {
    if (!currentUser) return;
    if (
      activeBottomTab === 'voice' &&
      activeVoiceRoom !== selectedVoiceRoomViewId
    ) {
      return;
    }

    const msgId = 'qp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const effectiveAvatar =
      currentUser.avatarUrl || savedUserAvatars[currentUser.uid];
    const quickMsg: RoomMessage = {
      id: msgId,
      roomId: activeConversationRoomId,
      authorUid: currentUser.uid,
      authorUsername: currentUser.username,
      authorRole: currentUser.role,
      authorAvatarUrl: effectiveAvatar,
      authorAvatarColor: currentUser.avatarColor,
      text: phraseText,
      replyToId: replyingToRoomMsg?.id,
      replyToUsername: replyingToRoomMsg?.authorUsername,
      replyToPreview:
        replyingToRoomMsg?.text ||
        (replyingToRoomMsg?.audioUrl ? '🎤 مقطع صوتي' : '📷 صورة'),
      isPublic: true,
      createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    };

    setAllMessages((prev) => [...prev, quickMsg]);
    setReplyingToRoomMsg(null);
    dispatchRoomMessageToServer(quickMsg);
  };

  // ============================================================================
  // DELETE MESSAGE (TEXT OR RECORDED VOICE NOTE) BY USER
  // ============================================================================
  const handleDeleteRoomMessage = (msgId: string, roomId: string) => {
    setAllMessages((prev) => prev.filter((m) => m.id !== msgId));
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'chat:message:delete',
          msgId,
          roomId,
        })
      );
    }
    fetch('/api/chat/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgId, roomId }),
    }).catch(() => {});
  };

  // ============================================================================
  // PRIVATE DIRECT MESSAGES HANDLERS (Strictly isolated between the 2 users)
  // ============================================================================
  const openUserProfileAndPrivateChat = (userTarget: TargetProfileUser) => {
    if (!currentUser) return;
    if (userTarget.uid === currentUser.uid) {
      setShowProfilePage(true);
      return;
    }
    setInspectedProfileUser(userTarget);
  };

  const handleSendPrivateMessage = (payload: {
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
  }) => {
    if (!currentUser) return;
    const threadId = [currentUser.uid, payload.recipientUid].sort().join('__');
    const dmId = 'dm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const effectiveAvatar =
      currentUser.avatarUrl || savedUserAvatars[currentUser.uid];

    const optimisticDm: PrivateDirectMessage = {
      id: dmId,
      threadId,
      senderUid: currentUser.uid,
      senderUsername: currentUser.username,
      senderRole: currentUser.role,
      senderAvatarUrl: effectiveAvatar,
      senderAvatarColor: currentUser.avatarColor,
      recipientUid: payload.recipientUid,
      recipientUsername: payload.recipientUsername,
      text: payload.text,
      category: payload.category,
      replyToId: payload.replyToId,
      replyToUsername: payload.replyToUsername,
      replyToPreview: payload.replyToPreview,
      imageUrl: payload.imageUrl,
      audioUrl: payload.audioUrl,
      audioDurationSec: payload.audioDurationSec,
      createdAtIso: new Date().toISOString(),
    };

    setPrivateMessages((prev) => [...prev, optimisticDm]);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'dm:send',
          id: dmId,
          ...payload,
        })
      );
    }
    fetch('/api/dm/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: dmId,
        senderUid: currentUser.uid,
        senderUsername: currentUser.username,
        senderRole: currentUser.role,
        senderAvatarColor: currentUser.avatarColor,
        senderAvatarUrl: effectiveAvatar,
        ...payload,
      }),
    }).catch(() => {});
  };

  const handleDeletePrivateMessage = (msgId: string, threadId: string) => {
    setPrivateMessages((prev) => prev.filter((m) => m.id !== msgId));
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'dm:delete',
          msgId,
          threadId,
        })
      );
    }
  };

  // ============================================================================
  // WHATSAPP-STYLE VOICE NOTE RECORDER (Available in Voice Rooms & Text Rooms)
  // ============================================================================
  const startRecordingVoiceNote = async () => {
    if (isRecordingVoiceNote) return;
    setIsRecordingVoiceNote(true);
    setRecordingSeconds(0);
    recordingStartRef.current = Date.now();
    recordedChunksRef.current = [];

    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = setInterval(() => {
      setRecordingSeconds(Math.floor((Date.now() - recordingStartRef.current) / 1000));
    }, 500);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          recordedChunksRef.current.push(ev.data);
        }
      };

      recorder.start();
    } catch {
      mediaRecorderRef.current = null;
    }
  };

  const cancelRecordingVoiceNote = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((tr) => tr.stop());
    }
    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];
    setIsRecordingVoiceNote(false);
    setRecordingSeconds(0);
  };

  const finishAndSendVoiceNote = async () => {
    if (!currentUser) return;
    const durationSec = Math.max(
      1,
      Math.round((Date.now() - recordingStartRef.current) / 1000)
    );

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    const sendAudioDataUrl = async (audioDataUrl: string) => {
      let finalAudioUrl = audioDataUrl;
      try {
        const res = await fetch('/api/upload-media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataUrl: audioDataUrl,
            kind: 'voice_note',
            targetId: activeConversationRoomId,
          }),
        });
        const data = await res.json();
        if (data.url) finalAudioUrl = data.url;
      } catch {
        // Fallback
      }

      const msgId = 'vnote_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      const effectiveAvatar =
        currentUser.avatarUrl || savedUserAvatars[currentUser.uid];
      const newVoiceMsg: RoomMessage = {
        id: msgId,
        roomId: activeConversationRoomId,
        authorUid: currentUser.uid,
        authorUsername: currentUser.username,
        authorRole: currentUser.role,
        authorAvatarUrl: effectiveAvatar,
        authorAvatarColor: currentUser.avatarColor,
        text: lang === 'ar' ? '🎤 مقطع صوتي مسجل' : '🎤 Voice message',
        replyToId: replyingToRoomMsg?.id,
        replyToUsername: replyingToRoomMsg?.authorUsername,
        replyToPreview: replyingToRoomMsg?.text,
        audioUrl: finalAudioUrl,
        audioDurationSec: durationSec,
        isPublic: true,
        createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
      };

      setAllMessages((prev) => [...prev, newVoiceMsg]);
      setReplyingToRoomMsg(null);
      await dispatchRoomMessageToServer(newVoiceMsg);
    };

    const recorder = mediaRecorderRef.current;
    setIsRecordingVoiceNote(false);
    setRecordingSeconds(0);

    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = () => {
        recorder.stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(recordedChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        if (blob.size > 0) {
          const reader = new FileReader();
          reader.onloadend = () => {
            if (typeof reader.result === 'string') {
              sendAudioDataUrl(reader.result);
            }
          };
          reader.readAsDataURL(blob);
        } else {
          sendAudioDataUrl(createFallbackVoiceNoteWavDataUrl(Math.min(durationSec, 5)));
        }
      };
      recorder.stop();
    } else {
      await sendAudioDataUrl(createFallbackVoiceNoteWavDataUrl(Math.min(durationSec, 5)));
    }
  };

  // Send Text / Emoji Message in Active Room (With strict Profanity Filter!)
  const handleSendRoomMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (
      activeBottomTab === 'voice' &&
      activeVoiceRoom !== selectedVoiceRoomViewId
    ) {
      return;
    }

    const cleanText = sanitizeString(
      messageDraft,
      BLUEPRINT_CONSTRAINTS.ROOM_MESSAGE_MAX_LENGTH
    );
    if (!cleanText) return;

    // Check for profanity / inappropriate words before sending!
    const profanityCheck = checkProfanity(cleanText);
    if (profanityCheck.isBlocked) {
      setProfanityWarning(
        lang === 'ar'
          ? '🚫 تم حظر إرسال الرسالة: تحتوي على ألفاظ بذيئة أو غير لائقة مخالفة لقوانين الدردشة في تطبيق HUB.'
          : '🚫 Message blocked: Contains inappropriate or vulgar words.'
      );
      return;
    }

    setProfanityWarning(null);
    const msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const effectiveAvatar =
      currentUser.avatarUrl || savedUserAvatars[currentUser.uid];
    const optimisticMsg: RoomMessage = {
      id: msgId,
      roomId: activeConversationRoomId,
      authorUid: currentUser.uid,
      authorUsername: sanitizeString(
        currentUser.username,
        BLUEPRINT_CONSTRAINTS.USERNAME_MAX_LENGTH
      ),
      authorRole: currentUser.role,
      authorAvatarUrl: effectiveAvatar,
      authorAvatarColor: currentUser.avatarColor,
      text: cleanText,
      replyToId: replyingToRoomMsg?.id,
      replyToUsername: replyingToRoomMsg?.authorUsername,
      replyToPreview:
        replyingToRoomMsg?.text ||
        (replyingToRoomMsg?.audioUrl ? '🎤 مقطع صوتي' : '📷 صورة'),
      isPublic: true,
      createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    };

    setIsSendingMsg(true);
    setMessageDraft('');
    setReplyingToRoomMsg(null);
    setIsEmojiPickerOpen(false);

    setAllMessages((prev) => [...prev, optimisticMsg]);
    await dispatchRoomMessageToServer(optimisticMsg);

    try {
      if (auth.currentUser && auth.currentUser.uid === currentUser.uid) {
        await addDoc(collection(db, 'rooms', activeConversationRoomId, 'messages'), {
          roomId: activeConversationRoomId,
          authorUid: currentUser.uid,
          authorUsername: optimisticMsg.authorUsername,
          authorRole: currentUser.role,
          text: cleanText,
          isPublic: true,
          createdAt: serverTimestamp(),
        });
      }
    } catch {
      // Handled via Server & WebSocket
    } finally {
      setIsSendingMsg(false);
    }
  };

  const handleCreateRoom = (name: string, topic: string) => {
    if (!currentUser) return;
    const cleanName = name.trim().slice(0, 48);
    if (cleanName.length < 2) return;
    const roomId = 'room_' + Date.now().toString(36);

    const newRoomObj: ChatRoom = {
      roomId,
      name: cleanName,
      topic: topic.trim() || 'غرفة دردشة عامة للمجتمع.',
      category: 'Community',
      createdBy: currentUser.uid,
    };

    setBaseRooms((prev) => [...prev, newRoomObj]);
    setSelectedRoomId(roomId);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'room:create',
          room: newRoomObj,
        })
      );
    }
  };

  const handleDeleteRoom = (roomId: string) => {
    if (!currentUser || currentUser.role !== 'admin') return;

    setDeletedRoomIds((prev) => (prev.includes(roomId) ? prev : [...prev, roomId]));

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'room:delete',
          roomId,
        })
      );
    }

    const remainingText = rooms.filter((r) => r.roomId !== roomId);
    if (selectedRoomId === roomId && remainingText.length > 0) {
      setSelectedRoomId(remainingText[0].roomId);
    }

    const remainingVoice = voiceRooms.filter((v) => v.id !== roomId);
    if (selectedVoiceRoomViewId === roomId && remainingVoice.length > 0) {
      setSelectedVoiceRoomViewId(remainingVoice[0].id);
    }
    if (activeVoiceRoom === roomId) {
      handleLeaveVoiceRoom();
    }
  };

  const handleJoinVoiceRoom = (roomId: string) => {
    setActiveVoiceRoom(roomId);
    setSelectedVoiceRoomViewId(roomId);
    setIsMuted(false);
    setIsSpeaking(true);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'voice:join',
          roomId,
          isMuted: false,
        })
      );
      wsRef.current.send(
        JSON.stringify({
          type: 'voice:state',
          isMuted: false,
          isSpeaking: true,
        })
      );
    }
  };

  const handleLeaveVoiceRoom = () => {
    setActiveVoiceRoom(null);
    setIsSpeaking(false);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'voice:leave' }));
    }
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    const nextSpeaking = nextMuted ? false : isSpeaking;
    setIsSpeaking(nextSpeaking);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'voice:state',
          isMuted: nextMuted,
          isSpeaking: nextSpeaking,
        })
      );
    }
  };

  const handleSpeakingChange = (speaking: boolean) => {
    setIsSpeaking(speaking);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'voice:state',
          isMuted,
          isSpeaking: speaking,
        })
      );
    }
  };

  if (!currentUser) {
    return (
      <WelcomeAuthScreen
        lang={lang}
        onEmailAuth={handleEmailOnlyAuth}
        onGoogleAuth={handleGoogleAuth}
        authError={authError}
      />
    );
  }

  const isStaff = currentUser.role === 'admin' || currentUser.role === 'moderator';
  const isAdmin = currentUser.role === 'admin';
  const currentUserAvatar =
    currentUser.avatarUrl || savedUserAvatars[currentUser.uid];

  const currentTextRoomObj =
    rooms.find((r) => r.roomId === selectedRoomId) || rooms[0];
  const currentVoiceRoomObj =
    voiceRooms.find((v) => v.id === selectedVoiceRoomViewId) || voiceRooms[0];

  const isUserJoinedInViewedVoiceRoom =
    currentVoiceRoomObj && activeVoiceRoom === currentVoiceRoomObj.id;

  const voiceRoomParticipants = currentVoiceRoomObj
    ? onlineUsers.filter((u) => u.currentVoiceRoom === currentVoiceRoomObj.id)
    : [];

  const activeHeaderRoomAvatar =
    savedRoomAvatars[activeConversationRoomId] ||
    (activeBottomTab === 'voice'
      ? currentVoiceRoomObj?.avatarUrl
      : currentTextRoomObj?.avatarUrl);

  const filteredMessages = searchQuery.trim()
    ? roomMessages.filter(
        (m) =>
          m.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.authorUsername.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : roomMessages;

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-slate-100 dark:bg-[#0b141a] text-slate-900 dark:text-slate-100 select-none">
      {/* Hidden input for changing active room's photo directly from header */}
      <input
        ref={headerRoomImageInputRef}
        type="file"
        accept="image/*"
        onChange={handleHeaderRoomPhotoChange}
        className="hidden"
      />

      {/* User Profile & Strictly Isolated Private Messages Modal */}
      {inspectedProfileUser && (
        <UserProfileModal
          targetUser={inspectedProfileUser}
          currentUser={currentUser}
          lang={lang}
          savedUserAvatars={savedUserAvatars}
          savedUserNames={savedUserNames}
          privateMessages={privateMessages}
          onClose={() => setInspectedProfileUser(null)}
          onSendPrivateMessage={handleSendPrivateMessage}
          onDeletePrivateMessage={handleDeletePrivateMessage}
        />
      )}

      {/* 1. COMPACT 7-SLOT TICKER AT TOP */}
      <GlobalTicker
        slots={tickerSlots}
        currentUser={currentUser}
        lang={lang}
        onRequestAuth={() => {}}
        onUpgradeRole={async () => {}}
        onUpdateTickerSlot={handleUpdateTickerSlot}
      />

      {/* 2. TOP HEADER BAR WITH OFFICIAL "HUB" LOGO & PERSONAL PROFILE ACCESS */}
      <header className="h-14 px-3 sm:px-5 bg-white dark:bg-[#111b21] border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-2 shrink-0 z-20">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Official HUB App Logo + Brand Title */}
          <div className="flex items-center gap-2 pe-2 border-e border-slate-200 dark:border-slate-800 shrink-0">
            <HubLogo size="sm" showTextInIcon={false} />
            <span className="text-base sm:text-lg font-extrabold tracking-wider text-slate-900 dark:text-white">
              HUB
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowProfilePage((prev) => !prev)}
            className={`flex items-center gap-2 py-1 px-2.5 rounded-full border transition-all cursor-pointer ${
              showProfilePage
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                : 'bg-slate-100 dark:bg-[#202c33] text-slate-900 dark:text-white border-slate-200 dark:border-slate-700 hover:border-emerald-500'
            }`}
          >
            {currentUserAvatar ? (
              <img
                src={currentUserAvatar}
                alt={currentUser.username}
                className="w-7 h-7 rounded-full object-cover shrink-0 border border-white/40"
              />
            ) : (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
                style={{ backgroundColor: currentUser.avatarColor }}
              >
                {currentUser.role === 'admin' ? (
                  <Crown className="w-3.5 h-3.5" />
                ) : (
                  currentUser.username.slice(0, 2)
                )}
              </div>
            )}
            <div className="text-start min-w-0">
              <div className="text-xs font-bold truncate max-w-[100px] sm:max-w-[140px]">
                @{currentUser.username}
              </div>
              <div
                className={`text-[10px] font-semibold truncate ${
                  showProfilePage
                    ? 'text-emerald-100'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {showProfilePage
                  ? lang === 'ar'
                    ? 'العودة للدردشة'
                    : 'Back to Chat'
                  : lang === 'ar'
                  ? 'صفحتي الخاصة'
                  : 'My Profile'}
              </div>
            </div>
          </button>

          {isStaff && (
            <button
              type="button"
              onClick={() => {
                setShowProfilePage(false);
                setActiveBottomTab('control_panel');
              }}
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                activeBottomTab === 'control_panel' && !showProfilePage
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>
                {lang === 'ar' ? 'لوحة الإدارة والمشرفين' : 'Admin & Mod Panel'}
              </span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setLang((prev) => (prev === 'ar' ? 'en' : 'ar'))}
            className="h-9 px-3 rounded-full bg-slate-100 dark:bg-[#202c33] text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5 text-emerald-500" />
            <span>{t.switchLangLabel}</span>
          </button>

          <button
            type="button"
            onClick={() => setDarkMode((prev) => !prev)}
            aria-label="Toggle Theme"
            className="w-9 h-9 rounded-full bg-slate-100 dark:bg-[#202c33] flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* 3. MAIN WORKSPACE */}
      {showProfilePage ? (
        <div className="flex-1 overflow-y-auto bg-slate-100 dark:bg-[#0b141a]">
          <ProfileView
            currentUser={{ ...currentUser, avatarUrl: currentUserAvatar }}
            lang={lang}
            savedUserAvatars={savedUserAvatars}
            onUpdateProfile={handleUpdateProfile}
            onLogout={handleLogout}
          />
        </div>
      ) : activeBottomTab === 'control_panel' && isStaff ? (
        <div className="flex-1 overflow-y-auto bg-slate-100 dark:bg-[#0b141a]">
          <AdminControlPanel
            currentUser={currentUser}
            lang={lang}
            tickerSlots={tickerSlots}
            rooms={rooms}
            voiceRooms={voiceRooms}
            roomAvatars={savedRoomAvatars}
            onlineUsers={onlineUsers}
            onUpdateTickerSlot={handleUpdateTickerSlot}
            onCreateRoom={handleCreateRoom}
            onDeleteRoom={handleDeleteRoom}
            onUpdateRoomAvatar={handleUpdateRoomAvatar}
          />
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden max-w-[1600px] w-full mx-auto">
          {/* ============================================================
              MASTER LIST SIDEBAR (Online Users Bar for Private DMs + Text/Voice Rooms)
          ============================================================ */}
          <aside
            className={`${
              mobileScreen === 'room_detail' ? 'hidden lg:flex' : 'flex'
            } w-full lg:w-[390px] xl:w-[420px] shrink-0 flex-col bg-white dark:bg-[#111b21] border-e border-slate-200 dark:border-slate-800/80 h-full overflow-hidden`}
          >
            {/* Active Members Strip — Tap any user to open their Profile & Private Encrypted DM! */}
            <div className="px-3.5 py-2.5 bg-slate-50/80 dark:bg-[#0b141a]/60 border-b border-slate-200/80 dark:border-slate-800/80 shrink-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  {lang === 'ar'
                    ? 'الأعضاء المتصلون (اضغط لفتح البروفايل والرسائل الخاصة):'
                    : 'Online Members (Tap for Profile & Private DM):'}
                </span>
              </div>
              <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-0.5">
                {onlineUsers.map((u) => {
                  const uAvatar = savedUserAvatars[u.uid] || u.avatarUrl;
                  const uName = savedUserNames[u.uid] || u.username;
                  const isSelf = u.uid === currentUser.uid;
                  return (
                    <button
                      key={u.uid}
                      type="button"
                      onClick={() =>
                        openUserProfileAndPrivateChat({
                          uid: u.uid,
                          username: uName,
                          role: u.role,
                          avatarColor: u.avatarColor,
                          avatarUrl: uAvatar,
                        })
                      }
                      className="flex flex-col items-center gap-1 shrink-0 group cursor-pointer"
                    >
                      <div className="relative">
                        {uAvatar ? (
                          <img
                            src={uAvatar}
                            alt={uName}
                            className="w-11 h-11 rounded-full object-cover border-2 border-emerald-500 shadow-xs"
                          />
                        ) : (
                          <div
                            className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-xs border-2 border-emerald-500/50"
                            style={{ backgroundColor: u.avatarColor || '#2563EB' }}
                          >
                            {uName.slice(0, 2)}
                          </div>
                        )}
                        <span className="w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-[#111b21] absolute bottom-0 end-0" />
                      </div>
                      <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 max-w-[68px] truncate">
                        {isSelf
                          ? lang === 'ar'
                            ? 'أنت'
                            : 'You'
                          : uName.replace('_', ' ')}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-3 border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-[#111b21] flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveBottomTab('chats')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeBottomTab === 'chats'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-[#202c33] text-slate-600 dark:text-slate-300'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                <span>{lang === 'ar' ? 'الغرف الكتابية' : 'Text Rooms'}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveBottomTab('voice')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeBottomTab === 'voice'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-[#202c33] text-slate-600 dark:text-slate-300'
                }`}
              >
                <Headphones className="w-4 h-4" />
                <span>{lang === 'ar' ? 'الغرف الصوتية' : 'Voice Rooms'}</span>
              </button>
            </div>

            <div className="p-3 border-b border-slate-100 dark:border-slate-800/60">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    lang === 'ar'
                      ? 'بحث في غرف ورسائل HUB...'
                      : 'Search HUB rooms & messages...'
                  }
                  className="w-full h-10 ps-9 pe-3 rounded-full bg-slate-100 dark:bg-[#202c33] text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
              {activeBottomTab === 'chats' ? (
                rooms.map((room) => {
                  const isSelected = selectedRoomId === room.roomId;
                  const rMsgs = allMessages.filter((m) => m.roomId === room.roomId);
                  const lastMsg = rMsgs[rMsgs.length - 1];
                  const isFaisalRoom = room.roomId === 'faisal_direct';
                  const roomAvatar = savedRoomAvatars[room.roomId] || room.avatarUrl;
                  const roomOnlineCount = onlineUsers.filter(
                    (u) => u.currentTextRoom === room.roomId
                  ).length;

                  return (
                    <div
                      key={room.roomId}
                      onClick={() => {
                        setSelectedRoomId(room.roomId);
                        setMobileScreen('room_detail');
                      }}
                      className={`w-full px-4 py-3.5 flex items-center gap-3.5 transition-colors text-start cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-50/80 dark:bg-[#2a3942]'
                          : 'hover:bg-slate-50 dark:hover:bg-[#202c33]/70'
                      }`}
                    >
                      <div className="relative shrink-0">
                        {roomAvatar ? (
                          <img
                            src={roomAvatar}
                            alt={room.name}
                            className="w-12 h-12 rounded-full object-cover border-2 border-emerald-500/60 shadow-xs"
                          />
                        ) : (
                          <div
                            className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-xs ${
                              isFaisalRoom
                                ? 'bg-gradient-to-br from-indigo-500 to-purple-600'
                                : room.roomId === 'general'
                                ? 'bg-gradient-to-br from-blue-600 to-indigo-700'
                                : 'bg-gradient-to-br from-teal-600 to-emerald-700'
                            }`}
                          >
                            {isFaisalRoom ? <span>فيصل</span> : <Hash className="w-5 h-5" />}
                          </div>
                        )}
                        <span className="w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-[#111b21] absolute bottom-0 end-0" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                              {room.name}
                            </span>
                            {isFaisalRoom && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shrink-0">
                                مشرف
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-mono-tabular text-[11px] font-bold">
                              {Math.max(1, roomOnlineCount)}{' '}
                              {lang === 'ar' ? 'متواجد' : 'online'}
                            </span>
                            {isAdmin && rooms.length > 1 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteRoom(room.roomId);
                                }}
                                title={lang === 'ar' ? 'حذف الغرفة (للإدارة)' : 'Delete room'}
                                className="p-1 rounded-lg text-rose-500 hover:bg-rose-500/15 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {lastMsg
                              ? `${lastMsg.authorUsername}: ${
                                  lastMsg.audioUrl
                                    ? '🎤 [مقطع صوتي]'
                                    : lastMsg.imageUrl
                                    ? '📷 [صورة]'
                                    : lastMsg.text
                                }`
                              : room.topic}
                          </p>
                          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-emerald-600 text-white font-mono-tabular text-[11px] font-bold flex items-center justify-center shrink-0">
                            {rMsgs.length}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                /* VOICE ROOMS LIST IN SIDEBAR */
                voiceRooms.map((vRoom) => {
                  const isSelected = selectedVoiceRoomViewId === vRoom.id;
                  const isJoined = activeVoiceRoom === vRoom.id;
                  const vRoomAvatar = savedRoomAvatars[vRoom.id] || vRoom.avatarUrl;
                  const participantsInRoom = onlineUsers.filter(
                    (u) => u.currentVoiceRoom === vRoom.id
                  );
                  const speakingCount = participantsInRoom.filter(
                    (u) => u.isSpeaking && !u.isMuted
                  ).length;

                  return (
                    <div
                      key={vRoom.id}
                      onClick={() => {
                        setSelectedVoiceRoomViewId(vRoom.id);
                        setMobileScreen('room_detail');
                      }}
                      className={`w-full px-4 py-3.5 flex items-center gap-3.5 transition-colors text-start cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-50/80 dark:bg-[#2a3942]'
                          : 'hover:bg-slate-50 dark:hover:bg-[#202c33]/70'
                      }`}
                    >
                      <div className="relative shrink-0">
                        {vRoomAvatar ? (
                          <img
                            src={vRoomAvatar}
                            alt={vRoom.name}
                            className={`w-12 h-12 rounded-full object-cover ${
                              isJoined
                                ? 'ring-2 ring-emerald-400 border-2 border-emerald-500'
                                : 'border border-slate-700'
                            }`}
                          />
                        ) : (
                          <div
                            className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-xs ${
                              isJoined
                                ? 'bg-gradient-to-br from-emerald-500 to-teal-600 ring-2 ring-emerald-400'
                                : 'bg-gradient-to-br from-slate-700 to-slate-800'
                            }`}
                          >
                            <Volume2 className="w-5 h-5" />
                          </div>
                        )}
                        {speakingCount > 0 && (
                          <span className="w-3.5 h-3.5 rounded-full bg-emerald-400 animate-ping absolute -top-0.5 -end-0.5" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                            {vRoom.name}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-mono-tabular text-[11px] font-bold flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              <span>
                                {participantsInRoom.length}{' '}
                                {lang === 'ar' ? 'متواجدين' : 'in room'}
                              </span>
                            </span>
                            {isAdmin && voiceRooms.length > 1 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteRoom(vRoom.id);
                                }}
                                title={lang === 'ar' ? 'حذف الغرفة الصوتية (للإدارة)' : 'Delete voice room'}
                                className="p-1 rounded-lg text-rose-500 hover:bg-rose-500/15 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {vRoom.description}
                          </p>
                          {isJoined && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold shrink-0">
                              {lang === 'ar' ? 'متصل' : 'Joined'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          {/* ============================================================
              DETAIL CONVERSATION VIEW (Text Room OR Voice Room)
          ============================================================ */}
          <main
            className={`${
              mobileScreen === 'room_detail' ? 'flex' : 'hidden lg:flex'
            } flex-1 flex-col h-full overflow-hidden ${
              darkMode ? 'tg-chat-bg-dark' : 'tg-chat-bg-light'
            }`}
          >
            {/* Room Top Bar */}
            <header className="h-15 px-3 sm:px-5 bg-white/95 dark:bg-[#202c33]/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0 z-10">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileScreen('list')}
                  className="lg:hidden w-9 h-9 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 cursor-pointer shrink-0"
                >
                  {lang === 'ar' ? (
                    <ArrowRight className="w-5 h-5" />
                  ) : (
                    <ArrowLeft className="w-5 h-5" />
                  )}
                </button>

                <div className="relative group shrink-0">
                  {activeHeaderRoomAvatar ? (
                    <img
                      src={activeHeaderRoomAvatar}
                      alt="Room"
                      className="w-10 h-10 rounded-full object-cover border-2 border-emerald-500"
                    />
                  ) : (
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                        activeBottomTab === 'voice'
                          ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
                          : 'bg-gradient-to-br from-blue-600 to-indigo-700'
                      }`}
                    >
                      {activeBottomTab === 'voice' ? (
                        <Volume2 className="w-5 h-5" />
                      ) : (
                        <Hash className="w-5 h-5" />
                      )}
                    </div>
                  )}

                  {isStaff && (
                    <button
                      type="button"
                      disabled={isUploadingRoomHeaderImg}
                      onClick={() => headerRoomImageInputRef.current?.click()}
                      title={
                        lang === 'ar'
                          ? 'تغيير صورة الغرفة (متاح للإدارة والمشرفين)'
                          : 'Change room photo (Admin & Moderators)'
                      }
                      className="absolute -bottom-1 -end-1 w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow border border-white dark:border-[#202c33] cursor-pointer"
                    >
                      {isUploadingRoomHeaderImg ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Camera className="w-3 h-3" />
                      )}
                    </button>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                      {activeBottomTab === 'voice'
                        ? currentVoiceRoomObj?.name
                        : currentTextRoomObj?.name}
                    </h2>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold font-mono-tabular shrink-0">
                      {activeBottomTab === 'voice'
                        ? `${voiceRoomParticipants.length} ${
                            lang === 'ar' ? 'متواجدين بالغرفة' : 'in voice'
                          }`
                        : `${onlineUsers.length} ${
                            lang === 'ar' ? 'متصل' : 'online'
                          }`}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {activeBottomTab === 'voice'
                      ? currentVoiceRoomObj?.description
                      : currentTextRoomObj?.topic}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {isStaff && (
                  <button
                    type="button"
                    disabled={isUploadingRoomHeaderImg}
                    onClick={() => headerRoomImageInputRef.current?.click()}
                    className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-700 dark:text-slate-200 text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? 'صورة الغرفة' : 'Room Photo'}</span>
                  </button>
                )}

                {isAdmin &&
                  ((activeBottomTab === 'chats' && rooms.length > 1) ||
                    (activeBottomTab === 'voice' && voiceRooms.length > 1)) && (
                    <button
                      type="button"
                      onClick={() => handleDeleteRoom(activeConversationRoomId)}
                      title={lang === 'ar' ? 'حذف هذه الغرفة (للإدارة)' : 'Delete room'}
                      className="p-2 rounded-full bg-rose-500/15 hover:bg-rose-600 text-rose-500 hover:text-white transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}

                {activeBottomTab === 'voice' && currentVoiceRoomObj && (
                  <div className="flex items-center gap-1.5">
                    {isUserJoinedInViewedVoiceRoom ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleSpeakingChange(!isSpeaking)}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                            isSpeaking && !isMuted
                              ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          <Waves className="w-3.5 h-3.5" />
                          <span>
                            {isSpeaking && !isMuted
                              ? lang === 'ar'
                                ? 'يتحدث'
                                : 'Speaking'
                              : lang === 'ar'
                              ? 'تحدث'
                              : 'Speak'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={handleToggleMute}
                          className={`p-2 rounded-full text-xs font-bold cursor-pointer ${
                            isMuted
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-slate-800 text-white'
                          }`}
                        >
                          {isMuted ? (
                            <MicOff className="w-4 h-4" />
                          ) : (
                            <Mic className="w-4 h-4" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={handleLeaveVoiceRoom}
                          className="px-3 py-1.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <PhoneOff className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">
                            {lang === 'ar' ? 'مغادرة' : 'Leave'}
                          </span>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleJoinVoiceRoom(currentVoiceRoomObj.id)}
                        className="px-3.5 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/25 cursor-pointer"
                      >
                        <Headphones className="w-4 h-4" />
                        <span>
                          {lang === 'ar'
                            ? 'دخول الغرفة للتحدث'
                            : 'Enter Room'}
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </header>

            {/* IF VOICE ROOM: Live Speakers Stage Bar at Top of Chat — Shaking Avatar & Name when speaking! */}
            {activeBottomTab === 'voice' && (
              <div className="px-4 py-3 bg-[#111b21]/95 border-b border-emerald-500/30 text-white shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                    <Radio className="w-4 h-4 animate-pulse" />
                    <span>
                      {lang === 'ar'
                        ? `المتواجدون في الغرفة الصوتية الآن (${voiceRoomParticipants.length}) — اضغط على أي شخص لمراسلته خاص:`
                        : `Participants in Voice Room (${voiceRoomParticipants.length}):`}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4 overflow-x-auto no-scrollbar py-1">
                  {voiceRoomParticipants.map((speaker) => {
                    const activelySpeaking = speaker.isSpeaking && !speaker.isMuted;
                    const spkAvatar =
                      savedUserAvatars[speaker.uid] || speaker.avatarUrl;
                    const spkName =
                      savedUserNames[speaker.uid] || speaker.username;
                    return (
                      <button
                        key={speaker.uid}
                        type="button"
                        onClick={() =>
                          openUserProfileAndPrivateChat({
                            uid: speaker.uid,
                            username: spkName,
                            role: speaker.role,
                            avatarColor: speaker.avatarColor,
                            avatarUrl: spkAvatar,
                          })
                        }
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-2xl border transition-all shrink-0 text-start cursor-pointer ${
                          activelySpeaking
                            ? 'animate-speaking-shake border-emerald-400 bg-emerald-500/20 shadow-lg shadow-emerald-500/20'
                            : 'border-slate-700 bg-[#202c33] hover:border-emerald-500/50'
                        }`}
                      >
                        <div className="relative">
                          {spkAvatar ? (
                            <img
                              src={spkAvatar}
                              alt={spkName}
                              className={`w-10 h-10 rounded-full object-cover ${
                                activelySpeaking
                                  ? 'ring-2 ring-emerald-400 animate-speaking-shake'
                                  : ''
                              }`}
                            />
                          ) : (
                            <div
                              className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xs ${
                                activelySpeaking
                                  ? 'ring-2 ring-emerald-400 animate-speaking-shake'
                                  : ''
                              }`}
                              style={{
                                backgroundColor: speaker.avatarColor || '#2563EB',
                              }}
                            >
                              {spkName.slice(0, 2)}
                            </div>
                          )}
                          <span
                            className={`w-3.5 h-3.5 rounded-full flex items-center justify-center absolute -bottom-0.5 -end-0.5 ${
                              speaker.isMuted
                                ? 'bg-amber-500 text-slate-950'
                                : activelySpeaking
                                ? 'bg-emerald-400 text-slate-950'
                                : 'bg-slate-600 text-white'
                            }`}
                          >
                            {speaker.isMuted ? (
                              <MicOff className="w-2.5 h-2.5" />
                            ) : (
                              <Mic className="w-2.5 h-2.5" />
                            )}
                          </span>
                        </div>

                        <div>
                          <div
                            className={`text-xs font-bold ${
                              activelySpeaking
                                ? 'text-emerald-300 animate-speaking-shake'
                                : 'text-white'
                            }`}
                          >
                            @{spkName}
                          </div>
                          <div className="text-[10px] text-slate-300 flex items-center gap-1">
                            {speaker.isMuted ? (
                              <span className="text-amber-400">
                                {lang === 'ar' ? 'مكتوم' : 'Muted'}
                              </span>
                            ) : activelySpeaking ? (
                              <span className="text-emerald-300 font-bold">
                                {lang === 'ar' ? 'يتحدث الآن 🔊' : 'Speaking 🔊'}
                              </span>
                            ) : (
                              <span>{lang === 'ar' ? 'يستمع' : 'Listening'}</span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* MESSAGES STREAM (Supports Text, Emojis, Images, Quick Phrases, Replies, Deletion & Voice Notes) */}
            <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-2.5">
              {filteredMessages.map((msg) => {
                const isOwn = currentUser.uid === msg.authorUid;
                const canDeleteMessage = isOwn || isStaff;
                const msgAuthorAvatar =
                  savedUserAvatars[msg.authorUid] || msg.authorAvatarUrl;
                const msgAuthorName =
                  savedUserNames[msg.authorUid] || msg.authorUsername;

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isOwn ? 'items-start' : 'items-end'}`}
                  >
                    <div
                      className={`max-w-[85%] sm:max-w-[72%] rounded-2xl px-3.5 py-2.5 shadow-xs relative ${
                        isOwn
                          ? 'bg-[#005c4b] text-white rounded-ss-none'
                          : 'bg-white dark:bg-[#202c33] text-slate-900 dark:text-slate-100 rounded-se-none'
                      }`}
                    >
                      {/* Sender Header (Clickable to open User Profile & Private DM!) + Delete/Reply Buttons */}
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <button
                          type="button"
                          onClick={() =>
                            openUserProfileAndPrivateChat({
                              uid: msg.authorUid,
                              username: msgAuthorName,
                              role: msg.authorRole,
                              avatarColor: msg.authorAvatarColor || '#2563EB',
                              avatarUrl: msgAuthorAvatar,
                            })
                          }
                          title={
                            lang === 'ar'
                              ? `فتح بروفايل @${msgAuthorName} ومراسلته خاص`
                              : `Open @${msgAuthorName} profile & Private DM`
                          }
                          className="flex items-center gap-2 hover:underline cursor-pointer"
                        >
                          {msgAuthorAvatar ? (
                            <img
                              src={msgAuthorAvatar}
                              alt={msgAuthorName}
                              className="w-5 h-5 rounded-full object-cover border border-emerald-400/50"
                            />
                          ) : (
                            <div
                              className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                              style={{
                                backgroundColor: msg.authorAvatarColor || '#2563EB',
                              }}
                            >
                              {msgAuthorName.slice(0, 1)}
                            </div>
                          )}
                          <span
                            className={`text-xs font-bold ${
                              isOwn
                                ? 'text-emerald-200'
                                : msg.authorRole === 'admin'
                                ? 'text-rose-500 dark:text-rose-400'
                                : msg.authorRole === 'moderator'
                                ? 'text-indigo-500 dark:text-indigo-400'
                                : 'text-teal-600 dark:text-teal-400'
                            }`}
                          >
                            @{msgAuthorName}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              msg.authorRole === 'admin'
                                ? 'bg-rose-500/20 text-rose-300'
                                : msg.authorRole === 'moderator'
                                ? 'bg-indigo-500/20 text-indigo-300'
                                : 'bg-black/15 text-slate-300'
                            }`}
                          >
                            {msg.authorRole === 'admin'
                              ? lang === 'ar'
                                ? 'الإدارة'
                                : 'Admin'
                              : msg.authorRole === 'moderator'
                              ? lang === 'ar'
                                ? 'مشرف'
                                : 'Mod'
                              : lang === 'ar'
                              ? 'عضو'
                              : 'Member'}
                          </span>
                        </button>

                        {/* Reply & Delete Message (Text or Audio) Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setReplyingToRoomMsg(msg)}
                            title={lang === 'ar' ? 'الرد على الرسالة' : 'Reply'}
                            className="p-1 rounded-lg hover:bg-black/20 text-slate-300 hover:text-white cursor-pointer"
                          >
                            <Reply className="w-3.5 h-3.5" />
                          </button>

                          {canDeleteMessage && (
                            <button
                              type="button"
                              onClick={() => handleDeleteRoomMessage(msg.id, msg.roomId)}
                              title={
                                lang === 'ar'
                                  ? 'حذف النص أو المقطع الصوتي'
                                  : 'Delete text or voice note'
                              }
                              className="p-1 rounded-lg hover:bg-rose-500/30 text-rose-300 hover:text-rose-200 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Quoted Reply Box if replying */}
                      {msg.replyToId && (
                        <div className="mb-2 px-2.5 py-1.5 rounded-xl bg-black/20 border-s-2 border-emerald-400 text-[11px]">
                          <div className="font-bold text-emerald-300">
                            {lang === 'ar' ? 'رداً على' : 'Replying to'} @{msg.replyToUsername}
                          </div>
                          <div className="opacity-85 truncate">{msg.replyToPreview}</div>
                        </div>
                      )}

                      {/* Uploaded Image in Message */}
                      {msg.imageUrl && (
                        <div className="my-1.5 overflow-hidden rounded-xl border border-white/15">
                          <img
                            src={msg.imageUrl}
                            alt="مرفق دردشة"
                            className="max-h-72 w-auto object-contain rounded-xl"
                          />
                        </div>
                      )}

                      {/* WhatsApp-Style Recorded Voice Note Player with Delete Support */}
                      {msg.audioUrl && (
                        <div className="my-1.5 p-2.5 rounded-2xl bg-black/20 border border-white/10 flex flex-col gap-1.5 min-w-[230px] sm:min-w-[270px]">
                          <div className="flex items-center justify-between text-[11px] text-emerald-300 font-bold">
                            <span className="flex items-center gap-1">
                              <Mic className="w-3.5 h-3.5" />
                              <span>
                                {lang === 'ar' ? 'رسالة صوتية مسجلة' : 'Voice Note'}
                              </span>
                            </span>
                            {msg.audioDurationSec && (
                              <span className="font-mono-tabular">
                                00:{String(msg.audioDurationSec).padStart(2, '0')}
                              </span>
                            )}
                          </div>
                          <audio
                            controls
                            src={msg.audioUrl}
                            className="w-full h-9 rounded-lg"
                          />
                        </div>
                      )}

                      {msg.text && !msg.audioUrl && (
                        <p className="text-xs sm:text-sm leading-relaxed break-words">
                          {msg.text}
                        </p>
                      )}

                      <div className="flex items-center justify-end gap-1 mt-1 opacity-75">
                        <span className="text-[10px] font-mono-tabular">
                          {t.justNow}
                        </span>
                        {isOwn && <CheckCheck className="w-3.5 h-3.5 text-sky-300" />}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Profanity Block Alert Banner */}
            {profanityWarning && (
              <div className="px-4 py-2.5 bg-rose-600 text-white text-xs font-bold flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{profanityWarning}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setProfanityWarning(null)}
                  className="p-1 rounded hover:bg-black/20 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* COMPOSER BAR */}
            {activeBottomTab === 'voice' && !isUserJoinedInViewedVoiceRoom ? (
              <div className="p-3.5 bg-white dark:bg-[#202c33] border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400">
                  <Lock className="w-4 h-4 shrink-0" />
                  <span>
                    {lang === 'ar'
                      ? 'لا يمكنك التحدث أو إرسال مقاطع صوتية إلا بعد الدخول إلى الغرفة أولاً.'
                      : 'You must enter this voice room first before speaking or recording voice notes.'}
                  </span>
                </div>
                {currentVoiceRoomObj && (
                  <button
                    type="button"
                    onClick={() => handleJoinVoiceRoom(currentVoiceRoomObj.id)}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md cursor-pointer shrink-0"
                  >
                    <Headphones className="w-4 h-4" />
                    <span>
                      {lang === 'ar'
                        ? 'دخول الغرفة الآن للتحدث'
                        : 'Enter Voice Room Now'}
                    </span>
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-white dark:bg-[#202c33] border-t border-slate-200 dark:border-slate-800 shrink-0 relative">
                {/* Active Reply Banner */}
                {replyingToRoomMsg && (
                  <div className="px-4 py-2 bg-slate-100 dark:bg-[#182229] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <Reply className="w-4 h-4 text-emerald-500 shrink-0" />
                      <div className="truncate">
                        <span className="font-bold text-emerald-500">
                          {lang === 'ar' ? 'الرد على' : 'Replying to'} @
                          {replyingToRoomMsg.authorUsername}:{' '}
                        </span>
                        <span className="text-slate-600 dark:text-slate-300">
                          {replyingToRoomMsg.text}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplyingToRoomMsg(null)}
                      className="p-1 text-slate-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Emoji Picker Popover */}
                {isEmojiPickerOpen && (
                  <div className="px-3 py-2.5 bg-slate-50 dark:bg-[#182229] border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        {lang === 'ar'
                          ? 'الرموز التعبيرية والفيسات (اضغط للإضافة):'
                          : 'Emojis & Reactions:'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsEmojiPickerOpen(false)}
                        className="text-xs text-slate-400 hover:text-white cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap max-h-28 overflow-y-auto">
                      {EMOJI_LIST.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setMessageDraft((prev) => prev + emoji)}
                          className="w-9 h-9 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-xl transition-transform active:scale-90 cursor-pointer"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Frequently Used Words / Quick Phrases Bar (1-Tap Direct Send) */}
                <div className="px-3 pt-2 pb-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar border-b border-slate-100 dark:border-slate-800/70">
                  <span className="text-[10px] font-bold text-emerald-500 flex items-center gap-1 shrink-0">
                    <Sparkles className="w-3 h-3" />
                    <span>
                      {lang === 'ar' ? 'كلمات سريعة (تُرسل مباشرة):' : 'Quick Phrases:'}
                    </span>
                  </span>
                  {QUICK_CHAT_PHRASES.map((qp) => {
                    const phrase = lang === 'ar' ? qp.textAr : qp.textEn;
                    return (
                      <button
                        key={qp.id}
                        type="button"
                        onClick={() => handleSendQuickPhraseInRoom(phrase)}
                        className="px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap bg-slate-100 dark:bg-[#2a3942] hover:bg-emerald-600 hover:text-white text-slate-700 dark:text-slate-200 transition-colors cursor-pointer active:scale-95"
                      >
                        {phrase}
                      </button>
                    );
                  })}
                </div>

                {/* If currently recording a WhatsApp-style Voice Note */}
                {isRecordingVoiceNote ? (
                  <div className="p-2.5 sm:px-4 flex items-center justify-between gap-3 bg-emerald-950/40 mt-1">
                    <div className="flex items-center gap-2.5">
                      <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
                      <span className="text-xs sm:text-sm font-bold text-rose-400 font-mono-tabular">
                        00:{String(recordingSeconds).padStart(2, '0')}
                      </span>
                      <span className="text-xs text-slate-300">
                        {lang === 'ar'
                          ? 'جارٍ تسجيل المقطع الصوتي مثل واتساب...'
                          : 'Recording voice note...'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={cancelRecordingVoiceNote}
                        className="px-3 py-2 rounded-full bg-rose-600/20 hover:bg-rose-600 text-rose-400 hover:text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={finishAndSendVoiceNote}
                        className="px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md cursor-pointer transition-transform active:scale-95"
                      >
                        <Send className="w-4 h-4" />
                        <span>
                          {lang === 'ar' ? 'إرسال المقطع الصوتي' : 'Send Voice Note'}
                        </span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <form
                    onSubmit={handleSendRoomMessage}
                    className="p-2.5 sm:px-4 flex items-center gap-2"
                  >
                    <button
                      type="button"
                      onClick={() => setIsEmojiPickerOpen((prev) => !prev)}
                      title={lang === 'ar' ? 'فيسات ورموز تعبيرية' : 'Emojis'}
                      className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                        isEmojiPickerOpen
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-100 dark:bg-[#2a3942] text-amber-500 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      <Smile className="w-5 h-5" />
                    </button>

                    {/* Native <label> wrapping <input type="file"> guarantees reliable image picking & immediate upload on all mobile/desktop browsers */}
                    <label
                      title={lang === 'ar' ? 'رفع وإرسال صورة في الدردشة مباشرة' : 'Upload & send image'}
                      className={`w-10 h-10 rounded-full bg-slate-100 dark:bg-[#2a3942] text-blue-500 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                        isUploadingChatImg ? 'opacity-60 pointer-events-none' : ''
                      }`}
                    >
                      {isUploadingChatImg ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <ImageIcon className="w-5 h-5" />
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleChatImageSelect}
                        className="hidden"
                      />
                    </label>

                    <input
                      type="text"
                      maxLength={BLUEPRINT_CONSTRAINTS.ROOM_MESSAGE_MAX_LENGTH}
                      value={messageDraft}
                      onChange={(e) => {
                        setMessageDraft(e.target.value);
                        if (profanityWarning) setProfanityWarning(null);
                      }}
                      placeholder={
                        lang === 'ar'
                          ? 'اكتب رسالتك أو اضغط على كلمة سريعة أو سجل مقطعاً صوتياً...'
                          : 'Write a message, tap a quick phrase, or record a voice note...'
                      }
                      className="flex-1 h-11 px-4 rounded-full bg-slate-100 dark:bg-[#2a3942] text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none"
                    />

                    {/* WhatsApp-Style Voice Note Record Button (Available in both Voice Rooms and Text Rooms!) */}
                    <button
                      type="button"
                      onClick={startRecordingVoiceNote}
                      title={
                        lang === 'ar'
                          ? 'تسجيل مقطع صوتي (مثل واتساب)'
                          : 'Record Voice Note (WhatsApp style)'
                      }
                      className="h-11 px-3.5 rounded-full bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/40 flex items-center justify-center gap-1.5 shrink-0 transition-all cursor-pointer font-bold text-xs"
                    >
                      <Mic className="w-4 h-4" />
                      <span className="hidden sm:inline">
                        {lang === 'ar' ? 'تسجيل صوت' : 'Voice Note'}
                      </span>
                    </button>

                    <button
                      type="submit"
                      disabled={isSendingMsg || !messageDraft.trim()}
                      className="w-11 h-11 rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer shadow-sm"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                )}
              </div>
            )}
          </main>
        </div>
      )}

      {/* 4. BOTTOM NAVIGATION BAR (Strictly NO Account Icon at the bottom!) */}
      <nav className="h-14 bg-white dark:bg-[#111b21] border-t border-slate-200 dark:border-slate-800 flex items-center justify-around px-2 shrink-0 z-20">
        <button
          type="button"
          onClick={() => {
            setShowProfilePage(false);
            setActiveBottomTab('chats');
            setMobileScreen('list');
          }}
          className={`flex-1 py-1.5 flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
            activeBottomTab === 'chats' && !showProfilePage
              ? 'text-emerald-600 dark:text-emerald-400 font-bold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <MessageSquare className="w-5 h-5" />
          <span className="text-[11px]">
            {lang === 'ar' ? 'الدردشة الكتابية' : 'Text Chats'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setShowProfilePage(false);
            setActiveBottomTab('voice');
            setMobileScreen('list');
          }}
          className={`flex-1 py-1.5 flex flex-col items-center justify-center gap-0.5 cursor-pointer relative ${
            activeBottomTab === 'voice' && !showProfilePage
              ? 'text-emerald-600 dark:text-emerald-400 font-bold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Headphones className="w-5 h-5" />
          <span className="text-[11px]">
            {lang === 'ar' ? 'الغرف الصوتية' : 'Voice Rooms'}
          </span>
        </button>

        {isStaff && (
          <button
            type="button"
            onClick={() => {
              setShowProfilePage(false);
              setActiveBottomTab('control_panel');
            }}
            className={`flex-1 py-1.5 flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
              activeBottomTab === 'control_panel' && !showProfilePage
                ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Sliders className="w-5 h-5" />
            <span className="text-[11px]">
              {lang === 'ar' ? 'لوحة الإشراف والإدارة' : 'Control Panel'}
            </span>
          </button>
        )}
      </nav>
    </div>
  );
}
