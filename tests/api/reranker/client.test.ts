import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RerankerClient } from '../../../src/api/reranker/index.js';

describe('RerankerClient entrypoint', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('keeps stable reranker entrypoint exports usable after provider refactor', async () => {
    global.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'test',
        results: [{ index: 1, relevance_score: 0.9 }],
      }),
    } as Response);

    const client = new RerankerClient({
      apiKey: 'test-key',
      baseUrl: 'https://example.com/rerank',
      model: 'test-reranker',
      topN: 5,
    });

    await expect(client.rerank('query', ['a', 'b'])).resolves.toEqual([
      {
        originalIndex: 1,
        score: 0.9,
        text: 'b',
      },
    ]);
  });
});
