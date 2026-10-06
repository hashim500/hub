// Comprehensive Arabic & English Profanity / Inappropriate Words Filter
// Blocks sending messages that contain inappropriate or vulgar words, especially in text chat.

const BLOCKED_WORDS_LIST = [
  // Arabic inappropriate / abusive / vulgar words
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
  // English inappropriate / vulgar words
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
  'nigger',
  'faggot',
];

function normalizeArabicText(input: string): string {
  return input
    .toLowerCase()
    // Remove Arabic diacritics (tashkeel) and tatweel (kashida)
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    // Normalize alef variants
    .replace(/[أإآ]/g, 'ا');
}

export interface ProfanityCheckResult {
  isBlocked: boolean;
  matchedWord?: string;
}

export function checkProfanity(text: string): ProfanityCheckResult {
  if (!text || !text.trim()) {
    return { isBlocked: false };
  }

  const normalized = normalizeArabicText(text);
  // Split into tokens by whitespace and punctuation
  const tokens = normalized.split(/[\s.,!?;:()[\]{}"'،؛؟\-_/\\|+*=<>~`@#$%^&*]+/).filter(Boolean);

  for (const bad of BLOCKED_WORDS_LIST) {
    const normBad = normalizeArabicText(bad);
    if (tokens.includes(normBad)) {
      return { isBlocked: true, matchedWord: bad };
    }
    // Also check if multi-word or embedded obvious profanity
    if (normBad.length >= 4 && normalized.includes(normBad)) {
      return { isBlocked: true, matchedWord: bad };
    }
  }

  return { isBlocked: false };
}
