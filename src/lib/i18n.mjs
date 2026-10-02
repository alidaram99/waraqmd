// Small, explicit UI dictionary — Arabic and English only, on purpose. Adding
// a language means adding a column here; there is no machine translation and
// no silent fallback to English text rendered with the wrong `dir`.

export const LANGS = ['en', 'ar'];

export const STRINGS = {
  appName: { en: 'Waraq', ar: 'ورق' },
  openFile: { en: 'Open file', ar: 'فتح ملف' },
  newFile: { en: 'New', ar: 'جديد' },
  save: { en: 'Save', ar: 'حفظ' },
  saveAs: { en: 'Save as…', ar: 'حفظ باسم…' },
  recentFiles: { en: 'Recent files', ar: 'الملفات الأخيرة' },
  noRecentFiles: { en: 'No recent files yet', ar: 'لا توجد ملفات أخيرة بعد' },
  edit: { en: 'Edit', ar: 'تحرير' },
  preview: { en: 'Preview', ar: 'معاينة' },
  split: { en: 'Split', ar: 'مقسّم' },
  tableOfContents: { en: 'Contents', ar: 'المحتويات' },
  theme: { en: 'Theme', ar: 'المظهر' },
  themeLight: { en: 'Light', ar: 'فاتح' },
  themeDark: { en: 'Dark', ar: 'داكن' },
  themeSystem: { en: 'System', ar: 'النظام' },
  print: { en: 'Print / Export PDF', ar: 'طباعة / تصدير PDF' },
  exportHtml: { en: 'Export standalone HTML', ar: 'تصدير HTML مستقل' },
  frontMatter: { en: 'Front matter', ar: 'بيانات تعريفية (Front matter)' },
  unsavedChanges: { en: 'Unsaved changes', ar: 'تغييرات غير محفوظة' },
  savedToFile: { en: 'Saved', ar: 'تم الحفظ' },
  dropHint: { en: 'Drop a Markdown file here, or paste text', ar: 'اسحب ملف ماركداون هنا، أو ألصق النص' },
  pickFileFallback: {
    en: 'Your browser cannot save back to the file directly — use Save as… to download.',
    ar: 'متصفحك لا يدعم الحفظ المباشر للملف — استخدم "حفظ باسم" للتنزيل.',
  },
  readOnlyNotice: {
    en: 'Opened read-only. Edit a copy with Save as…',
    ar: 'تم الفتح للقراءة فقط. حرّر نسخة باستخدام "حفظ باسم".',
  },
  largeFileNotice: {
    en: 'Large file — rendering sections as you scroll',
    ar: 'ملف كبير — يتم عرض الأقسام أثناء التمرير',
  },
  language: { en: 'Language', ar: 'اللغة' },
};

/**
 * @param {string} key
 * @param {'en'|'ar'} lang
 */
export function t(key, lang) {
  const entry = STRINGS[key];
  if (!entry) return key;
  return entry[lang] ?? entry.en ?? key;
}

/** Best-effort initial language guess from a BCP-47 tag like "ar-IQ". */
export function detectLang(navigatorLanguage) {
  if (typeof navigatorLanguage !== 'string') return 'en';
  return navigatorLanguage.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}
