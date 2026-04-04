import type {
  EmbeddingFailureCategory,
  EmbeddingFailureDiagnostics,
  EmbeddingRequestContext,
} from './types.js';

export function isNetworkError(err: unknown): boolean {
  const error = err as { message?: string; code?: string } | undefined;
  const message = (error?.message || '').toLowerCase();
  const code = error?.code || '';

  const networkErrorPatterns = [
    'terminated',
    'econnreset',
    'etimedout',
    'enotfound',
    'econnrefused',
    'fetch failed',
    'socket hang up',
    'network',
    'aborted',
  ];

  for (const pattern of networkErrorPatterns) {
    if (message.includes(pattern)) {
      return true;
    }
  }

  const networkErrorCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'EPIPE'];
  return networkErrorCodes.includes(code);
}

export function isTimeoutError(err: unknown): boolean {
  const error = err as { message?: string; code?: string; name?: string } | undefined;
  const message = (error?.message || '').toLowerCase();
  const code = (error?.code || '').toUpperCase();
  const name = error?.name || '';

  return (
    name === 'AbortError' ||
    code === 'ETIMEDOUT' ||
    message.includes('timeout') ||
    message.includes('timed out')
  );
}

export function classifyEmbeddingFailure(
  httpStatus: number | null,
  providerType: string | null,
  providerCode: string | null,
  upstreamMessage: string,
  err?: unknown,
): EmbeddingFailureCategory {
  const signal = `${providerType ?? ''} ${providerCode ?? ''} ${upstreamMessage}`.toLowerCase();

  if (
    httpStatus === 401 ||
    httpStatus === 403 ||
    hasAnySignal(signal, ['auth', 'api_key', 'unauthorized', 'forbidden'])
  ) {
    return 'authentication';
  }

  if (httpStatus === 429 || hasAnySignal(signal, ['rate', 'quota', 'too many requests'])) {
    return 'rate_limit';
  }

  if (
    (httpStatus === 400 || httpStatus === 413) &&
    hasAnySignal(signal, ['batch', 'too large', 'max input', 'payload too large'])
  ) {
    return 'batch_too_large';
  }

  if (hasAnySignal(signal, ['dimension'])) {
    return 'dimension_mismatch';
  }

  if (isTimeoutError(err) || hasAnySignal(signal, ['timeout', 'timed out'])) {
    return 'timeout';
  }

  if (isNetworkError(err) || hasAnySignal(signal, ['econnreset', 'enotfound', 'fetch failed'])) {
    return 'network';
  }

  if (
    httpStatus === 200 &&
    hasAnySignal(signal, ['缺少 data', '非数值向量', '越界的结果索引', '维度不匹配'])
  ) {
    return 'incompatible_response';
  }

  if (hasAnySignal(signal, ['response', 'payload', 'embedding'])) {
    if (hasAnySignal(signal, ['缺少 data', '非数值向量', '越界的结果索引', '维度不匹配'])) {
      return 'incompatible_response';
    }
  }

  return 'unknown';
}

export function createFailureDiagnostics(
  requestContext: EmbeddingRequestContext,
  details: {
    httpStatus: number | null;
    providerType: string | null;
    providerCode: string | null;
    upstreamMessage: string;
    category?: EmbeddingFailureCategory;
  },
  err?: unknown,
): EmbeddingFailureDiagnostics {
  return {
    stage: 'embed',
    category:
      details.category ??
      classifyEmbeddingFailure(
        details.httpStatus,
        details.providerType,
        details.providerCode,
        details.upstreamMessage,
        err,
      ),
    httpStatus: details.httpStatus,
    providerType: details.providerType,
    providerCode: details.providerCode,
    upstreamMessage: details.upstreamMessage,
    endpointHost: requestContext.endpointHost,
    endpointPath: requestContext.endpointPath,
    model: requestContext.model,
    batchSize: requestContext.batchSize,
    dimensions: requestContext.dimensions,
    requestCount: requestContext.requestCount,
  };
}

export function getUpstreamMessage(err: unknown): string {
  if (err instanceof Error) {
    const diagnostics = err as { diagnostics?: { upstreamMessage?: string } };
    if (diagnostics.diagnostics?.upstreamMessage) {
      return diagnostics.diagnostics.upstreamMessage;
    }
    return err.message;
  }
  return String(err);
}

export function formatEmbeddingErrorMessage(err: unknown): string {
  const upstreamMessage = getUpstreamMessage(err);
  return upstreamMessage.startsWith('Embedding API 错误:')
    ? upstreamMessage
    : `Embedding API 错误: ${upstreamMessage}`;
}

function hasAnySignal(text: string, signals: string[]): boolean {
  return signals.some((signal) => text.includes(signal));
}
