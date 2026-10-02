import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t, detectLang, STRINGS, LANGS } from '../src/lib/i18n.mjs';

test('every string has both required languages, non-empty', () => {
  for (const [key, entry] of Object.entries(STRINGS)) {
    for (const lang of LANGS) {
      assert.equal(typeof entry[lang], 'string', `${key}.${lang} missing`);
      assert.ok(entry[lang].length > 0, `${key}.${lang} is empty`);
    }
  }
});

test('t() returns the requested language', () => {
  assert.equal(t('save', 'en'), 'Save');
  assert.equal(t('save', 'ar'), 'حفظ');
});

test('t() falls back to the key itself for an unknown key, never throws', () => {
  assert.equal(t('definitely-not-a-real-key', 'en'), 'definitely-not-a-real-key');
});

test('detectLang maps any ar-* tag to Arabic and everything else to English', () => {
  assert.equal(detectLang('ar'), 'ar');
  assert.equal(detectLang('ar-IQ'), 'ar');
  assert.equal(detectLang('en-US'), 'en');
  assert.equal(detectLang('fr'), 'en');
  assert.equal(detectLang(undefined), 'en');
});
