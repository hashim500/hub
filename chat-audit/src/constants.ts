import { TickerSlotItem, ChatRoom, VoiceRoomDefinition, UserProfile } from './types';

export interface PresetAccount extends UserProfile {
  email: string;
  password: string;
  badgeTextAr: string;
  badgeTextEn: string;
  descriptionAr: string;
  descriptionEn: string;
}

// 1 Special Admin Account + 2 Default Accounts (Moderator Ahmed Al-Faisal & Member Noura)
// Manual login only with email & password (No automatic 1-tap login)
export const PRESET_ACCOUNTS: PresetAccount[] = [
  {
    uid: 'preset_admin_1',
    username: 'الإدارة_العامة',
    email: 'admin@hub-app.com',
    password: 'Admin@123',
    role: 'admin',
    status: 'online',
    bio: 'الحساب الرسمي لإدارة تطبيق HUB ولوحة التحكم الخاصة بالمشرفين والإدارة.',
    avatarColor: '#E11D48',
    badgeTextAr: 'حساب الإدارة الخاص',
    badgeTextEn: 'Special Admin Account',
    descriptionAr: 'صلاحيات لوحة تحكم الإدارة الكاملة: إدارة الإعلانات الـ 7، الغرف، والمشرفين.',
    descriptionEn: 'Full Admin Control Panel access: Manage 7 ticker slots, rooms, and moderators.',
  },
  {
    uid: 'preset_mod_faisal',
    username: 'أحمد_الفيصل',
    email: 'faisal@hub-app.com',
    password: 'Faisal@123',
    role: 'moderator',
    status: 'online',
    bio: 'مشرف عام في تطبيق HUB — متواجد في الدردشة والغرف الصوتية والرسائل الخاصة.',
    avatarColor: '#4F46E5',
    badgeTextAr: 'حساب المشرف أحمد الفيصل',
    badgeTextEn: 'Moderator Account (Ahmed Al-Faisal)',
    descriptionAr: 'حساب أحمد الفيصل (مشرف): يمتلك صلاحية دخول لوحة التحكم ونشر الإعلانات الـ 7.',
    descriptionEn: 'Ahmed Al-Faisal (Moderator): Has Control Panel access and 7-slot ticker publishing.',
  },
  {
    uid: 'preset_member_2',
    username: 'نورة_العلي',
    email: 'noura@hub-app.com',
    password: 'Noura@123',
    role: 'member',
    status: 'online',
    bio: 'مصممة واجهات وتجربة مستخدم في مجتمع HUB، متواجدة في الغرف الصوتية والدردشة.',
    avatarColor: '#0D9488',
    badgeTextAr: 'حساب العضو نورة العلي',
    badgeTextEn: 'Member Account (Noura Al-Ali)',
    descriptionAr: 'حساب عضو للمشاركة الفورية في غرف الدردشة والغرف الصوتية والرسائل الخاصة.',
    descriptionEn: 'Standard member account for text, image sharing, voice notes, and private messages.',
  },
];

// Frequently used words / phrases in conversations — clicking any phrase sends it directly into the chat!
export const QUICK_CHAT_PHRASES = [
  { id: 'qp_1', textAr: 'السلام عليكم 👋', textEn: 'Peace be upon you 👋' },
  { id: 'qp_2', textAr: 'وعليكم السلام ورحمة الله 🌹', textEn: 'Wa Alaikum Assalam 🌹' },
  { id: 'qp_3', textAr: 'أهلاً وسهلاً بالجميع ✨', textEn: 'Welcome everyone ✨' },
  { id: 'qp_4', textAr: 'كيف حالكم؟ 😊', textEn: 'How are you doing? 😊' },
  { id: 'qp_5', textAr: 'الحمد لله بخير 🙏', textEn: 'Doing great, thanks 🙏' },
  { id: 'qp_6', textAr: 'صباح الخير ☀️', textEn: 'Good morning ☀️' },
  { id: 'qp_7', textAr: 'مساء النور 🌙', textEn: 'Good evening 🌙' },
  { id: 'qp_8', textAr: 'حياكم الله جميعاً 🤝', textEn: 'Glad to have you all 🤝' },
  { id: 'qp_9', textAr: 'شكراً جزيلاً 🤍', textEn: 'Thank you so much 🤍' },
  { id: 'qp_10', textAr: 'منورين الغرفة 🔥', textEn: 'Great to see you here 🔥' },
  { id: 'qp_11', textAr: 'يعطيكم العافية 👏', textEn: 'Well done everyone 👏' },
  { id: 'qp_12', textAr: 'أستأذنكم الآن 👋', textEn: 'See you soon 👋' },
];

export const DEFAULT_TICKER_SLOTS: TickerSlotItem[] = [
  {
    id: 'slot_1',
    slotIndex: 1,
    text: 'مرحباً بكم في تطبيق HUB — انضموا الآن إلى الغرف الصوتية والكتابية أو تواصلوا عبر الرسائل الخاصة المشفرة.',
    publisherUid: 'preset_admin_1',
    publisherUsername: 'الإدارة_العامة',
    publisherRole: 'admin',
    category: 'Keynote',
  },
  {
    id: 'slot_2',
    slotIndex: 2,
    text: 'اضغط على اسم أو صورة أي مستخدم لفتح بروفايله ومراسلته على الخاص بالصوت أو الكتابة أو الصور والكلمات السريعة.',
    publisherUid: 'preset_mod_faisal',
    publisherUsername: 'أحمد_الفيصل',
    publisherRole: 'moderator',
    category: 'Feature',
  },
  {
    id: 'slot_3',
    slotIndex: 3,
    text: 'نظام الحماية التلقائي في HUB يمنع الألفاظ البذيئة وغير اللائقة في الدردشة للحفاظ على بيئة راقية للجميع.',
    publisherUid: 'preset_admin_1',
    publisherUsername: 'الإدارة_العامة',
    publisherRole: 'admin',
    category: 'Guide',
  },
  {
    id: 'slot_4',
    slotIndex: 4,
    text: 'استخدم شريط الكلمات المستخدمة بكثرة أسفل المحادثة لإرسال التحيات والردود الشائعة بضغطة واحدة فوراً.',
    publisherUid: 'preset_mod_faisal',
    publisherUsername: 'أحمد_الفيصل',
    publisherRole: 'moderator',
    category: 'Community',
  },
  {
    id: 'slot_5',
    slotIndex: 5,
    text: 'المحادثات الخاصة محمية بالكامل بين الطرفين فقط ولا يمكن لأي طرف ثالث الاطلاع عليها أو التعرض لها.',
    publisherUid: 'preset_admin_1',
    publisherUsername: 'الإدارة_العامة',
    publisherRole: 'admin',
    category: 'Keynote',
  },
  {
    id: 'slot_6',
    slotIndex: 6,
    text: 'في الغرف الصوتية والرسائل الخاصة يمكنك تسجيل مقاطع صوتية ورفع الصور مع إمكانية حذفها متى شئت.',
    publisherUid: 'preset_mod_faisal',
    publisherUsername: 'أحمد_الفيصل',
    publisherRole: 'moderator',
    category: 'Voice Lounge',
  },
  {
    id: 'slot_7',
    slotIndex: 7,
    text: 'جميع الصور المرفوعة في الدردشة والصور الشخصية تُحفظ بشكل دائم على سيرفر HUB وتظهر فوراً.',
    publisherUid: 'preset_admin_1',
    publisherUsername: 'الإدارة_العامة',
    publisherRole: 'admin',
    category: 'Design',
  },
];

export const DEFAULT_CHAT_ROOMS: ChatRoom[] = [
  {
    roomId: 'general',
    name: 'الساحة-العامة-HUB',
    topic: 'الملتقى الرئيسي للتعارف، النقاشات العامة، ومشاركة الصور والأخبار اليومية بين أعضاء مجتمع HUB.',
    category: 'General',
    createdBy: 'system',
  },
  {
    roomId: 'systems_arch',
    name: 'هندسة-الأنظمة-والتقنية',
    topic: 'نقاشات معمقة حول قواعد البيانات الفورية، WebSockets، الحوسبة السحابية، وتطوير الويب الحديث.',
    category: 'Technology',
    createdBy: 'system',
  },
  {
    roomId: 'design_critique',
    name: 'نقد-التصميم-والواجهات',
    topic: 'مساحة مخصصة لمراجعة واجهات المستخدم، الخطوط العربية، وتجربة الاستخدام.',
    category: 'Design',
    createdBy: 'system',
  },
  {
    roomId: 'moderators_hall',
    name: 'ملتقى-الإدارة-والمشرفين',
    topic: 'غرفة نقاش عامة للتواصل المباشر مع طاقم الإشراف والإدارة وتنظيم الفعاليات.',
    category: 'Global Lounge',
    createdBy: 'system',
  },
];

export const VOICE_ROOMS_LIST: VoiceRoomDefinition[] = [
  {
    id: 'voice_global_stage',
    name: 'منصة اللقاء العام المفتوح',
    description: 'غرفة صوتية وكتابية مشتركة للندوات المباشرة ولقاءات مجتمع HUB — يجب دخول الغرفة لتتمكن من التحدث.',
    category: 'Stage',
    bitrateKbps: 128,
  },
  {
    id: 'voice_builders_lounge',
    name: 'استوديو المطورين والمصممين',
    description: 'غرفة عمل صوتية وكتابية للمبرمجين والمصممين ومهندسي المنتجات أثناء العمل.',
    category: 'Co-Working',
    bitrateKbps: 96,
  },
  {
    id: 'voice_mod_salon',
    name: 'ديوانية المشرفين والأعضاء',
    description: 'مجلس حواري صوتي وكتابي بإشراف طاقم الإدارة والمشرفين وضيوف المنصة.',
    category: 'Lounge',
    bitrateKbps: 128,
  },
  {
    id: 'voice_night_cafe',
    name: 'مقهى السهرة والدردشة الهادئة',
    description: 'جلسة صوتية وكتابية ودية للتواصل الاجتماعي والاستماع الهادئ.',
    category: 'Social',
    bitrateKbps: 96,
  },
];

export const EMOJI_LIST = [
  '😂', '🤣', '😍', '🥰', '😎', '🤩', '🥳', '😊',
  '🙌', '👏', '🔥', '❤️', '💙', '✨', '🌹', '🎉',
  '👍', '🤝', '🙏', '💯', '🚀', '👑', '💎', '☕',
  '🤔', '😅', '😆', '😉', '🫡', '🤍', '🌟', '🎤',
];

export const AVATAR_COLORS = [
  '#2563EB', // Electric Royal Blue
  '#0D9488', // Deep Teal
  '#4F46E5', // Indigo
  '#D97706', // Warm Amber
  '#E11D48', // Rose Crimson
  '#059669', // Emerald
];
