import { logger } from '../../utils/logger.js';
import { sleep } from '../shared/sleep.js';

export interface RateLimitStatus {
  isPaused: boolean;
  currentConcurrency: number;
  maxConcurrency: number;
  activeRequests: number;
  backoffMs: number;
}

export class RateLimitController {
  private isPaused = false;
  private pausePromise: Promise<void> | null = null;
  private currentConcurrency: number;
  private maxConcurrency: number;
  private activeRequests = 0;
  private consecutiveSuccesses = 0;
  private backoffMs = 5000;
  private readonly successesPerConcurrencyIncrease = 3;
  private readonly minBackoffMs = 5000;
  private readonly maxBackoffMs = 60000;

  constructor(maxConcurrency: number) {
    this.maxConcurrency = maxConcurrency;
    this.currentConcurrency = maxConcurrency;
  }

  async acquire(): Promise<void> {
    if (this.pausePromise) {
      await this.pausePromise;
    }

    while (this.activeRequests >= this.currentConcurrency) {
      await sleep(50);
      if (this.pausePromise) {
        await this.pausePromise;
      }
    }

    this.activeRequests++;
  }

  releaseSuccess(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    this.consecutiveSuccesses++;

    if (
      this.currentConcurrency < this.maxConcurrency &&
      this.consecutiveSuccesses >= this.successesPerConcurrencyIncrease
    ) {
      this.currentConcurrency++;
      this.consecutiveSuccesses = 0;
    }

    if (this.consecutiveSuccesses > 0 && this.consecutiveSuccesses % 10 === 0) {
      this.backoffMs = Math.max(this.minBackoffMs, this.backoffMs / 2);
    }
  }

  releaseFailure(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
  }

  releaseForRetry(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    this.consecutiveSuccesses = 0;
  }

  async triggerRateLimit(): Promise<void> {
    if (this.isPaused && this.pausePromise) {
      logger.debug('速率限制：等待现有暂停结束');
      await this.pausePromise;
      return;
    }

    this.isPaused = true;
    this.consecutiveSuccesses = 0;

    const previousConcurrency = this.currentConcurrency;
    this.currentConcurrency = 1;

    logger.warn(
      {
        backoffMs: this.backoffMs,
        previousConcurrency,
        newConcurrency: this.currentConcurrency,
        activeRequests: this.activeRequests,
      },
      '速率限制：触发 429，暂停所有请求',
    );

    let resumeResolve: () => void = () => {};
    this.pausePromise = new Promise<void>((resolve) => {
      resumeResolve = resolve;
    });

    await sleep(this.backoffMs);
    this.backoffMs = Math.min(this.maxBackoffMs, this.backoffMs * 2);
    this.isPaused = false;
    this.pausePromise = null;
    resumeResolve();

    logger.info({ waitMs: this.backoffMs }, '速率限制：恢复请求');
  }

  getStatus(): RateLimitStatus {
    return {
      isPaused: this.isPaused,
      currentConcurrency: this.currentConcurrency,
      maxConcurrency: this.maxConcurrency,
      activeRequests: this.activeRequests,
      backoffMs: this.backoffMs,
    };
  }
}

let globalRateLimitController: RateLimitController | null = null;

export function getRateLimitController(maxConcurrency: number): RateLimitController {
  if (!globalRateLimitController) {
    globalRateLimitController = new RateLimitController(maxConcurrency);
  }
  return globalRateLimitController;
}

export function resetRateLimitControllerForTests(): void {
  globalRateLimitController = null;
}
