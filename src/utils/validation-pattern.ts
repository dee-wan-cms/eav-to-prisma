// Unicode property escapes require u; other stored patterns keep their original semantics.
export function validationPatternFlags(pattern: string): '' | 'u' {
  for (let index = 0; index < pattern.length; index += 1) {
    if (pattern[index] !== '\\') continue;
    const escape = pattern[index + 1];
    if ((escape === 'p' || escape === 'P') && pattern[index + 2] === '{') return 'u';
    index += 1;
  }
  return '';
}

export function compileValidationPattern(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, validationPatternFlags(pattern));
  } catch {
    return null;
  }
}
