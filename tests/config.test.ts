import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const REQUIRED_EMBEDDING_ENV = {
  EMBEDDINGS_API_KEY: 'test-key',
  EMBEDDINGS_BASE_URL: 'https://example.com/embeddings',
  EMBEDDINGS_MODEL: 'test-model',
};

describe('getEmbeddingConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, ...REQUIRED_EMBEDDING_ENV };
    delete process.env.EMBEDDINGS_BATCH_SIZE;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses 10 as the default batchSize', async () => {
    const { getEmbeddingConfig } = await import('../src/config.js');

    expect(getEmbeddingConfig().batchSize).toBe(10);
  });

  it('uses a valid EMBEDDINGS_BATCH_SIZE value', async () => {
    process.env.EMBEDDINGS_BATCH_SIZE = '16';
    const { getEmbeddingConfig } = await import('../src/config.js');

    expect(getEmbeddingConfig().batchSize).toBe(16);
  });

  it('falls back to 10 for invalid EMBEDDINGS_BATCH_SIZE values', async () => {
    process.env.EMBEDDINGS_BATCH_SIZE = 'oops';
    const { getEmbeddingConfig } = await import('../src/config.js');

    expect(getEmbeddingConfig().batchSize).toBe(10);
  });

  it('falls back to 10 when EMBEDDINGS_BATCH_SIZE is smaller than 1', async () => {
    process.env.EMBEDDINGS_BATCH_SIZE = '0';
    const { getEmbeddingConfig } = await import('../src/config.js');

    expect(getEmbeddingConfig().batchSize).toBe(10);
  });
});
