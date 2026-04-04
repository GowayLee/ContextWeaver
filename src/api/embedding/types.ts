export type EmbeddingFailureCategory =
  | 'authentication'
  | 'rate_limit'
  | 'batch_too_large'
  | 'dimension_mismatch'
  | 'timeout'
  | 'network'
  | 'incompatible_response'
  | 'unknown';

export interface EmbeddingFailureDiagnostics {
  stage: 'embed';
  category: EmbeddingFailureCategory;
  httpStatus: number | null;
  providerType: string | null;
  providerCode: string | null;
  upstreamMessage: string;
  endpointHost: string;
  endpointPath: string;
  model: string;
  batchSize: number;
  dimensions: number;
  requestCount: number;
}

export interface EmbeddingResult {
  text: string;
  embedding: number[];
  index: number;
}

export interface EmbeddingRequestContext {
  endpointHost: string;
  endpointPath: string;
  model: string;
  batchSize: number;
  dimensions: number;
  requestCount: number;
}

export interface EmbeddingSession {
  fatalError: EmbeddingFatalError | null;
  controllers: Set<AbortController>;
}

export interface EmbeddingRequest {
  model: string;
  input: string | string[];
  encoding_format?: 'float' | 'base64';
}

export interface EmbeddingData {
  object: 'embedding';
  index: number;
  embedding: number[];
}

export interface EmbeddingResponse {
  object: 'list';
  data: EmbeddingData[];
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export interface EmbeddingErrorResponse {
  error?: {
    message: string;
    type?: string;
    code?: string;
  };
}

export class EmbeddingFatalError extends Error {
  readonly stage = 'embed';
  readonly diagnostics: EmbeddingFailureDiagnostics;

  constructor(
    message: string,
    options?: { cause?: unknown; diagnostics?: EmbeddingFailureDiagnostics },
  ) {
    super(message, options);
    this.name = 'EmbeddingFatalError';
    this.diagnostics =
      options?.diagnostics ??
      createFallbackDiagnostics({
        upstreamMessage: message,
      });
  }
}

export function createFallbackDiagnostics(options: {
  category?: EmbeddingFailureCategory;
  upstreamMessage: string;
}): EmbeddingFailureDiagnostics {
  return {
    stage: 'embed',
    category: options.category ?? 'unknown',
    httpStatus: null,
    providerType: null,
    providerCode: null,
    upstreamMessage: options.upstreamMessage,
    endpointHost: '<unknown>',
    endpointPath: '/',
    model: '<unknown>',
    batchSize: 0,
    dimensions: 0,
    requestCount: 0,
  };
}
