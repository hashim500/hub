import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { PRESET_ACCOUNTS } from '../constants';
import { Language } from '../i18n';
import { UserRole } from '../types';
import { HubLogo } from './HubLogo';

interface WelcomeAuthScreenProps {
  lang: Language;
  onEmailAuth: (
    email: string,
    password: string,
    username: string,
    role: UserRole,
    mode: 'signin' | 'signup'
  ) => void;
  onGoogleAuth: (preferredUsername: string, preferredRole: UserRole, bio: string) => Promise<void>;
  authError: string | null;
}

export const WelcomeAuthScreen: React.FC<WelcomeAuthScreenProps> = ({
  lang,
  onEmailAuth,
  onGoogleAuth,
  authError,
}) => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return;
    if (!password.trim()) {
      setLocalError(
        lang === 'ar'
          ? 'يرجى إدخال كلمة المرور لتسجيل الدخول.'
          : 'Please enter your password to sign in.'
      );
      return;
    }

    // Check if email matches one of the official accounts (Admin, Ahmed Al-Faisal, Noura)
    const matchedPreset = PRESET_ACCOUNTS.find(
      (acc) => acc.email.toLowerCase() === cleanEmail
    );

    if (matchedPreset) {
      if (password.trim() !== matchedPreset.password) {
        setLocalError(
          lang === 'ar'
            ? 'كلمة المرور غير صحيحة لهذا الحساب. يرجى التأكد من كلمة المرور.'
            : 'Incorrect password for this account.'
        );
        return;
      }
      onEmailAuth(
        matchedPreset.email,
        password.trim(),
        matchedPreset.username,
        matchedPreset.role,
        mode
      );
      return;
    }

    const finalName =
      username.trim() || cleanEmail.split('@')[0] || (lang === 'ar' ? 'عضو_HUB' : 'HubUser');
    const isAdminEmail = cleanEmail === 'h500341791@gmail.com';
    const role: UserRole = isAdminEmail ? 'admin' : 'member';
    onEmailAuth(cleanEmail, password.trim(), finalName, role, mode);
  };

  const handleGoogleClick = async () => {
    setLocalError(null);
    setIsSubmitting(true);
    try {
      await onGoogleAuth(
        username.trim(),
        'member',
        lang === 'ar' ? 'عضو نشط في مجتمع HUB.' : 'Active member on HUB.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full overflow-y-auto flex items-center justify-center p-4 sm:p-6 tg-chat-bg-dark bg-[#0b141a] text-slate-100 select-none">
      {/* Main Card matching the original site's dark luxury palette (#111b21 / #202c33) with the official HUB Logo */}
      <div className="w-full max-w-[420px] rounded-3xl bg-[#111b21] border border-slate-800 shadow-2xl px-6 py-7 sm:px-8 sm:py-8 my-auto">
        {/* Top HUB Official Logo & App Title */}
        <div className="flex flex-col items-center justify-center mb-5">
          <HubLogo size="xl" showTextInIcon={true} className="mb-3 shadow-lg shadow-cyan-500/20" />
          <div className="flex items-center gap-2">
            <span className="text-xl font-extrabold tracking-wider text-white">HUB</span>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold">
              {lang === 'ar' ? 'الدردشة والصوت والرسائل الخاصة' : 'Chat, Voice & Private DMs'}
            </span>
          </div>
        </div>

        {/* Title & Subtitle */}
        <div className="text-center mb-5">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            {mode === 'signin'
              ? lang === 'ar'
                ? 'تسجيل الدخول إلى HUB'
                : 'Sign In to HUB'
              : lang === 'ar'
              ? 'إنشاء حساب جديد في HUB'
              : 'Create HUB Account'}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {mode === 'signin'
              ? lang === 'ar'
                ? 'أدخل بريدك الإلكتروني وكلمة المرور للدخول إلى حسابك'
                : 'Enter your email and password to sign in'
              : lang === 'ar'
              ? 'سجل بياناتك للانضمام إلى غرف الدردشة الكتابية والصوتية'
              : 'Sign up to join global rooms'}
          </p>
        </div>

        {/* Mode Tabs (Sign In / Sign Up) */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-[#0b141a] border border-slate-800 mb-5">
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              setLocalError(null);
            }}
            className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              mode === 'signin'
                ? 'bg-[#202c33] text-emerald-400 shadow-sm border border-emerald-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {lang === 'ar' ? 'تسجيل الدخول' : 'Sign In'}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setLocalError(null);
            }}
            className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              mode === 'signup'
                ? 'bg-[#202c33] text-emerald-400 shadow-sm border border-emerald-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {lang === 'ar' ? 'تسجيل حساب جديد' : 'Sign Up'}
          </button>
        </div>

        {/* Form (No automatic preset login buttons — manual credential entry only) */}
        <form onSubmit={handleFormSubmit} className="space-y-3.5">
          {mode === 'signup' && (
            <div>
              <input
                type="text"
                required
                maxLength={40}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={lang === 'ar' ? 'اسم المستخدم في تطبيق HUB' : 'Username'}
                className="w-full h-12 px-4 rounded-2xl bg-[#202c33] border border-slate-700/80 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-emerald-500 transition-all"
              />
            </div>
          )}

          <div>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (localError) setLocalError(null);
              }}
              placeholder={lang === 'ar' ? 'البريد الإلكتروني (Email Address)' : 'Email Address'}
              className="w-full h-12 px-4 rounded-2xl bg-[#202c33] border border-slate-700/80 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-emerald-500 transition-all"
            />
          </div>

          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (localError) setLocalError(null);
              }}
              placeholder={lang === 'ar' ? 'كلمة المرور (Password)' : 'Password'}
              className="w-full h-12 px-4 pe-12 rounded-2xl bg-[#202c33] border border-slate-700/80 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-emerald-500 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute end-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 cursor-pointer"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-[#202c33] accent-emerald-500"
              />
              <span>{lang === 'ar' ? 'تذكرني على هذا الجهاز' : 'Remember me'}</span>
            </label>
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin');
                setLocalError(null);
              }}
              className="text-emerald-400 hover:underline font-semibold cursor-pointer"
            >
              {mode === 'signin'
                ? lang === 'ar'
                  ? 'إنشاء حساب جديد؟'
                  : 'Create account?'
                : lang === 'ar'
                ? 'لديك حساب بالفعل؟'
                : 'Already have an account?'}
            </button>
          </div>

          {(localError || authError) && (
            <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-xs text-rose-200 font-bold">
              {localError || authError}
            </div>
          )}

          <button
            type="submit"
            className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm sm:text-base shadow-lg shadow-emerald-600/25 transition-transform active:scale-[0.98] cursor-pointer mt-1"
          >
            {mode === 'signin'
              ? lang === 'ar'
                ? 'تسجيل الدخول إلى HUB'
                : 'Sign In to HUB'
              : lang === 'ar'
              ? 'إنشاء الحساب والدخول'
              : 'Sign Up'}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 my-4">
          <div className="h-px flex-1 bg-slate-800" />
          <span className="text-xs text-slate-400 whitespace-nowrap">
            {lang === 'ar' ? 'أو المتابعة عبر' : 'or continue with'}
          </span>
          <div className="h-px flex-1 bg-slate-800" />
        </div>

        {/* Google Button */}
        <button
          type="button"
          onClick={handleGoogleClick}
          disabled={isSubmitting}
          className="w-full h-11 rounded-2xl bg-[#202c33] hover:bg-[#2a3942] border border-slate-700 flex items-center justify-center gap-2.5 text-sm font-bold text-white transition-all cursor-pointer"
        >
          <span className="w-5 h-5 rounded-full bg-white text-blue-600 font-extrabold text-xs flex items-center justify-center">
            G
          </span>
          <span>
            {isSubmitting
              ? lang === 'ar'
                ? 'جارٍ الاتصال...'
                : 'Connecting...'
              : lang === 'ar'
              ? 'الدخول عبر حساب Google'
              : 'Continue with Google'}
          </span>
        </button>
      </div>
    </div>
  );
};
