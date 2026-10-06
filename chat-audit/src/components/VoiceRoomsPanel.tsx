import React, { useEffect, useRef, useState } from 'react';
import {
  Headphones,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Volume2,
  Waves,
} from 'lucide-react';
import { VOICE_ROOMS_LIST } from '../constants';
import { Language, TRANSLATIONS } from '../i18n';
import { PresenceUser, UserProfile } from '../types';

interface VoiceRoomsPanelProps {
  currentUser: UserProfile | null;
  onlineUsers: PresenceUser[];
  activeVoiceRoom: string | null;
  isMuted: boolean;
  isSpeaking: boolean;
  lang: Language;
  onJoinVoiceRoom: (roomId: string) => void;
  onLeaveVoiceRoom: () => void;
  onToggleMute: () => void;
  onSpeakingChange: (speaking: boolean) => void;
  wsRef: React.MutableRefObject<WebSocket | null>;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export const VoiceRoomsPanel: React.FC<VoiceRoomsPanelProps> = ({
  currentUser,
  onlineUsers,
  activeVoiceRoom,
  isMuted,
  isSpeaking,
  lang,
  onJoinVoiceRoom,
  onLeaveVoiceRoom,
  onToggleMute,
  onSpeakingChange,
  wsRef,
}) => {
  const t = TRANSLATIONS[lang];
  const [micPermissionState, setMicPermissionState] = useState<
    'idle' | 'granted' | 'fallback'
  >('idle');
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const animFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const cleanupVoiceResources = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((tr) => tr.stop());
      localStreamRef.current = null;
    }
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    remoteAudiosRef.current.forEach((audio) => {
      audio.srcObject = null;
    });
    remoteAudiosRef.current.clear();
    setAudioLevel(0);
    onSpeakingChange(false);
  };

  useEffect(() => {
    if (!activeVoiceRoom) {
      cleanupVoiceResources();
      return;
    }

    let cancelled = false;

    async function setupLocalAudio() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
          video: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        localStreamRef.current = stream;
        setMicPermissionState('granted');

        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let lastSpeaking = false;

        const checkVolume = () => {
          if (cancelled) return;
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          const normalized = Math.min(100, Math.round((avg / 90) * 100));
          setAudioLevel(normalized);

          const speakingNow = normalized > 18;
          if (speakingNow !== lastSpeaking) {
            lastSpeaking = speakingNow;
            onSpeakingChange(speakingNow);
          }
          animFrameRef.current = requestAnimationFrame(checkVolume);
        };

        animFrameRef.current = requestAnimationFrame(checkVolume);
      } catch {
        setMicPermissionState('fallback');
      }
    }

    setupLocalAudio();

    return () => {
      cancelled = true;
      cleanupVoiceResources();
    };
  }, [activeVoiceRoom]);

  useEffect(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted;
      });
    }
  }, [isMuted]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || !activeVoiceRoom || !currentUser) return;

    const createPeerConnection = (peerUid: string): RTCPeerConnection => {
      const existing = peersRef.current.get(peerUid);
      if (existing) return existing;

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peersRef.current.set(peerUid, pc);

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'webrtc:signal',
              targetUid: peerUid,
              signal: { type: 'candidate', candidate: event.candidate },
            })
          );
        }
      };

      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (remoteStream) {
          let audioEl = remoteAudiosRef.current.get(peerUid);
          if (!audioEl) {
            audioEl = new Audio();
            audioEl.autoplay = true;
            remoteAudiosRef.current.set(peerUid, audioEl);
          }
          audioEl.srcObject = remoteStream;
          audioEl.play().catch(() => {});
        }
      };

      return pc;
    };

    const handleWsMessage = async (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'webrtc:peer-joined' && data.roomId === activeVoiceRoom) {
          const peerUid = data.peerUid;
          if (!peerUid || peerUid === currentUser.uid) return;
          const pc = createPeerConnection(peerUid);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'webrtc:signal',
                targetUid: peerUid,
                signal: { type: 'offer', sdp: pc.localDescription },
              })
            );
          }
        } else if (data.type === 'webrtc:signal' && data.fromUid) {
          const peerUid = data.fromUid;
          const pc = createPeerConnection(peerUid);
          const { signal } = data;
          if (signal.type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: 'webrtc:signal',
                  targetUid: peerUid,
                  signal: { type: 'answer', sdp: pc.localDescription },
                })
              );
            }
          } else if (signal.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          } else if (signal.type === 'candidate' && signal.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          }
        } else if (data.type === 'webrtc:peer-left' && data.peerUid) {
          const pc = peersRef.current.get(data.peerUid);
          if (pc) {
            pc.close();
            peersRef.current.delete(data.peerUid);
          }
          const audioEl = remoteAudiosRef.current.get(data.peerUid);
          if (audioEl) {
            audioEl.srcObject = null;
            remoteAudiosRef.current.delete(data.peerUid);
          }
        }
      } catch {
        // Ignore non-WebRTC frames
      }
    };

    ws.addEventListener('message', handleWsMessage);
    return () => {
      ws.removeEventListener('message', handleWsMessage);
    };
  }, [activeVoiceRoom, currentUser, wsRef]);

  const activeRoomObj = VOICE_ROOMS_LIST.find((r) => r.id === activeVoiceRoom);

  return (
    <div className="space-y-6">
      {/* Header & Active Voice Session Control Deck */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            {t.voiceHeaderTitle}
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            {t.voiceHeaderSubtitle}
          </p>
        </div>

        {activeRoomObj && (
          <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-lg border border-blue-600/40 bg-blue-50/70 dark:bg-blue-950/30">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-600 dark:text-emerald-400 animate-pulse" />
              <div className="text-xs">
                <span className="font-semibold text-slate-900 dark:text-white">
                  {t.connectedToVoice} {activeRoomObj.name}
                </span>
                <span className="block font-mono-tabular text-[11px] text-slate-500 dark:text-slate-400">
                  {micPermissionState === 'granted'
                    ? `${t.webrtcMicActive} ${isMuted ? 0 : audioLevel}%`
                    : t.pushToSpeakMode}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 ms-auto">
              {micPermissionState === 'fallback' && !isMuted && (
                <button
                  type="button"
                  onMouseDown={() => onSpeakingChange(true)}
                  onMouseUp={() => onSpeakingChange(false)}
                  onMouseLeave={() => onSpeakingChange(false)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    isSpeaking
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  {t.holdToSpeakBtn}
                </button>
              )}

              <button
                type="button"
                onClick={onToggleMute}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  isMuted
                    ? 'bg-amber-600 text-white hover:bg-amber-500'
                    : 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                }`}
              >
                {isMuted ? (
                  <>
                    <MicOff className="w-3.5 h-3.5" />
                    <span>{t.unmuteMicBtn}</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5" />
                    <span>{t.muteMicBtn}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onLeaveVoiceRoom}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-rose-600 text-white text-xs font-semibold hover:bg-rose-500 transition-colors cursor-pointer whitespace-nowrap"
              >
                <PhoneOff className="w-3.5 h-3.5" />
                <span>{t.disconnectBtn}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4 Voice Chat Lounges Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {VOICE_ROOMS_LIST.map((room) => {
          const participants = onlineUsers.filter(
            (u) => u.currentVoiceRoom === room.id
          );
          const isJoined = activeVoiceRoom === room.id;

          return (
            <div
              key={room.id}
              className={`p-5 rounded-xl border transition-colors flex flex-col justify-between ${
                isJoined
                  ? 'border-blue-600 dark:border-blue-500 bg-white dark:bg-slate-900'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>{room.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">{room.bitrateKbps} kbps Opus</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">
                        {participants.length}{' '}
                        {participants.length === 1 ? t.speakerSingular : t.speakerPlural}
                      </span>
                    </div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white mt-1">
                      {room.name}
                    </h2>
                  </div>

                  {isJoined ? (
                    <button
                      type="button"
                      onClick={onLeaveVoiceRoom}
                      className="px-3.5 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {t.leaveRoomBtn}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onJoinVoiceRoom(room.id)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Headphones className="w-3.5 h-3.5" />
                      <span>{t.joinVoiceBtn}</span>
                    </button>
                  )}
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                  {room.description}
                </p>

                {/* Active Speakers Stage */}
                <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3 flex items-center justify-between">
                    <span>{t.liveAudioStage}</span>
                    {isJoined && (
                      <span className="text-emerald-600 dark:text-emerald-400 font-mono-tabular">
                        {t.connectedBadge}
                      </span>
                    )}
                  </div>

                  {participants.length === 0 ? (
                    <div className="py-6 text-center rounded-lg border border-dashed border-slate-200 dark:border-slate-800">
                      <Volume2 className="w-4 h-4 text-slate-400 mx-auto mb-1.5" />
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t.emptyVoicePrompt}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {participants.map((speaker) => (
                        <div
                          key={speaker.uid}
                          className={`p-2.5 rounded-lg border flex items-center gap-2.5 transition-all ${
                            speaker.isSpeaking && !speaker.isMuted
                              ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30'
                              : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950'
                          }`}
                        >
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                            style={{ backgroundColor: speaker.avatarColor || '#2563EB' }}
                          >
                            {speaker.username.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                              {speaker.username}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                              {speaker.isMuted ? (
                                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                  <MicOff className="w-3 h-3" /> {t.mutedStatus}
                                </span>
                              ) : speaker.isSpeaking ? (
                                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                                  <Waves className="w-3 h-3" /> {t.speakingStatus}
                                </span>
                              ) : (
                                <span>{t.listeningStatus}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
