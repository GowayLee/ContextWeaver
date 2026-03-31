import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmbeddingFatalError } from '../../src/api/embedding.js';
import { Indexer } from '../../src/indexer/index.js';
import type { ProcessResult } from '../../src/scanner/processor.js';

function createProcessResult(): ProcessResult {
  return {
    absPath: '/repo/src/app.ts',
    relPath: 'src/app.ts',
    hash: 'hash-1',
    content: 'export const app = true;',
    language: 'typescript',
    mtime: 1,
    size: 1,
    status: 'added',
    chunks: [
      {
        displayCode: 'export const app = true;',
        vectorText: 'export const app = true;',
        nwsSize: 1,
        metadata: {
          startIndex: 0,
          endIndex: 24,
          rawSpan: { start: 0, end: 24 },
          vectorSpan: { start: 0, end: 24 },
          filePath: 'src/app.ts',
          language: 'typescript',
          contextPath: ['src/app.ts'],
        },
      },
    ],
  };
}

describe('Indexer fatal embedding propagation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clears vector_index_hash and rethrows embedding fatal failures instead of returning error stats', async () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE files (
        path TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        vector_index_hash TEXT
      );
      INSERT INTO files (path, hash, vector_index_hash)
      VALUES ('src/app.ts', 'hash-1', 'hash-1');
    `);

    const indexer = new Indexer('project-id');
    (indexer as any).vectorStore = {};
    const upstreamError = new EmbeddingFatalError('Embedding API 错误: quota exceeded', {
      diagnostics: {
        stage: 'embed',
        category: 'rate_limit',
        httpStatus: 429,
        providerType: 'rate_limit_error',
        providerCode: 'quota_exceeded',
        upstreamMessage: 'quota exceeded',
        endpointHost: 'api.example.com',
        endpointPath: '/v1/embeddings',
        model: 'text-embedding-3-large',
        batchSize: 20,
        dimensions: 1024,
        requestCount: 1,
      },
    } as any);

    (indexer as any).embeddingClient = {
      embedBatch: vi.fn().mockRejectedValue(upstreamError),
    };

    const error = await indexer.indexFiles(db, [createProcessResult()]).catch((err) => err);

    expect(error).toBeInstanceOf(EmbeddingFatalError);
    expect(error.message).toContain('向量嵌入阶段失败: quota exceeded');
    expect(error.diagnostics).toMatchObject({
      stage: 'embed',
      category: 'rate_limit',
      httpStatus: 429,
      providerType: 'rate_limit_error',
      providerCode: 'quota_exceeded',
      upstreamMessage: 'quota exceeded',
      endpointHost: 'api.example.com',
      endpointPath: '/v1/embeddings',
      model: 'text-embedding-3-large',
      batchSize: 20,
      dimensions: 1024,
      requestCount: 1,
    });
    expect(error.diagnostics.stage).toBe('embed');

    const row = db
      .prepare('SELECT vector_index_hash FROM files WHERE path = ?')
      .get('src/app.ts') as { vector_index_hash: string | null };
    expect(row.vector_index_hash).toBeNull();

    db.close();
  });
});
