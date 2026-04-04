import type { EmbeddingConfig } from '../../config.js';
import {
  createFailureDiagnostics,
  formatEmbeddingErrorMessage,
  getUpstreamMessage,
} from './errors.js';
import { assertWithinEmbeddingTokenBudget } from './fragments.js';
import type {
  EmbeddingErrorResponse,
  EmbeddingRequest,
  EmbeddingRequestContext,
  EmbeddingResponse,
  EmbeddingResult,
  EmbeddingSession,
} from './types.js';
import { EmbeddingFatalError } from './types.js';

export async function processEmbeddingBatch(options: {
  config: EmbeddingConfig;
  texts: string[];
  startIndex: number;
  batchSize: number;
  session: EmbeddingSession;
}): Promise<{ results: EmbeddingResult[]; totalTokens: number }> {
  const { config, texts, startIndex, batchSize, session } = options;

  if (session.fatalError) {
    throw session.fatalError;
  }

  for (const text of texts) {
    try {
      assertWithinEmbeddingTokenBudget(text, config.maxInputTokens);
    } catch (err) {
      throw new EmbeddingFatalError(
        `Embedding 请求在发送前预算校验失败: ${(err as Error).message}`,
      );
    }
  }

  const requestBody: EmbeddingRequest = {
    model: config.model,
    input: texts,
    encoding_format: 'float',
  };
  const requestContext = createRequestContext(config, batchSize, texts.length);
  const controller = new AbortController();
  session.controllers.add(controller);

  try {
    const response = await fetch(config.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    const data = await readEmbeddingResponse(response, requestContext);

    if (!response.ok || data.error) {
      const upstreamMessage = data.error?.message || `HTTP ${response.status}`;
      throw new EmbeddingFatalError(`Embedding API 错误: ${upstreamMessage}`, {
        diagnostics: createFailureDiagnostics(requestContext, {
          httpStatus: response.status,
          providerType: data.error?.type ?? null,
          providerCode: data.error?.code ?? null,
          upstreamMessage,
        }),
      });
    }

    if (session.fatalError) {
      throw session.fatalError;
    }

    assertCompatibleResponse(data, texts, requestContext, config.dimensions);

    return {
      results: data.data.map((item) => ({
        text: texts[item.index],
        embedding: item.embedding,
        index: startIndex + item.index,
      })),
      totalTokens: data.usage?.total_tokens || 0,
    };
  } catch (err) {
    if (err instanceof EmbeddingFatalError) {
      throw err;
    }

    throw new EmbeddingFatalError(formatEmbeddingErrorMessage(err), {
      cause: err,
      diagnostics: createFailureDiagnostics(
        requestContext,
        {
          httpStatus: null,
          providerType: null,
          providerCode: null,
          upstreamMessage: getUpstreamMessage(err),
        },
        err,
      ),
    });
  } finally {
    session.controllers.delete(controller);
  }
}

function createRequestContext(
  config: EmbeddingConfig,
  batchSize: number,
  requestCount: number,
): EmbeddingRequestContext {
  const endpoint = parseEndpoint(config.baseUrl);
  return {
    endpointHost: endpoint.host,
    endpointPath: endpoint.path,
    model: config.model,
    batchSize,
    dimensions: config.dimensions,
    requestCount,
  };
}

async function readEmbeddingResponse(
  response: Response,
  requestContext: EmbeddingRequestContext,
): Promise<Partial<EmbeddingResponse & EmbeddingErrorResponse>> {
  try {
    return (await response.json()) as Partial<EmbeddingResponse & EmbeddingErrorResponse>;
  } catch (err) {
    throw new EmbeddingFatalError('Embedding API 返回了不可解析的响应', {
      cause: err,
      diagnostics: createFailureDiagnostics(
        requestContext,
        {
          httpStatus: response.status,
          providerType: null,
          providerCode: null,
          upstreamMessage: 'Embedding API 返回了不可解析的响应',
          category: 'incompatible_response',
        },
        err,
      ),
    });
  }
}

function assertCompatibleResponse(
  data: Partial<EmbeddingResponse & EmbeddingErrorResponse>,
  texts: string[],
  requestContext: EmbeddingRequestContext,
  expectedDimensions: number,
): asserts data is EmbeddingResponse {
  if (!Array.isArray(data.data)) {
    throw new EmbeddingFatalError('Embedding API 返回缺少 data 数组', {
      diagnostics: createFailureDiagnostics(requestContext, {
        httpStatus: 200,
        providerType: null,
        providerCode: null,
        upstreamMessage: 'Embedding API 返回缺少 data 数组',
        category: 'incompatible_response',
      }),
    });
  }

  for (const item of data.data) {
    if (typeof item?.index !== 'number' || item.index < 0 || item.index >= texts.length) {
      throw new EmbeddingFatalError('Embedding API 返回了越界的结果索引', {
        diagnostics: createFailureDiagnostics(requestContext, {
          httpStatus: 200,
          providerType: null,
          providerCode: null,
          upstreamMessage: 'Embedding API 返回了越界的结果索引',
          category: 'incompatible_response',
        }),
      });
    }

    if (
      !Array.isArray(item.embedding) ||
      item.embedding.some((value) => typeof value !== 'number')
    ) {
      throw new EmbeddingFatalError('Embedding API 返回了非数值向量', {
        diagnostics: createFailureDiagnostics(requestContext, {
          httpStatus: 200,
          providerType: null,
          providerCode: null,
          upstreamMessage: 'Embedding API 返回了非数值向量',
          category: 'incompatible_response',
        }),
      });
    }

    if (item.embedding.length !== expectedDimensions) {
      throw new EmbeddingFatalError(
        `Embedding 向量维度不匹配: expected ${expectedDimensions}, got ${item.embedding.length}`,
        {
          diagnostics: createFailureDiagnostics(requestContext, {
            httpStatus: 200,
            providerType: null,
            providerCode: null,
            upstreamMessage: `Embedding 向量维度不匹配: expected ${expectedDimensions}, got ${item.embedding.length}`,
            category: 'incompatible_response',
          }),
        },
      );
    }
  }
}

function parseEndpoint(baseUrl: string): { host: string; path: string } {
  try {
    const url = new URL(baseUrl);
    return {
      host: url.host,
      path: url.pathname || '/',
    };
  } catch {
    return {
      host: '<invalid-url>',
      path: '/',
    };
  }
}
