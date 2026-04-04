export interface EmbeddingFragmentPlan {
  allFragments: string[];
  fragmentMap: number[][];
  splitTexts: Array<{
    textIndex: number;
    originalLength: number;
    fragmentCount: number;
  }>;
}

export interface EmbeddingTokenBudget {
  maxInputTokens: number;
  safetyMarginTokens: number;
  effectiveTokenBudget: number;
}

export interface EmbeddingLikeResult {
  embedding: number[];
}

export interface AggregatedEmbeddingResult {
  text: string;
  embedding: number[];
  index: number;
}

const EMBEDDING_TOKEN_SAFETY_MARGIN_RATIO = 0.05;

export function planEmbeddingFragments(
  texts: string[],
  maxInputTokens: number,
): EmbeddingFragmentPlan {
  const allFragments: string[] = [];
  const fragmentMap: number[][] = [];
  const splitTexts: EmbeddingFragmentPlan['splitTexts'] = [];

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];

    if (isWithinEmbeddingTokenBudget(text, maxInputTokens)) {
      fragmentMap.push([allFragments.length]);
      allFragments.push(text);
      continue;
    }

    const fragments = splitOversizedText(text, maxInputTokens);
    const indices: number[] = [];

    for (const fragment of fragments) {
      indices.push(allFragments.length);
      allFragments.push(fragment);
    }

    fragmentMap.push(indices);
    splitTexts.push({
      textIndex: i,
      originalLength: text.length,
      fragmentCount: fragments.length,
    });
  }

  return {
    allFragments,
    fragmentMap,
    splitTexts,
  };
}

export function aggregateFragmentEmbeddings(
  texts: string[],
  fragmentMap: number[][],
  flatResults: EmbeddingLikeResult[],
): AggregatedEmbeddingResult[] {
  const results: AggregatedEmbeddingResult[] = [];

  for (let i = 0; i < texts.length; i++) {
    const indices = fragmentMap[i];

    if (indices.length === 1) {
      results.push({
        text: texts[i],
        embedding: flatResults[indices[0]].embedding,
        index: i,
      });
      continue;
    }

    results.push({
      text: texts[i],
      embedding: averageEmbeddings(indices.map((index) => flatResults[index].embedding)),
      index: i,
    });
  }

  return results;
}

export function estimateEmbeddingTokens(text: string): number {
  const utf8Bytes = Buffer.byteLength(text, 'utf8');
  return Math.max(text.length, Math.ceil(utf8Bytes / 2));
}

export function getEmbeddingTokenBudget(maxInputTokens: number): EmbeddingTokenBudget {
  const safetyMarginTokens = Math.max(
    1,
    Math.ceil(maxInputTokens * EMBEDDING_TOKEN_SAFETY_MARGIN_RATIO),
  );

  return {
    maxInputTokens,
    safetyMarginTokens,
    effectiveTokenBudget: Math.max(1, maxInputTokens - safetyMarginTokens),
  };
}

export function isWithinEmbeddingTokenBudget(text: string, maxInputTokens: number): boolean {
  return (
    estimateEmbeddingTokens(text) <= getEmbeddingTokenBudget(maxInputTokens).effectiveTokenBudget
  );
}

export function assertWithinEmbeddingTokenBudget(text: string, maxInputTokens: number): void {
  const estimatedTokens = estimateEmbeddingTokens(text);
  const budget = getEmbeddingTokenBudget(maxInputTokens);

  if (estimatedTokens <= budget.effectiveTokenBudget) {
    return;
  }

  throw new Error(
    `文本估算 token 超过 embedding 安全预算: estimated=${estimatedTokens}, effectiveBudget=${budget.effectiveTokenBudget}, maxInputTokens=${budget.maxInputTokens}, safetyMargin=${budget.safetyMarginTokens}`,
  );
}

export function splitOversizedText(text: string, maxInputTokens: number): string[] {
  if (isWithinEmbeddingTokenBudget(text, maxInputTokens)) {
    return [text];
  }

  const lines = text.split('\n');
  const fragments: string[] = [];
  let current = '';

  for (const line of lines) {
    const candidate = current.length === 0 ? line : `${current}\n${line}`;

    if (isWithinEmbeddingTokenBudget(candidate, maxInputTokens)) {
      current = candidate;
      continue;
    }

    if (current.length > 0) {
      fragments.push(current);
      current = '';
    }

    if (line.length === 0) {
      current = line;
      continue;
    }

    let remaining = line;
    while (remaining.length > 0) {
      const clipped = clipTextToBudget(remaining, maxInputTokens);
      fragments.push(clipped);
      remaining = remaining.slice(clipped.length);
    }
  }

  if (current.length > 0) {
    fragments.push(current);
  }

  if (fragments.length === 0) {
    return [clipTextToBudget(text, maxInputTokens)];
  }

  for (const fragment of fragments) {
    assertWithinEmbeddingTokenBudget(fragment, maxInputTokens);
  }

  return fragments;
}

export function clipTextToBudget(text: string, maxInputTokens: number): string {
  if (text.length === 0) {
    return text;
  }

  let low = 1;
  let high = text.length;
  let bestFit = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = text.slice(0, mid);

    if (isWithinEmbeddingTokenBudget(candidate, maxInputTokens)) {
      bestFit = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return text.slice(0, Math.max(1, bestFit));
}

export function averageEmbeddings(embeddings: number[][]): number[] {
  const dimensions = embeddings[0].length;
  const result = new Array(dimensions).fill(0);

  for (const embedding of embeddings) {
    for (let i = 0; i < dimensions; i++) {
      result[i] += embedding[i];
    }
  }

  for (let i = 0; i < dimensions; i++) {
    result[i] /= embeddings.length;
  }

  return result;
}
