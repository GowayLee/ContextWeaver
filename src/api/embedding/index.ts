export {
  EmbeddingClient,
  getEmbeddingClient,
  resetEmbeddingClientForTests,
} from './client.js';
export { createFailureDiagnostics } from './errors.js';
export {
  aggregateFragmentEmbeddings,
  assertWithinEmbeddingTokenBudget,
  clipTextToBudget,
  estimateEmbeddingTokens,
  getEmbeddingTokenBudget,
  isWithinEmbeddingTokenBudget,
  planEmbeddingFragments,
  splitOversizedText,
} from './fragments.js';
export type {
  EmbeddingFailureCategory,
  EmbeddingFailureDiagnostics,
  EmbeddingResult,
} from './types.js';
export { EmbeddingFatalError } from './types.js';
