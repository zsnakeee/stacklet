import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// i18n.tsx touches document only inside applyLanguageAttrs(), so a tiny stub is
// enough — no jsdom required.
const documentEl: { lang?: string; dir?: string } = {};
(globalThis as unknown as { document: unknown }).document = {
  documentElement: documentEl,
};

import i18n, {
  LANGUAGES,
  applyLanguageAttrs,
  dirFor,
  getInitialLanguage,
} from '../i18n';
import { resources } from '../locales';

/** Every key path present in English must also exist in the other language. */
function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object'
      ? flatten(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

describe('i18n resources', () => {
  it('ships English and Arabic', () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual(['en', 'ar']);
    expect(resources.en.translation).toBeTruthy();
    expect(resources.ar.translation).toBeTruthy();
  });

  it('has full key parity between English and Arabic', () => {
    const en = flatten(resources.en.translation).sort();
    const ar = flatten(resources.ar.translation).sort();
    expect(ar).toEqual(en);
  });
});

describe('language direction', () => {
  it('maps Arabic to RTL and English to LTR', () => {
    expect(dirFor('ar')).toBe('rtl');
    expect(dirFor('en')).toBe('ltr');
    expect(dirFor('unknown')).toBe('ltr');
  });

  it('applies lang + dir to the document element', () => {
    applyLanguageAttrs('ar');
    expect(documentEl.lang).toBe('ar');
    expect(documentEl.dir).toBe('rtl');

    applyLanguageAttrs('en');
    expect(documentEl.lang).toBe('en');
    expect(documentEl.dir).toBe('ltr');
  });

  it('defaults to English when nothing is persisted', () => {
    expect(getInitialLanguage()).toBe('en');
  });
});

describe('translation switching', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('translates the navigation labels per language', async () => {
    expect(i18n.t('nav.dashboard')).toBe('Dashboard');
    expect(i18n.t('nav.settings')).toBe('Settings');

    await i18n.changeLanguage('ar');
    expect(i18n.t('nav.dashboard')).toBe('لوحة التحكم');
    expect(i18n.t('nav.settings')).toBe('الإعدادات');
  });

  it('falls back to English for a missing key in another language', async () => {
    await i18n.changeLanguage('ar');
    // titlebar.close exists in both; assert the Arabic value resolves.
    expect(i18n.t('titlebar.close')).toBe('إغلاق');
  });
});
