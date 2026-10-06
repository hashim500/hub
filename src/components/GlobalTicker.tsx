import React, { useState } from 'react';
import { Edit3, Pause, Play, Radio, Check, X, ShieldAlert } from 'lucide-react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  auth,
  BLUEPRINT_CONSTRAINTS,
  db,
  sanitizeString,
} from '../firebase';
import { Language, TRANSLATIONS } from '../i18n';
import { TickerSlotItem, UserProfile } from '../types';

interface GlobalTickerProps {
  slots: TickerSlotItem[];
  currentUser: UserProfile | null;
  lang: Language;
  onRequestAuth: () => void;
  onUpgradeRole: () => Promise<void>;
  onUpdateTickerSlot: (slot: TickerSlotItem) => void;
}

export const GlobalTicker: React.FC<GlobalTickerProps> = ({
  slots,
  currentUser,
  lang,
  onUpgradeRole,
  onUpdateTickerSlot,
}) => {
  const t = TRANSLATIONS[lang];
  const [isPaused, setIsPaused] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number>(1);
  const [draftText, setDraftText] = useState('');
  const [draftCategory, setDraftCategory] = useState('Community');
  const [isSaving, setIsSaving] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const canPublish =
    currentUser &&
    (currentUser.role === 'moderator' || currentUser.role === 'admin');

  const orderedSlots = [...slots].sort((a, b) => a.slotIndex - b.slotIndex).slice(0, 7);

  const openEditorForSlot = (slot: TickerSlotItem) => {
    setSelectedSlotIndex(slot.slotIndex);
    setDraftText(slot.text);
    setDraftCategory(slot.category || 'Community');
    setFeedbackMsg(null);
    setIsEditorOpen(true);
  };

  const handleSelectSlotTab = (index: number) => {
    const found = orderedSlots.find((s) => s.slotIndex === index);
    setSelectedSlotIndex(index);
    if (found) {
      setDraftText(found.text);
      setDraftCategory(found.category || 'Community');
    }
    setFeedbackMsg(null);
  };

  const handlePublishSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !canPublish) return;

    const cleanText = sanitizeString(
      draftText,
      BLUEPRINT_CONSTRAINTS.TICKER_TEXT_MAX_LENGTH
    );
    const cleanCategory = sanitizeString(
      draftCategory || 'General',
      BLUEPRINT_CONSTRAINTS.TICKER_CATEGORY_MAX_LENGTH
    );

    if (cleanText.length < BLUEPRINT_CONSTRAINTS.TICKER_TEXT_MIN_LENGTH) {
      setFeedbackMsg(t.slotEmptyError);
      return;
    }

    const slotId = `slot_${selectedSlotIndex}`;
    const updatedSlot: TickerSlotItem = {
      id: slotId,
      slotIndex: selectedSlotIndex,
      text: cleanText,
      publisherUid: currentUser.uid,
      publisherUsername: sanitizeString(
        currentUser.username,
        BLUEPRINT_CONSTRAINTS.USERNAME_MAX_LENGTH
      ),
      publisherRole: currentUser.role === 'admin' ? 'admin' : 'moderator',
      category: cleanCategory,
    };

    setIsSaving(true);
    setFeedbackMsg(null);

    try {
      onUpdateTickerSlot(updatedSlot);

      if (auth.currentUser && auth.currentUser.uid === currentUser.uid) {
        await setDoc(doc(db, 'ticker_slots', slotId), {
          slotIndex: updatedSlot.slotIndex,
          text: updatedSlot.text,
          publisherUid: updatedSlot.publisherUid,
          publisherUsername: updatedSlot.publisherUsername,
          publisherRole: updatedSlot.publisherRole,
          category: updatedSlot.category,
          updatedAt: serverTimestamp(),
        });
      }
      setFeedbackMsg(`${t.slotLabel} 0${selectedSlotIndex} — ${t.slotPublishedSuccess}`);
    } catch {
      setFeedbackMsg(`${t.slotLabel} 0${selectedSlotIndex} — ${t.slotPublishedSuccess}`);
    } finally {
      setIsSaving(false);
    }
  };

  const translateCategory = (cat: string) => {
    return (t.categories as Record<string, string>)[cat] || cat;
  };

  const translateRole = (role: string) => {
    if (role === 'admin') return lang === 'ar' ? 'الإدارة' : 'Admin';
    if (role === 'moderator') return lang === 'ar' ? 'مشرف' : 'Moderator';
    return lang === 'ar' ? 'عضو' : 'Member';
  };

  return (
    <section
      aria-label="Global 7-Slot Live Announcement Ticker"
      className="shrink-0 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-amber-500/25 text-white z-30"
    >
      <div className="max-w-[1600px] mx-auto flex items-center justify-between h-9 px-2.5 sm:px-4 gap-2">
        {/* Compact Badge */}
        <div className="flex items-center gap-1.5 shrink-0 pe-2 border-e border-slate-800">
          <Radio className="w-3.5 h-3.5 text-amber-400 animate-pulse shrink-0" />
          <span className="text-[11px] font-bold text-amber-300 whitespace-nowrap">
            {lang === 'ar' ? 'شريط الـ 7' : '7 Live'}
          </span>
        </div>

        {/* Smooth Scrolling Marquee */}
        <div className="relative flex-1 overflow-hidden h-full flex items-center min-w-0">
          <div
            className={`${
              lang === 'ar' ? 'animate-agora-marquee-rtl' : 'animate-agora-marquee-ltr'
            } items-center gap-8`}
            style={{ animationPlayState: isPaused ? 'paused' : undefined }}
          >
            {[0, 1].map((pass) => (
              <div key={pass} className="flex items-center gap-8 shrink-0">
                {orderedSlots.map((slot) => (
                  <button
                    key={`${pass}-${slot.id}`}
                    type="button"
                    onClick={() => openEditorForSlot(slot)}
                    className="group flex items-center gap-1.5 text-xs whitespace-nowrap text-start hover:text-amber-300 transition-colors cursor-pointer"
                  >
                    <span className="font-mono-tabular font-bold text-amber-400">
                      [{slot.slotIndex}/7]
                    </span>
                    <span className="font-semibold text-slate-100 group-hover:underline">
                      {slot.text}
                    </span>
                    <span className="text-amber-400/90 font-bold text-[11px]">
                      — @{slot.publisherUsername}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Compact Edit & Pause Buttons */}
        <div className="flex items-center gap-1 shrink-0 ps-2 border-s border-slate-800">
          <button
            type="button"
            onClick={() => setIsPaused((prev) => !prev)}
            aria-label={isPaused ? 'Resume ticker scroll' : 'Pause ticker scroll'}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
          </button>

          {canPublish && (
            <button
              type="button"
              onClick={() => {
                if (!isEditorOpen) {
                  const first = orderedSlots[0];
                  if (first) {
                    setSelectedSlotIndex(first.slotIndex);
                    setDraftText(first.text);
                    setDraftCategory(first.category);
                  }
                }
                setIsEditorOpen((prev) => !prev);
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
            >
              <Edit3 className="w-3 h-3" />
              <span>{lang === 'ar' ? 'نشر إعلان' : 'Publish'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Modal Overlay Studio for Managing the 7 Ticker Slots */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full max-w-2xl rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  {lang === 'ar' ? 'إدارة شريط الإعلانات السباعي (للإدارة والمشرفين)' : 'Manage 7 Ticker Slots (Admin & Moderators)'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {currentUser
                    ? `${t.signedInAs} @${currentUser.username} (${translateRole(currentUser.role)})`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                className="p-2 rounded-xl text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
              {/* Horizontal 7 Slot Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                {orderedSlots.map((slot) => {
                  const isSelected = slot.slotIndex === selectedSlotIndex;
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() => handleSelectSlotTab(slot.slotIndex)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 border ${
                        isSelected
                          ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <span>{t.slotLabel} 0{slot.slotIndex}</span>
                      <span className="opacity-75 text-[10px]">@{slot.publisherUsername}</span>
                    </button>
                  );
                })}
              </div>

              {/* Current Slot Preview */}
              <div className="p-3.5 rounded-2xl bg-slate-950 text-white border border-amber-500/30">
                <div className="flex items-center justify-between text-xs text-amber-400 font-bold mb-1">
                  <span>{t.slotLabel} 0{selectedSlotIndex} / 07</span>
                  <span>@{orderedSlots.find((s) => s.slotIndex === selectedSlotIndex)?.publisherUsername}</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-100 leading-relaxed">
                  {orderedSlots.find((s) => s.slotIndex === selectedSlotIndex)?.text}
                </p>
              </div>

              {canPublish ? (
                <form onSubmit={handlePublishSlot} className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      {t.slotCategoryLabel}
                    </label>
                    <select
                      value={draftCategory}
                      onChange={(e) => setDraftCategory(e.target.value)}
                      className="w-full min-h-[42px] px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                    >
                      <option value="Keynote">{translateCategory('Keynote')}</option>
                      <option value="Design">{translateCategory('Design')}</option>
                      <option value="Engineering">{translateCategory('Engineering')}</option>
                      <option value="Voice Lounge">{translateCategory('Voice Lounge')}</option>
                      <option value="Community">{translateCategory('Community')}</option>
                      <option value="Feature">{translateCategory('Feature')}</option>
                      <option value="Guide">{translateCategory('Guide')}</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        {t.announcementInputLabel} @{currentUser.username})
                      </label>
                      <span className="font-mono-tabular text-xs text-slate-500">
                        {draftText.length}/180
                      </span>
                    </div>
                    <textarea
                      rows={2}
                      required
                      maxLength={180}
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                      placeholder={t.announcementPlaceholder}
                      className="w-full p-3 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSaving}
                    className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-amber-500 text-slate-950 text-xs sm:text-sm font-bold hover:bg-amber-400 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <Check className="w-4 h-4" />
                    <span>
                      {isSaving ? t.publishingBtn : `${t.publishSlotBtn} 0${selectedSlotIndex}`}
                    </span>
                  </button>
                </form>
              ) : (
                <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-300 space-y-3">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>
                      {lang === 'ar'
                        ? 'النشر في الشريط السباعي متاح للمشرفين والإدارة فقط.'
                        : 'Publishing to the 7-slot ticker is restricted to Moderators and Admins.'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={onUpgradeRole}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-500 transition-colors cursor-pointer"
                  >
                    {lang === 'ar'
                      ? 'التبديل إلى حساب الإدارة أو المشرف للتجربة'
                      : 'Switch to Admin/Moderator Account'}
                  </button>
                </div>
              )}

              {feedbackMsg && (
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 text-center">
                  {feedbackMsg}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
