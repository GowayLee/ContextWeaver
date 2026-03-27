const MAX_TERMS = 20;
const MIN_TERM_LEN = 3;
const MAX_TERM_LEN = 64;

export function extractTechnicalTerms(prompt: string): string[] {
  const terms = new Set<string>();

  for (const m of prompt.matchAll(/`([^`]+)`/g)) {
    const val = m[1].trim();
    if (val.length >= MIN_TERM_LEN && val.length <= MAX_TERM_LEN) {
      terms.add(val);
    }
  }

  for (const m of prompt.matchAll(
    /(?:^|\s)((?:[\w./-]+\/)?[\w-]+\.[a-zA-Z]\w{0,7})(?=[\s,;:.)}\]>]|$)/gm,
  )) {
    const val = m[1];
    if (val.length >= MIN_TERM_LEN && val.length <= MAX_TERM_LEN) {
      terms.add(val);
    }
  }

  for (const m of prompt.matchAll(/\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g)) {
    if (m[1].length >= MIN_TERM_LEN && m[1].length <= MAX_TERM_LEN) {
      terms.add(m[1]);
    }
  }

  for (const m of prompt.matchAll(/\b([a-z][a-zA-Z]*[A-Z][a-zA-Z]*)\b/g)) {
    if (m[1].length >= MIN_TERM_LEN && m[1].length <= MAX_TERM_LEN) {
      terms.add(m[1]);
    }
  }

  for (const m of prompt.matchAll(/\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g)) {
    if (m[1].length >= MIN_TERM_LEN && m[1].length <= MAX_TERM_LEN) {
      terms.add(m[1]);
    }
  }

  return Array.from(terms).slice(0, MAX_TERMS);
}
