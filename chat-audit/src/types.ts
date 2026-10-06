export type UserRole = 'member' | 'moderator' | 'admin';
export type UserStatus = 'online' | 'idle' | 'offline';

export interface UserProfile {
  uid: string;
  username: string;
  email?: string;
  role: UserRole;
  status: UserStatus;
  bio: string;
  avatarColor: string;
  avatarUrl?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TickerSlotItem {
  id: string; // slot_1 .. slot_7
  slotIndex: number; // 1 .. 7
  text: string;
  publisherUid: string;
  publisherUsername: string;
  publisherRole: 'moderator' | 'admin';
  category: string;
  updatedAt?: unknown;
}

export interface ChatRoom {
  roomId: string;
  name: string;
  topic: string;
  category: 'General' | 'Technology' | 'Design' | 'Voice & Music' | 'Global Lounge' | 'Community';
  createdBy: string;
  avatarUrl?: string;
  isVoiceBacked?: boolean;
  voiceRoomId?: string;
  createdAt?: unknown;
}

export interface RoomMessage {
  id: string;
  roomId: string;
  authorUid: string;
  authorUsername: string;
  authorRole: UserRole;
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
  createdAt?: { seconds: number; nanoseconds: number } | null;
}

export interface PrivateDirectMessage {
  id: string;
  threadId: string; // sorted [uidA, uidB].join('__')
  senderUid: string;
  senderUsername: string;
  senderRole: UserRole;
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

export interface PresenceUser {
  uid: string;
  username: string;
  role: UserRole;
  avatarColor: string;
  avatarUrl?: string;
  currentTextRoom: string;
  currentVoiceRoom: string | null;
  isMuted: boolean;
  isSpeaking: boolean;
  joinedAt: string;
}

export interface VoiceRoomDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  bitrateKbps: number;
  avatarUrl?: string;
}
