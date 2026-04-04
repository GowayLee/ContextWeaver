import { getRerankerConfig, type RerankerConfig } from '../../config.js';
import { logger } from '../../utils/logger.js';
import { sleep } from '../shared/sleep.js';
import { requestRerank } from './transport.js';
import type { RerankedDocument, RerankOptions, RerankRequest } from './types.js';

export class RerankerClient {
  private config: RerankerConfig;

  constructor(config?: RerankerConfig) {
    this.config = config || getRerankerConfig();
  }

  async rerank(
    query: string,
    documents: string[],
    options: RerankOptions = {},
  ): Promise<RerankedDocument[]> {
    if (documents.length === 0) {
      return [];
    }

    const { topN = this.config.topN, maxChunksPerDoc, chunkOverlap, retries = 3 } = options;
    const requestBody: RerankRequest = {
      model: this.config.model,
      query,
      documents,
      top_n: Math.min(topN, documents.length),
      return_documents: false,
    };

    if (maxChunksPerDoc !== undefined) {
      requestBody.max_chunks_per_doc = maxChunksPerDoc;
    }
    if (chunkOverlap !== undefined) {
      requestBody.overlap = chunkOverlap;
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const data = await requestRerank(this.config, requestBody);
        const results: RerankedDocument[] = data.results.map((item) => ({
          originalIndex: item.index,
          score: item.relevance_score,
          text: documents[item.index],
        }));

        logger.debug(
          {
            query: query.slice(0, 50),
            inputCount: documents.length,
            outputCount: results.length,
          },
          'Rerank 完成',
        );

        return results;
      } catch (err) {
        const error = err as { message?: string; stack?: string };
        const isRateLimited = error.message?.includes('429') || error.message?.includes('rate');

        if (attempt < retries) {
          const delay = isRateLimited ? 1000 * attempt : 500 * attempt;
          logger.warn(
            { attempt, maxRetries: retries, delay, error: error.message },
            'Rerank 请求失败，准备重试',
          );
          await sleep(delay);
        } else {
          logger.error(
            {
              error: error.message,
              stack: error.stack,
              query: query.slice(0, 50),
            },
            'Rerank 请求最终失败',
          );
          throw err;
        }
      }
    }

    throw new Error('Rerank 处理异常');
  }

  async rerankWithData<T>(
    query: string,
    items: T[],
    textExtractor: (item: T) => string,
    options: RerankOptions = {},
  ): Promise<RerankedDocument<T>[]> {
    if (items.length === 0) {
      return [];
    }

    const texts = items.map(textExtractor);
    const results = await this.rerank(query, texts, options);

    return results.map((result) => ({
      ...result,
      data: items[result.originalIndex],
    }));
  }

  getConfig(): RerankerConfig {
    return { ...this.config };
  }
}

let defaultClient: RerankerClient | null = null;

export function getRerankerClient(): RerankerClient {
  if (!defaultClient) {
    defaultClient = new RerankerClient();
  }
  return defaultClient;
}
