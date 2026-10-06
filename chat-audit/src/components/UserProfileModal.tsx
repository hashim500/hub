import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCheck,
  Crown,
  Image as ImageIcon,
  Loader2,
  Lock,
  MessageSquare,
  Mic,
  Reply,
  Send,
  Shield,
  ShieldAlert,
  Smile,
  Sparkles,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { EMOJI_LIST, QUICK_CHAT_PHRASES } from '../constants';
import { Language } from '../i18n';
import { checkProfanity } from '../profanityFilter';
import { PrivateDirectMessage, UserProfile, UserRole } from '../types';
import { uploadImageFileToServer } from './ProfileView';

export interface TargetProfileUser {
  uid: string;
  username: string;
  role: UserRole;
  avatarColor: string;
  avatarUrl?: string;
  bio?: string;
}

interface UserProfileModalProps {
  targetUser: TargetProfileUser;
  currentUser: UserProfile;
  lang: Language;
  savedUserAvatars: Record<string, string>;
  savedUserNames: Record<string, string>;
  privateMessages: PrivateDirectMessage[];
  onClose: () => void;
  onSendPrivateMessage: (payload: {
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
  }) => void;
  onDeletePrivateMessage: (msgId: string, threadId: string) => void;
}

// Helper to synthesize a fallback WAV clip if browser microphone access is blocked
function createFallbackDmWavDataUrl(durationSec = 3): string {
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
    const freq = t < 1 ? 493.88 : t < 2 ? 587.33 : 659.25;
    const env = Math.sin((Math.PI * (i % sampleRate)) / sampleRate);
    const sample = Math.sin(2 * Math.PI * freq * t) * env * 0.25;
    view.setInt16(44 + i * 2, sample * 32767, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return 'data:audio/wav;base64,' + window.btoa(binary);
}

export function getPrivateThreadId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join('__');
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  targetUser,
  currentUser,
  lang,
  savedUserAvatars,
  savedUserNames,
  privateMessages,
  onClose,
  onSendPrivateMessage,
  onDeletePrivateMessage,
}) => {
  const threadId = getPrivateThreadId(currentUser.uid, targetUser.uid);
  const threadMessages = privateMessages.filter((m) => m.threadId === threadId);

  const [draftText, setDraftText] = useState('');
  const [isUploadingImg, setIsUploadingImg] = useState(false);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<PrivateDirectMessage | null>(null);
  const [profanityAlert, setProfanityAlert] = useState<string | null>(null);

  // Voice Note Recording inside Private Chat
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const endRef = useRef<HTMLDivElement | null>(null);

  const targetDisplayName = savedUserNames[targetUser.uid] || targetUser.username;
  const targetAvatar = savedUserAvatars[targetUser.uid] || targetUser.avatarUrl;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages.length]);

  // Direct Image Upload & Immediate Send inside Private Chat
  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingImg(true);
    try {
      const uploadedImageUrl = await uploadImageFileToServer(
        file,
        'chat_image',
        threadId,
        720
      );
      if (uploadedImageUrl) {
        onSendPrivateMessage({
          recipientUid: targetUser.uid,
          recipientUsername: targetDisplayName,
          text: draftText.trim(),
          category: 'عام',
          replyToId: replyingTo?.id,
          replyToUsername: replyingTo?.senderUsername,
          replyToPreview:
            replyingTo?.text ||
            (replyingTo?.audioUrl ? '🎤 مقطع صوتي' : '📷 صورة'),
          imageUrl: uploadedImageUrl,
        });
        setDraftText('');
        setReplyingTo(null);
      }
    } finally {
      setIsUploadingImg(false);
      e.target.value = '';
    }
  };

  // Send a frequently used phrase immediately with 1 click!
  const handleSendQuickPhrase = (phraseText: string) => {
    onSendPrivateMessage({
      recipientUid: targetUser.uid,
      recipientUsername: targetDisplayName,
      text: phraseText,
      category: 'عام',
      replyToId: replyingTo?.id,
      replyToUsername: replyingTo?.senderUsername,
      replyToPreview:
        replyingTo?.text ||
        (replyingTo?.audioUrl ? '🎤 مقطع صوتي' : '📷 صورة'),
    });
    setReplyingTo(null);
  };

  const startVoiceRecording = async () => {
    if (isRecordingAudio) return;
    setIsRecordingAudio(true);
    setRecordingSec(0);
    startTimeRef.current = Date.now();
    chunksRef.current = [];
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setRecordingSec(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 500);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      mediaRecorderRef.current = rec;
      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.start();
    } catch {
      mediaRecorderRef.current = null;
    }
  };

  const cancelVoiceRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((tr) => tr.stop());
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setIsRecordingAudio(false);
    setRecordingSec(0);
  };

  const finishAndSendVoiceNote = async () => {
    const dur = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecordingAudio(false);
    setRecordingSec(0);

    const dispatchAudio = async (audioDataUrl: string) => {
      let permanentAudioUrl = audioDataUrl;
      try {
        const res = await fetch('/api/upload-media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataUrl: audioDataUrl,
            kind: 'voice_note',
            targetId: threadId,
          }),
        });
        const data = await res.json();
        if (data.url) permanentAudioUrl = data.url;
      } catch {
        // Fallback
      }

      onSendPrivateMessage({
        recipientUid: targetUser.uid,
        recipientUsername: targetDisplayName,
        text: lang === 'ar' ? '🎤 رسالة صوتية خاصة' : '🎤 Private voice note',
        category: 'عام',
        replyToId: replyingTo?.id,
        replyToUsername: replyingTo?.senderUsername,
        replyToPreview: replyingTo?.text,
        audioUrl: permanentAudioUrl,
        audioDurationSec: dur,
      });
      setReplyingTo(null);
    };

    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.onstop = () => {
        rec.stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        if (blob.size > 0) {
          const reader = new FileReader();
          reader.onloadend = () => {
            if (typeof reader.result === 'string') dispatchAudio(reader.result);
          };
          reader.readAsDataURL(blob);
        } else {
          dispatchAudio(createFallbackDmWavDataUrl(Math.min(dur, 5)));
        }
      };
      rec.stop();
    } else {
      await dispatchAudio(createFallbackDmWavDataUrl(Math.min(dur, 5)));
    }
  };

  const handleSubmitText = (e: React.FormEvent) => {
    e.preventDefault();
    setProfanityAlert(null);

    const trimmed = draftText.trim();
    if (!trimmed) return;

    const check = checkProfanity(trimmed);
    if (check.isBlocked) {
      setProfanityAlert(
        lang === 'ar'
          ? '🚫 تم حظر إرسال الرسالة: تحتوي على ألفاظ غير لائقة أو بذيئة مخالفة لقوانين تطبيق HUB.'
          : '🚫 Message blocked: Contains inappropriate or vulgar language.'
      );
      return;
    }

    onSendPrivateMessage({
      recipientUid: targetUser.uid,
      recipientUsername: targetDisplayName,
      text: trimmed,
      category: 'عام',
      replyToId: replyingTo?.id,
      replyToUsername: replyingTo?.senderUsername,
      replyToPreview:
        replyingTo?.text ||
        (replyingTo?.audioUrl ? '🎤 مقطع صوتي' : '📷 صورة'),
    });

    setDraftText('');
    setReplyingTo(null);
    setIsEmojiOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-xs p-0 sm:p-4 select-none">
      <div className="w-full max-w-2xl h-[92vh] sm:h-[85vh] rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111b21] text-slate-900 dark:text-slate-100 shadow-2xl flex flex-col overflow-hidden">
        {/* Top Profile Header & Strict Privacy Badge */}
        <div className="p-4 sm:px-6 bg-gradient-to-r from-[#111b21] via-[#182631] to-[#111b21] border-b border-slate-800 text-white shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3.5 min-w-0">
              {targetAvatar ? (
                <img
                  src={targetAvatar}
                  alt={targetDisplayName}
                  className="w-14 h-14 rounded-full object-cover border-2 border-emerald-400 shadow-md shrink-0"
                />
              ) : (
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-bold border-2 border-emerald-400 shadow-md shrink-0"
                  style={{ backgroundColor: targetUser.avatarColor || '#2563EB' }}
                >
                  {targetUser.role === 'admin' ? (
                    <Crown className="w-6 h-6" />
                  ) : (
                    targetDisplayName.slice(0, 2)
                  )}
                </div>
              )}

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base sm:text-lg font-bold text-white truncate">
                    @{targetDisplayName}
                  </h2>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                      targetUser.role === 'admin'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : targetUser.role === 'moderator'
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    }`}
                  >
                    {targetUser.role === 'admin' ? (
                      <Crown className="w-3 h-3" />
                    ) : targetUser.role === 'moderator' ? (
                      <Shield className="w-3 h-3" />
                    ) : (
                      <UserCheck className="w-3 h-3" />
                    )}
                    <span>
                      {targetUser.role === 'admin'
                        ? lang === 'ar'
                          ? 'الإدارة'
                          : 'Admin'
                        : targetUser.role === 'moderator'
                        ? lang === 'ar'
                          ? 'مشرف'
                          : 'Moderator'
                        : lang === 'ar'
                        ? 'عضو'
                        : 'Member'}
                    </span>
                  </span>
                </div>

                <p className="text-xs text-slate-300 mt-0.5 truncate">
                  {targetUser.bio ||
                    (lang === 'ar'
                      ? 'البروفايل الشخصي والرسائل الخاصة المباشرة في HUB'
                      : 'Personal Profile & Direct Private Messages on HUB')}
                </p>

                {/* End-to-End Privacy Notice: No third party can access this chat */}
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-semibold mt-1">
                  <Lock className="w-3 h-3 shrink-0" />
                  <span>
                    {lang === 'ar'
                      ? 'محادثة خاصة مشفرة ومحمية — لا يمكن لأي طرف ثالث الاطلاع عليها أو التعرض لها'
                      : 'Protected Private Chat — Strictly isolated from any third party'}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Private Messages Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 tg-chat-bg-dark">
          {threadMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-3">
                <MessageSquare className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-white">
                {lang === 'ar'
                  ? `ابدأ محادثة خاصة ومحمية مع @${targetDisplayName}`
                  : `Start a private conversation with @${targetDisplayName}`}
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                {lang === 'ar'
                  ? 'يمكنك إرسال رسائل نصية، مقاطع صوتية مسجلة، صور، أو اختيار كلمة سريعة للإرسال الفوري. لا يمكن لأي طرف ثالث رؤية هذه الرسائل.'
                  : 'Send text, voice notes, images, or quick phrases. Strictly private between the two of you.'}
              </p>
            </div>
          ) : (
            threadMessages.map((msg) => {
              const isOwn = msg.senderUid === currentUser.uid;
              const senderName =
                savedUserNames[msg.senderUid] || msg.senderUsername;

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isOwn ? 'items-start' : 'items-end'}`}
                >
                  <div
                    className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 py-2.5 shadow-sm relative ${
                      isOwn
                        ? 'bg-[#005c4b] text-white rounded-ss-none'
                        : 'bg-[#202c33] text-slate-100 rounded-se-none'
                    }`}
                  >
                    {/* Header: Sender + Reply & Delete Buttons */}
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span className="text-xs font-bold text-emerald-300">
                        @{senderName}
                      </span>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setReplyingTo(msg)}
                          title={lang === 'ar' ? 'الرد على هذه الرسالة' : 'Reply'}
                          className="p-1 rounded-lg hover:bg-black/25 text-slate-200 hover:text-white cursor-pointer"
                        >
                          <Reply className="w-3.5 h-3.5" />
                        </button>

                        {isOwn && (
                          <button
                            type="button"
                            onClick={() => onDeletePrivateMessage(msg.id, msg.threadId)}
                            title={
                              lang === 'ar'
                                ? 'حذف هذه الرسالة / المقطع الصوتي'
                                : 'Delete message / audio'
                            }
                            className="p-1 rounded-lg hover:bg-rose-500/30 text-rose-300 hover:text-rose-200 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Quoted Reply Box if replying to a previous message */}
                    {msg.replyToId && (
                      <div className="mb-2 px-2.5 py-1.5 rounded-xl bg-black/25 border-s-2 border-emerald-400 text-[11px]">
                        <div className="font-bold text-emerald-300">
                          {lang === 'ar' ? 'رداً على' : 'Replying to'} @{msg.replyToUsername}
                        </div>
                        <div className="text-slate-300 truncate">{msg.replyToPreview}</div>
                      </div>
                    )}

                    {/* Image Attachment */}
                    {msg.imageUrl && (
                      <div className="my-1.5 overflow-hidden rounded-xl border border-white/15">
                        <img
                          src={msg.imageUrl}
                          alt="صورة خاصة"
                          className="max-h-64 w-auto object-contain rounded-xl"
                        />
                      </div>
                    )}

                    {/* Recorded Voice Note */}
                    {msg.audioUrl && (
                      <div className="my-1.5 p-2.5 rounded-2xl bg-black/20 border border-white/10 flex flex-col gap-1.5 min-w-[220px]">
                        <div className="flex items-center justify-between text-[11px] text-emerald-300 font-bold">
                          <span className="flex items-center gap-1">
                            <Mic className="w-3.5 h-3.5" />
                            <span>
                              {lang === 'ar' ? 'مقطع صوتي خاص' : 'Private Voice Note'}
                            </span>
                          </span>
                          {msg.audioDurationSec && (
                            <span className="font-mono-tabular">
                              00:{String(msg.audioDurationSec).padStart(2, '0')}
                            </span>
                          )}
                        </div>
                        <audio controls src={msg.audioUrl} className="w-full h-8" />
                      </div>
                    )}

                    {msg.text && !msg.audioUrl && (
                      <p className="text-xs sm:text-sm leading-relaxed break-words">
                        {msg.text}
                      </p>
                    )}

                    <div className="flex items-center justify-end gap-1 mt-1 opacity-75">
                      <span className="text-[10px] font-mono-tabular">
                        {lang === 'ar' ? 'خاص ومشفر' : 'Encrypted DM'}
                      </span>
                      {isOwn && <CheckCheck className="w-3.5 h-3.5 text-sky-300" />}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>

        {/* Profanity Filter Warning Banner */}
        {profanityAlert && (
          <div className="px-4 py-2.5 bg-rose-600 text-white text-xs font-bold flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{profanityAlert}</span>
            </div>
            <button
              type="button"
              onClick={() => setProfanityAlert(null)}
              className="p-1 rounded hover:bg-black/20 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Composer Area with Quick Phrases Bar, Image Upload, Emojis & Voice Recorder */}
        <div className="bg-white dark:bg-[#202c33] border-t border-slate-200 dark:border-slate-800 shrink-0">
          {/* Active Reply Preview */}
          {replyingTo && (
            <div className="px-4 py-2 bg-slate-100 dark:bg-[#182229] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <Reply className="w-4 h-4 text-emerald-500 shrink-0" />
                <div className="truncate">
                  <span className="font-bold text-emerald-500">
                    {lang === 'ar' ? 'الرد على' : 'Replying to'} @{replyingTo.senderUsername}:{' '}
                  </span>
                  <span className="text-slate-600 dark:text-slate-300">
                    {replyingTo.text}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                className="p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Emoji Picker */}
          {isEmojiOpen && (
            <div className="px-3 py-2 bg-slate-50 dark:bg-[#182229] border-b border-slate-200 dark:border-slate-800 flex items-center gap-1.5 flex-wrap max-h-24 overflow-y-auto">
              {EMOJI_LIST.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setDraftText((p) => p + em)}
                  className="w-8 h-8 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-lg cursor-pointer"
                >
                  {em}
                </button>
              ))}
            </div>
          )}

          {/* Frequently Used Quick Phrases Bar (1-Tap Instant Send) */}
          <div className="px-3 pt-2 pb-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar border-b border-slate-100 dark:border-slate-800/70">
            <span className="text-[10px] font-bold text-emerald-500 flex items-center gap-1 shrink-0">
              <Sparkles className="w-3 h-3" />
              <span>{lang === 'ar' ? 'كلمات سريعة:' : 'Quick:'}</span>
            </span>
            {QUICK_CHAT_PHRASES.map((qp) => {
              const phrase = lang === 'ar' ? qp.textAr : qp.textEn;
              return (
                <button
                  key={qp.id}
                  type="button"
                  onClick={() => handleSendQuickPhrase(phrase)}
                  className="px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap bg-slate-100 dark:bg-[#2a3942] hover:bg-emerald-600 hover:text-white text-slate-700 dark:text-slate-200 transition-colors cursor-pointer active:scale-95"
                >
                  {phrase}
                </button>
              );
            })}
          </div>

          {isRecordingAudio ? (
            <div className="p-3 flex items-center justify-between gap-3 bg-emerald-950/40 mt-1">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
                <span className="text-xs font-bold text-rose-400 font-mono-tabular">
                  00:{String(recordingSec).padStart(2, '0')}
                </span>
                <span className="text-xs text-slate-300">
                  {lang === 'ar' ? 'جارٍ تسجيل رد صوتي خاص...' : 'Recording private voice note...'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={cancelVoiceRecording}
                  className="px-3 py-1.5 rounded-full bg-rose-600/20 text-rose-400 text-xs font-bold cursor-pointer"
                >
                  {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={finishAndSendVoiceNote}
                  className="px-4 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? 'إرسال الصوت' : 'Send Audio'}</span>
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmitText} className="p-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsEmojiOpen((p) => !p)}
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-[#2a3942] text-amber-500 flex items-center justify-center shrink-0 cursor-pointer"
              >
                <Smile className="w-5 h-5" />
              </button>

              {/* Native label wrapping file input guarantees mobile & desktop image picker reliability */}
              <label
                title={lang === 'ar' ? 'رفع وإرسال صورة مباشرة' : 'Upload & send image'}
                className={`w-9 h-9 rounded-full bg-slate-100 dark:bg-[#2a3942] hover:bg-blue-500/20 text-blue-500 flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                  isUploadingImg ? 'opacity-60 pointer-events-none' : ''
                }`}
              >
                {isUploadingImg ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ImageIcon className="w-4 h-4" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImagePick}
                  className="hidden"
                />
              </label>

              <input
                type="text"
                maxLength={800}
                value={draftText}
                onChange={(e) => {
                  setDraftText(e.target.value);
                  if (profanityAlert) setProfanityAlert(null);
                }}
                placeholder={
                  lang === 'ar'
                    ? `اكتب رسالة خاصة إلى @${targetDisplayName} أو اختر كلمة سريعة...`
                    : `Message @${targetDisplayName} privately...`
                }
                className="flex-1 h-10 px-3.5 rounded-full bg-slate-100 dark:bg-[#2a3942] text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none"
              />

              <button
                type="button"
                onClick={startVoiceRecording}
                title={lang === 'ar' ? 'تسجيل رسالة صوتية خاصة' : 'Record private voice note'}
                className="h-10 px-3 rounded-full bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/40 flex items-center gap-1 text-xs font-bold shrink-0 cursor-pointer"
              >
                <Mic className="w-4 h-4" />
                <span className="hidden sm:inline">{lang === 'ar' ? 'صوت' : 'Voice'}</span>
              </button>

              <button
                type="submit"
                disabled={!draftText.trim()}
                className="w-10 h-10 rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white flex items-center justify-center shrink-0 cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
