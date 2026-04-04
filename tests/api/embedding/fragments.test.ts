import { describe, expect, it } from 'vitest';
import {
  aggregateFragmentEmbeddings,
  estimateEmbeddingTokens,
  getEmbeddingTokenBudget,
  planEmbeddingFragments,
  splitOversizedText,
} from '../../../src/api/embedding/fragments.js';

describe('embedding fragments', () => {
  it('uses conservative token estimates for ascii chinese and multibyte text', () => {
    expect(estimateEmbeddingTokens('abcdef')).toBe(6);
    expect(estimateEmbeddingTokens('你好世界')).toBe(6);
    expect(estimateEmbeddingTokens('你好🙂')).toBe(5);
    expect(getEmbeddingTokenBudget(40)).toEqual({
      maxInputTokens: 40,
      safetyMarginTokens: 2,
      effectiveTokenBudget: 38,
    });
    expect(getEmbeddingTokenBudget(13)).toEqual({
      maxInputTokens: 13,
      safetyMarginTokens: 1,
      effectiveTokenBudget: 12,
    });
  });

  it('keeps texts within limit as single fragments', () => {
    const plan = planEmbeddingFragments(['short text', 'another'], 20);

    expect(plan.allFragments).toEqual(['short text', 'another']);
    expect(plan.fragmentMap).toEqual([[0], [1]]);
    expect(plan.splitTexts).toEqual([]);
  });

  it('splits oversized text by line and aggregates fragment embeddings back', () => {
    const text = ['alpha', 'beta', 'gamma', 'delta'].join('\n');

    const fragments = splitOversizedText(text, 10);
    expect(fragments).toEqual(['alpha', 'beta', 'gamma', 'delta']);

    const plan = planEmbeddingFragments([text, 'tail'], 10);
    const aggregated = aggregateFragmentEmbeddings([text, 'tail'], plan.fragmentMap, [
      { embedding: [1, 3, 5] },
      { embedding: [3, 5, 7] },
      { embedding: [5, 7, 9] },
      { embedding: [7, 9, 11] },
      { embedding: [10, 20, 30] },
    ]);

    expect(plan.fragmentMap).toEqual([[0, 1, 2, 3], [4]]);
    expect(plan.splitTexts).toEqual([
      {
        textIndex: 0,
        originalLength: text.length,
        fragmentCount: 4,
      },
    ]);
    expect(aggregated).toEqual([
      {
        text,
        embedding: [4, 6, 8],
        index: 0,
      },
      {
        text: 'tail',
        embedding: [10, 20, 30],
        index: 1,
      },
    ]);
  });

  it('clips oversized single-line text into request-safe fragments', () => {
    expect(splitOversizedText('abcdefghij', 10)).toEqual(['abcdefghi', 'j']);
  });
});
