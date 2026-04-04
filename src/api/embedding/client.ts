import { type EmbeddingConfig, getEmbeddingConfig } from '../../config.js';
import { logger } from '../../utils/logger.js';
import { sleep } from '../shared/sleep.js';
import {
  classifyEmbeddingFailure,
  formatEmbeddingErrorMessage,
  getUpstreamMessage,
  isNetworkError,
  isTimeoutError,
} from './errors.js';
import {
  aggregateFragmentEmbeddings,
  getEmbeddingTokenBudget,
  planEmbeddingFragments,
} from './fragments.js';
import { ProgressTracker } from './progressTracker.js';
import {
  getRateLimitController,
  type RateLimitController,
  type RateLimitStatus,
  resetRateLimitControllerForTests,
} from './rateLimitController.js';
import { processEmbeddingBatch } from './transport.js';
import type { EmbeddingResult, EmbeddingSession } from './types.js';
import { createFallbackDiagnostics, EmbeddingFatalError } from './types.js';

export class EmbeddingClient {
  private config: EmbeddingConfig;
  private rateLimiter: RateLimitController;

  constructor(config?: EmbeddingConfig) {
    this.config = config || getEmbeddingConfig();
    this.rateLimiter = getRateLimitController(this.config.maxConcurrency);
  }

  async embed(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    return results[0].embedding;
  }

  async embedBatch(
    texts: string[],
    batchSize = this.config.batchSize,
    onProgress?: (completed: number, total: number) => void,
  ): Promise<EmbeddingResult[]> {
    if (texts.length === 0) {
      return [];
    }

    const budget = getEmbeddingTokenBudget(this.config.maxInputTokens);
    const fragmentPlan = planEmbeddingFragments(texts, this.config.maxInputTokens);

    for (const splitText of fragmentPlan.splitTexts) {
      logger.warn(
        {
          textIndex: splitText.textIndex,
          originalLength: splitText.originalLength,
          effectiveTokenBudget: budget.effectiveTokenBudget,
          maxInputTokens: budget.maxInputTokens,
          safetyMarginTokens: budget.safetyMarginTokens,
          fragmentCount: splitText.fragmentCount,
        },
        '文本超过 embedding 模型输入上限，已拆分为多个子片段',
      );
    }

    const flatResults = await this.embedFragments(fragmentPlan.allFragments, batchSize, onProgress);
    return aggregateFragmentEmbeddings(texts, fragmentPlan.fragmentMap, flatResults);
  }

  getConfig(): EmbeddingConfig {
    return { ...this.config };
  }

  getRateLimiterStatus(): RateLimitStatus {
    return this.rateLimiter.getStatus();
  }

  private async embedFragments(
    texts: string[],
    batchSize: number,
    onProgress?: (completed: number, total: number) => void,
  ): Promise<EmbeddingResult[]> {
    const batches: string[][] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      batches.push(texts.slice(i, i + batchSize));
    }

    const progress = new ProgressTracker(batches.length, onProgress);
    const session: EmbeddingSession = {
      fatalError: null,
      controllers: new Set(),
    };

    const batchResults = await Promise.all(
      batches.map((batch, batchIndex) =>
        this.processWithRateLimit(batch, batchIndex * batchSize, batchSize, progress, session),
      ),
    );

    progress.complete();
    return batchResults.flat();
  }

  private async processWithRateLimit(
    texts: string[],
    startIndex: number,
    batchSize: number,
    progress: ProgressTracker,
    session: EmbeddingSession,
  ): Promise<EmbeddingResult[]> {
    const MAX_NETWORK_RETRIES = 3;
    const MAX_RATE_LIMIT_RETRIES = 3;

    let networkRetries = 0;
    let rateLimitRetries = 0;

    while (true) {
      if (session.fatalError) {
        throw session.fatalError;
      }

      await this.rateLimiter.acquire();

      if (session.fatalError) {
        this.rateLimiter.releaseFailure();
        throw session.fatalError;
      }

      try {
        const result = await this.processBatch(texts, startIndex, batchSize, progress, session);

        if (session.fatalError) {
          this.rateLimiter.releaseFailure();
          throw session.fatalError;
        }

        this.rateLimiter.releaseSuccess();
        return result;
      } catch (err) {
        if (session.fatalError) {
          this.rateLimiter.releaseFailure();
          throw session.fatalError;
        }

        const fatalError = err instanceof EmbeddingFatalError ? err : null;
        const error = err as { message?: string; code?: string } | undefined;
        const errorMessage = fatalError?.diagnostics.upstreamMessage || error?.message || '';
        const isRateLimited =
          fatalError?.diagnostics.httpStatus === 429 ||
          errorMessage.includes('429') ||
          errorMessage.includes('rate');
        const timeoutError = isTimeoutError(fatalError?.cause ?? err);
        const networkError = isNetworkError(fatalError?.cause ?? err);

        if (isRateLimited) {
          if (rateLimitRetries < MAX_RATE_LIMIT_RETRIES) {
            rateLimitRetries++;
            this.rateLimiter.releaseForRetry();
            await this.rateLimiter.triggerRateLimit();
            networkRetries = 0;
          } else {
            const sessionError = this.failSession(session, err);
            this.rateLimiter.releaseFailure();
            throw sessionError;
          }
        } else if (!timeoutError && networkError && networkRetries < MAX_NETWORK_RETRIES) {
          networkRetries++;
          const delayMs = 1000 * 2 ** (networkRetries - 1);

          logger.warn(
            {
              error: errorMessage,
              retry: networkRetries,
              maxRetries: MAX_NETWORK_RETRIES,
              delayMs,
            },
            '网络错误，准备重试',
          );

          this.rateLimiter.releaseForRetry();
          await sleep(delayMs);
        } else {
          const sessionError = this.failSession(session, err);
          this.rateLimiter.releaseFailure();

          if (networkError) {
            logger.error({ error: errorMessage, retries: networkRetries }, '网络错误重试次数耗尽');
          }

          throw sessionError;
        }
      }
    }
  }

  private async processBatch(
    texts: string[],
    startIndex: number,
    batchSize: number,
    progress: Pick<ProgressTracker, 'recordBatch'>,
    session: EmbeddingSession,
  ): Promise<EmbeddingResult[]> {
    const { results, totalTokens } = await processEmbeddingBatch({
      config: this.config,
      texts,
      startIndex,
      batchSize,
      session,
    });

    if (session.fatalError) {
      throw session.fatalError;
    }

    progress.recordBatch(totalTokens);
    return results;
  }

  private failSession(session: EmbeddingSession, err: unknown): EmbeddingFatalError {
    if (session.fatalError) {
      return session.fatalError;
    }

    const fatalError =
      err instanceof EmbeddingFatalError
        ? err
        : new EmbeddingFatalError(formatEmbeddingErrorMessage(err), {
            cause: err,
            diagnostics: createFallbackDiagnostics({
              category: classifyEmbeddingFailure(null, null, null, getUpstreamMessage(err), err),
              upstreamMessage: getUpstreamMessage(err),
            }),
          });
    session.fatalError = fatalError;

    for (const controller of session.controllers) {
      controller.abort();
    }

    return fatalError;
  }
}

let defaultClient: EmbeddingClient | null = null;

export function getEmbeddingClient(): EmbeddingClient {
  if (!defaultClient) {
    defaultClient = new EmbeddingClient();
  }
  return defaultClient;
}

export function resetEmbeddingClientForTests(): void {
  defaultClient = null;
  resetRateLimitControllerForTests();
}
