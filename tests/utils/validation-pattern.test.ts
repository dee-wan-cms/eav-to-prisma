import { describe, expect, it } from 'vitest';
import { compileValidationPattern, validationPatternFlags } from '../../src/utils/validation-pattern';

describe('shared validation pattern flags', () => {
  it.each(['ข่าวสารใหม่', 'новые-статьи', 'café', 'cafe\u0301'])('matches Unicode letters and marks in %s', (value) => {
    expect(compileValidationPattern('^[\\p{L}\\p{N}\\p{M}-]+$')?.test(value)).toBe(true);
  });
  it('preserves intentional ASCII restrictions and legacy non-Unicode expressions', () => {
    expect(compileValidationPattern('^[a-z0-9-]+$')?.test('новости')).toBe(false);
    expect(compileValidationPattern('^.$')?.test('😀')).toBe(false);
    expect(compileValidationPattern('^\\a$')?.test('a')).toBe(true);
  });
  it('distinguishes property escapes from escaped backslashes', () => {
    expect(validationPatternFlags(String.raw`^\p{L}+$`)).toBe('u');
    expect(validationPatternFlags(String.raw`^\\p{L}$`)).toBe('');
    expect(validationPatternFlags(String.raw`^\\\p{L}+$`)).toBe('u');
    expect(validationPatternFlags(String.raw`^\\\\p{L}$`)).toBe('');
    expect(compileValidationPattern(String.raw`^\\p{L}$`)?.test(String.raw`\p{L}`)).toBe(true);
    expect(compileValidationPattern(String.raw`^\P{L}+$`)?.test('123')).toBe(true);
  });
  it('refuses invalid Unicode properties rather than treating them as literal text', () => {
    expect(compileValidationPattern('\\p{NotAUnicodeProperty}')).toBeNull();
    expect(compileValidationPattern('([a-z')).toBeNull();
  });
});
