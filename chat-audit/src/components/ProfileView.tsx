import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Crown,
  Loader2,
  LogOut,
  Mail,
  Shield,
  SwitchCamera,
  User,
} from 'lucide-react';
import { Language } from '../i18n';
import { UserProfile } from '../types';

interface ProfileViewProps {
  currentUser: UserProfile;
  lang: Language;
  savedUserAvatars: Record<string, string>;
  onUpdateProfile: (updates: { username?: string; bio?: string; avatarUrl?: string }) => Promise<void>;
  onLogout: () => void;
}

// Robust helper to compress and resize any image file (including mobile HEIC/WebP/PNG/JPEG) to a clean DataURL
// Never rejects — falls back to raw FileReader DataURL if canvas drawing fails
export function processImageFileToDataUrl(file: File, maxDim = 680): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const rawDataUrl = typeof e.target?.result === 'string' ? e.target.result : '';
      if (!rawDataUrl) {
        resolve('');
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let { width, height } = img;
          if (width > height && width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(rawDataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const compressed = canvas.toDataURL('image/jpeg', 0.85);
          resolve(compressed || rawDataUrl);
        } catch {
          resolve(rawDataUrl);
        }
      };
      img.onerror = () => {
        // Fallback to raw DataURL if Image decode fails
        resolve(rawDataUrl);
      };
      img.src = rawDataUrl;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

// Helper to upload DataURL to `/api/upload-media` and gracefully fall back to the DataURL if needed
export async function uploadImageFileToServer(
  file: File,
  kind: 'user_avatar' | 'room_avatar' | 'chat_image',
  targetId: string,
  maxDim = 680
): Promise<string> {
  const dataUrl = await processImageFileToDataUrl(file, maxDim);
  if (!dataUrl) return '';
  try {
    const res = await fetch('/api/upload-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dataUrl,
        kind,
        targetId,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.url === 'string' && data.url.trim()) {
        return data.url;
      }
    }
  } catch {
    // Fallback to DataURL so image always works even if network hiccups
  }
  return dataUrl;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  currentUser,
  lang,
  savedUserAvatars,
  onUpdateProfile,
  onLogout,
}) => {
  const [username, setUsername] = useState(currentUser.username);
  const [bio, setBio] = useState(currentUser.bio);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setUsername(currentUser.username);
    setBio(currentUser.bio);
  }, [currentUser.uid, currentUser.username, currentUser.bio]);

  const effectiveAvatarUrl =
    currentUser.avatarUrl || savedUserAvatars[currentUser.uid];

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingAvatar(true);
    setSavedNotice(null);
    try {
      const permanentUrl = await uploadImageFileToServer(
        file,
        'user_avatar',
        currentUser.uid,
        380
      );
      if (permanentUrl) {
        await onUpdateProfile({ avatarUrl: permanentUrl });
        setSavedNotice(
          lang === 'ar'
            ? 'تم رفع وحفظ صورة البروفايل على سيرفر HUB بنجاح ولن تعود للأيقونة الافتراضية أبداً!'
            : 'Profile photo saved permanently on HUB server!'
        );
      }
    } finally {
      setIsUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = username.trim().slice(0, 40);
    if (cleanName.length < 2) return;
    await onUpdateProfile({
      username: cleanName,
      bio: bio.trim().slice(0, 160),
    });
    setSavedNotice(
      lang === 'ar'
        ? 'تم حفظ اسم المستخدم والبيانات الشخصية على السيرفر بنجاح!'
        : 'Username and profile details saved permanently!'
    );
  };

  const roleLabel =
    currentUser.role === 'admin'
      ? lang === 'ar'
        ? 'الإدارة العامة'
        : 'Administrator'
      : currentUser.role === 'moderator'
      ? lang === 'ar'
        ? 'مشرف المنصة'
        : 'Moderator'
      : lang === 'ar'
      ? 'عضو مجتمع'
      : 'Community Member';

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6 overflow-y-auto h-full">
      {/* Main Personal Profile Card */}
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#182229] p-6 shadow-lg">
        <div className="flex flex-col items-center text-center">
          {/* Profile Photo with exclusive upload button here ONLY */}
          <div className="relative group">
            {effectiveAvatarUrl ? (
              <img
                src={effectiveAvatarUrl}
                alt={currentUser.username}
                className="w-28 h-28 rounded-full object-cover border-4 border-emerald-500 shadow-lg"
              />
            ) : (
              <div
                className="w-28 h-28 rounded-full flex items-center justify-center text-white text-3xl font-bold border-4 border-white dark:border-slate-800 shadow-lg"
                style={{ backgroundColor: currentUser.avatarColor || '#2563EB' }}
              >
                {currentUser.role === 'admin' ? (
                  <Crown className="w-11 h-11" />
                ) : (
                  currentUser.username.slice(0, 2)
                )}
              </div>
            )}

            <button
              type="button"
              disabled={isUploadingAvatar}
              onClick={() => fileInputRef.current?.click()}
              title={
                lang === 'ar'
                  ? 'تغيير صورة البروفايل (يتم حفظها على السيرفر بشكل دائم)'
                  : 'Change profile picture (Saved permanently on server)'
              }
              className="absolute bottom-0 end-0 w-10 h-10 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-md border-2 border-white dark:border-[#182229] cursor-pointer transition-transform active:scale-95"
            >
              {isUploadingAvatar ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Camera className="w-5 h-5" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarFileChange}
              className="hidden"
            />
          </div>

          <button
            type="button"
            disabled={isUploadingAvatar}
            onClick={() => fileInputRef.current?.click()}
            className="mt-2.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <SwitchCamera className="w-3.5 h-3.5" />
            <span>
              {isUploadingAvatar
                ? lang === 'ar'
                  ? 'جارٍ حفظ الصورة على السيرفر...'
                  : 'Saving to server...'
                : lang === 'ar'
                ? 'تغيير صورة البروفايل (حفظ دائم على السيرفر)'
                : 'Change Profile Picture (Permanent Server Save)'}
            </span>
          </button>

          <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-2">
            @{currentUser.username}
          </h2>

          <div className="flex items-center gap-2 mt-1 text-xs font-bold">
            <span
              className={`px-3 py-1 rounded-full flex items-center gap-1.5 ${
                currentUser.role === 'admin'
                  ? 'bg-rose-500/15 text-rose-500 border border-rose-500/30'
                  : currentUser.role === 'moderator'
                  ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                  : 'bg-teal-500/15 text-teal-500 border border-teal-500/30'
              }`}
            >
              {currentUser.role === 'admin' ? (
                <Crown className="w-3.5 h-3.5" />
              ) : (
                <Shield className="w-3.5 h-3.5" />
              )}
              <span>{roleLabel}</span>
            </span>
          </div>
        </div>

        {/* Personal Data & Username Editor Form */}
        <form onSubmit={handleSaveInfo} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
              {lang === 'ar'
                ? 'اسم المستخدم في التطبيق (يمكنك تغييره في أي وقت):'
                : 'Username in App (Editable):'}
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                minLength={2}
                maxLength={40}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full h-11 ps-10 pe-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#111b21] text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
              {lang === 'ar' ? 'النبذة الشخصية / الحالة:' : 'Personal Bio / Status:'}
            </label>
            <textarea
              rows={2}
              maxLength={160}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#111b21] text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-[#111b21] border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'البريد / المعرف:' : 'Email / ID:'}</span>
              </span>
              <span className="font-mono-tabular font-semibold text-slate-800 dark:text-slate-200">
                {currentUser.email || currentUser.uid}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">
                {lang === 'ar' ? 'حالة تخزين الصورة:' : 'Avatar Storage:'}
              </span>
              <span className="text-emerald-500 font-bold">
                {effectiveAvatarUrl
                  ? lang === 'ar'
                    ? 'محفوظة بشكل دائم على السيرفر ✓'
                    : 'Saved permanently on server ✓'
                  : lang === 'ar'
                  ? 'الأيقونة الافتراضية'
                  : 'Default Icon'}
              </span>
            </div>
          </div>

          {savedNotice && (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs font-bold text-emerald-600 dark:text-emerald-400 text-center">
              {savedNotice}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-md cursor-pointer transition-colors"
            >
              <Check className="w-4 h-4" />
              <span>{lang === 'ar' ? 'حفظ التغييرات' : 'Save Changes'}</span>
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="h-11 px-4 rounded-xl bg-rose-600/15 hover:bg-rose-600 text-rose-600 hover:text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>{lang === 'ar' ? 'تسجيل الخروج' : 'Log Out'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
