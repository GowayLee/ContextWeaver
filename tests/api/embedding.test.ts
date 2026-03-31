import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EmbeddingClient,
  EmbeddingFatalError,
  resetEmbeddingClientForTests,
} from '../../src/api/embedding.js';

function createClient(overrides?: Partial<ConstructorParameters<typeof EmbeddingClient>[0]>) {
  return new EmbeddingClient({
    apiKey: 'test-key',
    baseUrl: 'https://example.com/embeddings',
    model: 'test-model',
    maxConcurrency: 1,
    dimensions: 3,
    ...overrides,
  });
}

function successResponse(index: number) {
  return {
    ok: true,
    json: async () => ({
      data: [{ index, embedding: [index + 0.1, index + 0.2, index + 0.3] }],
      usage: { total_tokens: 10 },
    }),
  } as Response;
}

function failureResponse(message: string) {
  return {
    ok: false,
    status: 500,
    json: async () => ({ error: { message } }),
  } as Response;
}

function httpErrorResponse(options: {
  status: number;
  message: string;
  type?: string;
  code?: string;
}) {
  return {
    ok: false,
    status: options.status,
    json: async () => ({
      error: {
        message: options.message,
        type: options.type,
        code: options.code,
      },
    }),
  } as Response;
}

function okJsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

describe('EmbeddingClient fatal session', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    resetEmbeddingClientForTests();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    resetEmbeddingClientForTests();
  });

  it('stops starting unstarted batches after the first fatal embedding failure', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(successResponse(0))
      .mockResolvedValueOnce(failureResponse('provider exploded'));
    global.fetch = fetchMock;

    const client = createClient({ maxConcurrency: 1 });

    await expect(client.embedBatch(['a', 'b', 'c'], 1)).rejects.toThrow('provider exploded');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('discards late successful results after fatal state without advancing progress', async () => {
    const onProgress = vi.fn();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            setTimeout(() => resolve(successResponse(0)), 20);
          }),
      )
      .mockResolvedValueOnce(failureResponse('fatal batch failure'));
    global.fetch = fetchMock;

    const client = createClient({ maxConcurrency: 2 });

    await expect(client.embedBatch(['a', 'b', 'c'], 1, onProgress)).rejects.toThrow(
      'fatal batch failure',
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onProgress).not.toHaveBeenCalled();
  });
});

describe('EmbeddingClient provider diagnostics', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    resetEmbeddingClientForTests();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    resetEmbeddingClientForTests();
  });

  it('preserves provider diagnostics for HTTP embedding failures', async () => {
    global.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      httpErrorResponse({
        status: 401,
        message: 'API key invalid',
        type: 'invalid_request_error',
        code: 'invalid_api_key',
      }),
    );

    const client = createClient({
      baseUrl: 'https://api.example.com/v1/embeddings',
      model: 'text-embedding-3-large',
      dimensions: 1536,
    });

    const error = await client.embedBatch(['alpha', 'beta'], 8).catch((err) => err);

    expect(error).toBeInstanceOf(EmbeddingFatalError);
    expect(error.diagnostics).toMatchObject({
      stage: 'embed',
      category: 'authentication',
      httpStatus: 401,
      providerType: 'invalid_request_error',
      providerCode: 'invalid_api_key',
      upstreamMessage: 'API key invalid',
      endpointHost: 'api.example.com',
      endpointPath: '/v1/embeddings',
      model: 'text-embedding-3-large',
      batchSize: 8,
      dimensions: 1536,
      requestCount: 2,
    });
  });

  it.each([
    {
      name: 'authentication from provider auth signals',
      response: httpErrorResponse({
        status: 403,
        message: 'Forbidden',
        type: 'auth_error',
        code: 'forbidden',
      }),
      expectedCategory: 'authentication',
    },
    {
      name: 'rate limit from quota signals',
      response: httpErrorResponse({
        status: 400,
        message: 'Quota exceeded',
        type: 'rate_limit_error',
        code: 'quota_exceeded',
      }),
      expectedCategory: 'rate_limit',
    },
    {
      name: 'batch too large from payload signal',
      response: httpErrorResponse({
        status: 413,
        message: 'Payload too large for this batch',
        type: 'invalid_request_error',
        code: 'payload_too_large',
      }),
      expectedCategory: 'batch_too_large',
    },
    {
      name: 'dimension mismatch from provider message',
      response: httpErrorResponse({
        status: 400,
        message: 'Dimension mismatch: expected 1536',
        type: 'invalid_request_error',
        code: 'dimension_mismatch',
      }),
      expectedCategory: 'dimension_mismatch',
    },
    {
      name: 'incompatible response when success body misses data',
      response: okJsonResponse({ usage: { total_tokens: 1 } }),
      expectedCategory: 'incompatible_response',
    },
    {
      name: 'unknown when failure is ambiguous',
      response: httpErrorResponse({
        status: 418,
        message: 'Teapot exploded mysteriously',
        type: 'odd_error',
        code: 'teapot',
      }),
      expectedCategory: 'unknown',
    },
  ])('classifies $name', async ({ response, expectedCategory }) => {
    global.fetch = vi.fn<typeof fetch>().mockResolvedValue(response);

    const client = createClient();
    const error = await client.embedBatch(['alpha'], 4).catch((err) => err);

    expect(error).toBeInstanceOf(EmbeddingFatalError);
    expect(error.diagnostics.category).toBe(expectedCategory);
  });

  it.each([
    {
      name: 'timeout from AbortError name',
      error: Object.assign(new Error('Request timeout while waiting for provider'), {
        name: 'AbortError',
      }),
      expectedCategory: 'timeout',
    },
    {
      name: 'network from ECONNRESET',
      error: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
      expectedCategory: 'network',
    },
  ])('classifies $name', async ({ error, expectedCategory }) => {
    global.fetch = vi.fn<typeof fetch>().mockRejectedValue(error);

    const client = createClient({
      baseUrl: 'https://provider.example.com/api/embed',
    });
    const fatal = await client.embedBatch(['alpha', 'beta', 'gamma'], 5).catch((err) => err);

    expect(fatal).toBeInstanceOf(EmbeddingFatalError);
    expect(fatal.diagnostics).toMatchObject({
      stage: 'embed',
      category: expectedCategory,
      httpStatus: null,
      providerType: null,
      providerCode: null,
      endpointHost: 'provider.example.com',
      endpointPath: '/api/embed',
      model: 'test-model',
      batchSize: 5,
      dimensions: 3,
      requestCount: 3,
    });
  });

  it('classifies malformed success payloads as incompatible_response when vector dimensions mismatch', async () => {
    global.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      okJsonResponse({
        data: [{ index: 0, embedding: [0.1, 0.2] }],
        usage: { total_tokens: 10 },
      }),
    );

    const client = createClient({ dimensions: 3 });
    const error = await client.embedBatch(['alpha'], 2).catch((err) => err);

    expect(error).toBeInstanceOf(EmbeddingFatalError);
    expect(error.diagnostics.category).toBe('incompatible_response');
  });
});
