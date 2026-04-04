export interface EmbeddingFragmentPlan {
  allFragments: string[];
  fragmentMap: number[][];
  splitTexts: Array<{
    textIndex: number;
    originalLength: number;
    fragmentCount: number;
  }>;
}

export interface EmbeddingLikeResult {
  embedding: number[];
}

export interface AggregatedEmbeddingResult {
  text: string;
  embedding: number[];
  index: number;
}

export function planEmbeddingFragments(
  texts: string[],
  maxInputTokens: number,
): EmbeddingFragmentPlan {
  const allFragments: string[] = [];
  const fragmentMap: number[][] = [];
  const splitTexts: EmbeddingFragmentPlan['splitTexts'] = [];

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];

    if (estimateEmbeddingTokens(text) <= maxInputTokens) {
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
  return Math.ceil(text.length / 2);
}

export function splitOversizedText(text: string, maxInputTokens: number): string[] {
  const maxChars = maxInputTokens * 2;
  if (text.length <= maxChars) {
    return [text];
  }

  const lines = text.split('\n');
  const fragments: string[] = [];
  let current = '';

  for (const line of lines) {
    const candidate = current.length === 0 ? line : `${current}\n${line}`;
    if (candidate.length > maxChars && current.length > 0) {
      fragments.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }

  if (current.length > 0) {
    fragments.push(current);
  }

  for (let i = 0; i < fragments.length; i++) {
    if (fragments[i].length > maxChars) {
      fragments[i] = fragments[i].slice(0, maxChars);
    }
  }

  return fragments.length > 0 ? fragments : [text.slice(0, maxChars)];
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
