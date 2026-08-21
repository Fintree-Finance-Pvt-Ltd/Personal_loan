// Local (no third-party call) fuzzy name matching, used to cross-check that the names
// on PAN, Aadhaar, and bank-account records plausibly belong to the same person.
// Deliberately NOT calling Digio's fuzzy-match API here (used elsewhere for the
// PAN-anchored bank-name check) — that's a paid, live third-party call, and comparing
// two names we've already independently verified and already hold in our own DB
// doesn't need a new external dependency for that.

const HONORIFICS = ['MR', 'MRS', 'MS', 'MISS', 'DR', 'SHRI', 'SMT', 'KUM', 'SHRIMATI'];

// Real Indian bank/KYC records routinely collapse a middle or last name down to a
// single initial ("Rammaya P" for "Rammaya Pandit", "Pratik A Sonanwane" for "Pratik
// Ashok Sonawane") — this is a normal data-entry convention, not a sign of a different
// person, and treating it as a near-total mismatch (as a plain token-set/Levenshtein
// comparison does) produces false positives on exactly the cases this check exists to
// let through cleanly. An initial matching the first letter of the other name's token
// gets high (not full) credit — it's consistent with a match, though weaker evidence
// than an exact token, since many names share a first letter.
const INITIAL_MATCH_SCORE = 88;

function normalize(name: string): string[] {
  const cleaned = String(name || '')
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned
    .split(' ')
    .filter((token) => token.length > 0 && !HONORIFICS.includes(token));
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let previousRow = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i += 1) {
    const currentRow = [i];
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currentRow.push(
        Math.min(
          currentRow[j - 1] + 1,
          previousRow[j] + 1,
          previousRow[j - 1] + cost,
        ),
      );
    }
    previousRow = currentRow;
  }
  return previousRow[n];
}

function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 100;
  if (a.length === 1 && b.startsWith(a)) return INITIAL_MATCH_SCORE;
  if (b.length === 1 && a.startsWith(b)) return INITIAL_MATCH_SCORE;

  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 100;
  const distance = levenshtein(a, b);
  return Math.round(((maxLen - distance) / maxLen) * 100);
}

/**
 * Compares two names token-by-token rather than as whole strings, so that name-order
 * differences ("Shah Lalit" vs "Lalit Shah") and initial-vs-full-word abbreviations
 * ("Rammaya P" vs "Rammaya Pandit") are both recognized as consistent, not penalized as
 * if they were unrelated names. Greedily pairs the best-matching tokens across both
 * names (adequate for realistic name lengths — rarely more than 4-5 tokens), then
 * averages matched-pair scores over the LONGER name's token count, so an entirely
 * dropped/extra token (not an abbreviation, an omission) still pulls the score down.
 */
export function matchNames(nameA: string | null | undefined, nameB: string | null | undefined): number {
  const tokensA = normalize(nameA || '');
  const tokensB = normalize(nameB || '');
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const pairs: Array<{ i: number; j: number; score: number }> = [];
  for (let i = 0; i < tokensA.length; i += 1) {
    for (let j = 0; j < tokensB.length; j += 1) {
      pairs.push({ i, j, score: tokenSimilarity(tokensA[i], tokensB[j]) });
    }
  }
  pairs.sort((x, y) => y.score - x.score);

  const usedA = new Set<number>();
  const usedB = new Set<number>();
  let totalScore = 0;
  for (const pair of pairs) {
    if (usedA.has(pair.i) || usedB.has(pair.j)) continue;
    usedA.add(pair.i);
    usedB.add(pair.j);
    totalScore += pair.score;
  }

  const longerLength = Math.max(tokensA.length, tokensB.length);
  return Math.round(totalScore / longerLength);
}

export function namesLikelyMatch(
  nameA: string | null | undefined,
  nameB: string | null | undefined,
  threshold = 70,
): { score: number; matched: boolean } {
  const score = matchNames(nameA, nameB);
  return { score, matched: score >= threshold };
}
