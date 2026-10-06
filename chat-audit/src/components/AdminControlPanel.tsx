import React, { useRef, useState } from 'react';
import {
  Camera,
  Check,
  Crown,
  Hash,
  Headphones,
  Loader2,
  Plus,
  Radio,
  Shield,
  Sliders,
  Trash2,
  Users,
  Volume2,
} from 'lucide-react';
import { Language, TRANSLATIONS } from '../i18n';
import {
  ChatRoom,
  PresenceUser,
  TickerSlotItem,
  UserProfile,
  VoiceRoomDefinition,
} from '../types';
import { processImageFileToDataUrl } from './ProfileView';

interface AdminControlPanelProps {
  currentUser: UserProfile;
  lang: Language;
  tickerSlots: TickerSlotItem[];
  rooms: ChatRoom[];
  voiceRooms: VoiceRoomDefinition[];
  roomAvatars: Record<string, string>;
  onlineUsers: PresenceUser[];
  onUpdateTickerSlot: (slot: TickerSlotItem) => void;
  onCreateRoom: (name: string, topic: string) => void;
  onDeleteRoom: (roomId: string) => void;
  onUpdateRoomAvatar: (roomId: string, avatarUrl: string) => Promise<void>;
}

export const AdminControlPanel: React.FC<AdminControlPanelProps> = ({
  currentUser,
  lang,
  tickerSlots,
  rooms,
  voiceRooms,
  roomAvatars,
  onlineUsers,
  onUpdateTickerSlot,
  onCreateRoom,
  onDeleteRoom,
  onUpdateRoomAvatar,
}) => {
  const t = TRANSLATIONS[lang];
  const isAdmin = currentUser.role === 'admin';
  const [selectedSlot, setSelectedSlot] = useState<number>(1);
  const [slotText, setSlotText] = useState<string>(
    tickerSlots.find((s) => s.slotIndex === 1)?.text || ''
  );
  const [slotCategory, setSlotCategory] = useState<string>('Keynote');
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomTopic, setNewRoomTopic] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [uploadingRoomId, setUploadingRoomId] = useState<string | null>(null);
  const roomFileInputRef = useRef<HTMLInputElement | null>(null);
  const targetRoomIdRef = useRef<string | null>(null);

  const orderedSlots = [...tickerSlots].sort((a, b) => a.slotIndex - b.slotIndex).slice(0, 7);

  const handleSelectSlot = (index: number) => {
    setSelectedSlot(index);
    const found = orderedSlots.find((s) => s.slotIndex === index);
    if (found) {
      setSlotText(found.text);
      setSlotCategory(found.category);
    }
    setStatusMsg(null);
  };

  const handleSaveSlot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!slotText.trim()) return;
    onUpdateTickerSlot({
      id: `slot_${selectedSlot}`,
      slotIndex: selectedSlot,
      text: slotText.trim().slice(0, 180),
      publisherUid: currentUser.uid,
      publisherUsername: currentUser.username,
      publisherRole: currentUser.role === 'admin' ? 'admin' : 'moderator',
      category: slotCategory,
    });
    setStatusMsg(
      lang === 'ar'
        ? `تم تحديث الخانة رقم 0${selectedSlot} في الشريط السباعي بنجاح!`
        : `Ticker Slot 0${selectedSlot} updated live!`
    );
  };

  const handleAddRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    onCreateRoom(newRoomName.trim(), newRoomTopic.trim());
    setNewRoomName('');
    setNewRoomTopic('');
    setStatusMsg(
      lang === 'ar' ? 'تم إنشاء الغرفة الجديدة بنجاح!' : 'New room created!'
    );
  };

  const triggerRoomImagePicker = (roomId: string) => {
    targetRoomIdRef.current = roomId;
    roomFileInputRef.current?.click();
  };

  const handleRoomFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const rId = targetRoomIdRef.current;
    if (!file || !rId) return;
    setUploadingRoomId(rId);
    try {
      const dataUrl = await processImageFileToDataUrl(file, 360);
      const res = await fetch('/api/upload-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataUrl,
          kind: 'room_avatar',
          targetId: rId,
        }),
      });
      const data = await res.json();
      const permanentUrl = data.url || dataUrl;
      await onUpdateRoomAvatar(rId, permanentUrl);
      setStatusMsg(
        lang === 'ar'
          ? 'تم تغيير صورة الغرفة وحفظها على السيرفر بشكل دائم!'
          : 'Room picture updated and saved on server!'
      );
    } catch {
      // Ignore
    } finally {
      setUploadingRoomId(null);
      e.target.value = '';
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6 overflow-y-auto h-full">
      <input
        ref={roomFileInputRef}
        type="file"
        accept="image/*"
        onChange={handleRoomFileSelected}
        className="hidden"
      />

      <div className="p-5 rounded-3xl bg-[#111b21] border border-emerald-500/30 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-md shrink-0">
            <Sliders className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">
              {lang === 'ar'
                ? 'لوحة تحكم الإدارة والمشرفين'
                : 'Admin & Moderators Control Panel'}
            </h1>
            <p className="text-xs text-slate-300 mt-0.5">
              {lang === 'ar'
                ? `مرحباً @${currentUser.username} — تغيير صور الغرف، إدارة الإعلانات الـ 7، ${
                    isAdmin ? 'وحذف أو إنشاء الغرف.' : 'ومتابعة الغرف.'
                  }`
                : `Welcome @${currentUser.username} — Manage room photos, 7 ticker slots, and rooms.`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold bg-white/10 px-3.5 py-2 rounded-2xl shrink-0">
          {isAdmin ? (
            <Crown className="w-4 h-4 text-amber-400" />
          ) : (
            <Shield className="w-4 h-4 text-emerald-400" />
          )}
          <span>
            {isAdmin
              ? lang === 'ar'
                ? 'صلاحية الإدارة الكاملة'
                : 'Full Admin'
              : lang === 'ar'
              ? 'صلاحية مشرف'
              : 'Moderator'}
          </span>
        </div>
      </div>

      {statusMsg && (
        <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-xs font-bold text-emerald-600 dark:text-emerald-400 text-center">
          {statusMsg}
        </div>
      )}

      {/* Section 1: Manage Text Chat Rooms */}
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#182229] p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Hash className="w-4 h-4 text-emerald-500" />
          <span>
            {lang === 'ar'
              ? '1. إدارة الغرف الكتابية (تغيير صورة الغرفة / حذف الغرف للإدارة)'
              : '1. Manage Text Chat Rooms (Change Photo / Admin Delete)'}
          </span>
        </h2>

        <form onSubmit={handleAddRoom} className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            required
            maxLength={40}
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            placeholder={lang === 'ar' ? 'اسم الغرفة الجديدة...' : 'New room name...'}
            className="flex-1 h-10 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#111b21] text-xs text-slate-900 dark:text-white"
          />
          <input
            type="text"
            maxLength={140}
            value={newRoomTopic}
            onChange={(e) => setNewRoomTopic(e.target.value)}
            placeholder={lang === 'ar' ? 'وصف الغرفة...' : 'Room topic...'}
            className="flex-1 h-10 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#111b21] text-xs text-slate-900 dark:text-white"
          />
          <button
            type="submit"
            className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{lang === 'ar' ? 'إضافة غرفة' : 'Add Room'}</span>
          </button>
        </form>

        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {rooms.map((rm) => {
            const rAvatar = roomAvatars[rm.roomId] || rm.avatarUrl;
            const isUploading = uploadingRoomId === rm.roomId;
            return (
              <div
                key={rm.roomId}
                className="py-3 flex items-center justify-between gap-3 text-xs flex-wrap sm:flex-nowrap"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {rAvatar ? (
                    <img
                      src={rAvatar}
                      alt={rm.name}
                      className="w-11 h-11 rounded-full object-cover border-2 border-emerald-500 shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center font-bold shrink-0">
                      <Hash className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <span className="font-bold text-slate-900 dark:text-white block truncate">
                      {rm.name}
                    </span>
                    <p className="text-slate-500 dark:text-slate-400 text-[11px] truncate">
                      {rm.topic}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 ms-auto">
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => triggerRoomImagePicker(rm.roomId)}
                    className="px-3 py-1.5 rounded-xl bg-blue-600/15 hover:bg-blue-600 text-blue-600 dark:text-blue-400 hover:text-white font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {isUploading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Camera className="w-3.5 h-3.5" />
                    )}
                    <span>{lang === 'ar' ? 'تغيير صورة الغرفة' : 'Change Photo'}</span>
                  </button>

                  {isAdmin && rooms.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteRoom(rm.roomId);
                        setStatusMsg(
                          lang === 'ar'
                            ? `تم حذف الغرفة "${rm.name}" بواسطة الإدارة.`
                            : `Room "${rm.name}" deleted by Admin.`
                        );
                      }}
                      className="px-3 py-1.5 rounded-xl bg-rose-600/15 hover:bg-rose-600 text-rose-500 hover:text-white font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{lang === 'ar' ? 'حذف الغرفة' : 'Delete'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 2: Manage Voice Rooms */}
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#182229] p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Headphones className="w-4 h-4 text-emerald-500" />
          <span>
            {lang === 'ar'
              ? '2. إدارة الغرف الصوتية (تغيير صورة الغرفة الصوتية / حذف الغرف للإدارة)'
              : '2. Manage Voice Rooms (Change Photo / Admin Delete)'}
          </span>
        </h2>

        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {voiceRooms.map((vRm) => {
            const vAvatar = roomAvatars[vRm.id] || vRm.avatarUrl;
            const isUploading = uploadingRoomId === vRm.id;
            return (
              <div
                key={vRm.id}
                className="py-3 flex items-center justify-between gap-3 text-xs flex-wrap sm:flex-nowrap"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {vAvatar ? (
                    <img
                      src={vAvatar}
                      alt={vRm.name}
                      className="w-11 h-11 rounded-full object-cover border-2 border-emerald-500 shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center font-bold shrink-0">
                      <Volume2 className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <span className="font-bold text-slate-900 dark:text-white block truncate">
                      {vRm.name}
                    </span>
                    <p className="text-slate-500 dark:text-slate-400 text-[11px] truncate">
                      {vRm.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 ms-auto">
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => triggerRoomImagePicker(vRm.id)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600/15 hover:bg-emerald-600 text-emerald-600 dark:text-emerald-400 hover:text-white font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {isUploading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Camera className="w-3.5 h-3.5" />
                    )}
                    <span>{lang === 'ar' ? 'تغيير صورة الغرفة' : 'Change Photo'}</span>
                  </button>

                  {isAdmin && voiceRooms.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteRoom(vRm.id);
                        setStatusMsg(
                          lang === 'ar'
                            ? `تم حذف الغرفة الصوتية "${vRm.name}" بواسطة الإدارة.`
                            : `Voice room "${vRm.name}" deleted by Admin.`
                        );
                      }}
                      className="px-3 py-1.5 rounded-xl bg-rose-600/15 hover:bg-rose-600 text-rose-500 hover:text-white font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{lang === 'ar' ? 'حذف الغرفة' : 'Delete'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 3: Manage 7 Ticker Slots */}
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#182229] p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Radio className="w-4 h-4 text-amber-500" />
          <span>
            {lang === 'ar'
              ? '3. إدارة شريط الإعلانات السباعي (7 خانات متحركة)'
              : '3. Manage 7 Global Ticker Slots'}
          </span>
        </h2>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {orderedSlots.map((slot) => (
            <button
              key={slot.id}
              type="button"
              onClick={() => handleSelectSlot(slot.slotIndex)}
              className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-all ${
                selectedSlot === slot.slotIndex
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-[#111b21] text-slate-700 dark:text-slate-300'
              }`}
            >
              {t.slotLabel} 0{slot.slotIndex} (@{slot.publisherUsername})
            </button>
          ))}
        </div>

        <form onSubmit={handleSaveSlot} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                {t.slotCategoryLabel}
              </label>
              <select
                value={slotCategory}
                onChange={(e) => setSlotCategory(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#111b21] text-xs font-bold text-slate-900 dark:text-white"
              >
                <option value="Keynote">إعلان رئيسي</option>
                <option value="Design">تصميم</option>
                <option value="Engineering">هندسة برمجيات</option>
                <option value="Voice Lounge">غرفة صوتية</option>
                <option value="Community">المجتمع</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                {lang === 'ar'
                  ? `نص الإعلان للخانة 0${selectedSlot} (باسم @${currentUser.username}):`
                  : `Announcement text for Slot 0${selectedSlot}:`}
              </label>
              <input
                type="text"
                required
                maxLength={180}
                value={slotText}
                onChange={(e) => setSlotText(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#111b21] text-xs text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>
              {lang === 'ar'
                ? `نشر وتحديث الخانة 0${selectedSlot}`
                : `Publish Slot 0${selectedSlot}`}
            </span>
          </button>
        </form>
      </div>

      {/* Section 4: Active Members */}
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#182229] p-5 space-y-3">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Users className="w-4 h-4 text-emerald-500" />
          <span>
            {lang === 'ar'
              ? `4. الأعضاء المتواجدون حالياً (${onlineUsers.length})`
              : `4. Currently Online Members (${onlineUsers.length})`}
          </span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {onlineUsers.map((u) => (
            <div
              key={u.uid}
              className="p-3 rounded-2xl bg-slate-50 dark:bg-[#111b21] border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {u.avatarUrl ? (
                  <img
                    src={u.avatarUrl}
                    alt={u.username}
                    className="w-9 h-9 rounded-full object-cover shrink-0 border border-emerald-500"
                  />
                ) : (
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ backgroundColor: u.avatarColor || '#2563EB' }}
                  >
                    {u.username.slice(0, 2)}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    @{u.username}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {u.role === 'admin'
                      ? 'الإدارة'
                      : u.role === 'moderator'
                      ? 'مشرف'
                      : 'عضو'}
                  </div>
                </div>
              </div>
              <span className="text-[11px] font-bold text-emerald-500">
                {u.currentVoiceRoom
                  ? lang === 'ar'
                    ? 'في غرفة صوتية'
                    : 'In Voice'
                  : lang === 'ar'
                  ? 'متصل'
                  : 'Online'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
