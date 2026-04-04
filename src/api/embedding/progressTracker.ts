import { logger } from '../../utils/logger.js';

export class ProgressTracker {
  private completed = 0;
  private total: number;
  private totalTokens = 0;
  private startTime: number;
  private lastLogTime = 0;
  private readonly logIntervalMs = 2000;
  private onProgress?: (completed: number, total: number) => void;
  private readonly skipLogs: boolean;

  constructor(total: number, onProgress?: (completed: number, total: number) => void) {
    this.total = total;
    this.startTime = Date.now();
    this.onProgress = onProgress;
    this.skipLogs = total <= 1;
  }

  recordBatch(tokens: number): void {
    this.completed++;
    this.totalTokens += tokens;
    this.onProgress?.(this.completed, this.total);

    const now = Date.now();
    if (now - this.lastLogTime >= this.logIntervalMs) {
      this.logProgress();
      this.lastLogTime = now;
    }
  }

  complete(): void {
    if (this.skipLogs) {
      return;
    }

    const elapsed = (Date.now() - this.startTime) / 1000;
    logger.info(
      {
        batches: this.total,
        tokens: this.totalTokens,
        elapsed: `${elapsed.toFixed(1)}s`,
        avgTokensPerBatch: Math.round(this.totalTokens / this.total),
      },
      'Embedding 完成',
    );
  }

  private logProgress(): void {
    if (this.skipLogs) {
      return;
    }

    const elapsed = (Date.now() - this.startTime) / 1000;
    const percent = Math.round((this.completed / this.total) * 100);
    const rate = this.completed / elapsed;
    const eta = rate > 0 ? Math.round((this.total - this.completed) / rate) : 0;

    logger.info(
      {
        progress: `${this.completed}/${this.total}`,
        percent: `${percent}%`,
        tokens: this.totalTokens,
        elapsed: `${elapsed.toFixed(1)}s`,
        eta: `${eta}s`,
      },
      'Embedding 进度',
    );
  }
}
