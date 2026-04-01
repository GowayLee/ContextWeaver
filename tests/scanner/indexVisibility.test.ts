import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { processFiles, type SkipReasonBucket } from '../../src/scanner/processor.js';

const tempDirs: string[] = [];
let previousHome: string | undefined;

async function createTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

beforeEach(async () => {
  vi.resetModules();
  vi.restoreAllMocks();
  previousHome = process.env.HOME;
  process.env.HOME = await createTempDir('cw-home-');
});

afterEach(async () => {
  if (previousHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = previousHome;
  }

  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('scanner visibility contracts', () => {
  it('maps current skip causes into stable skip buckets', async () => {
    const repoRoot = await createTempDir('cw-visibility-');
    const filePaths = {
      largeFile: path.join(repoRoot, 'src/large.ts'),
      binaryFile: path.join(repoRoot, 'src/binary.bin'),
      ignoredJson: path.join(repoRoot, 'src/package-lock.json'),
      noIndexableChunks: path.join(repoRoot, 'src/empty.txt'),
      processingError: path.join(repoRoot, 'src/missing.ts'),
    };

    await fs.mkdir(path.join(repoRoot, 'src'), { recursive: true });
    await fs.writeFile(filePaths.largeFile, 'a'.repeat(101 * 1024), 'utf-8');
    await fs.writeFile(filePaths.binaryFile, Buffer.from('abc\0def', 'utf-8'));
    await fs.writeFile(filePaths.ignoredJson, '{"lock":true}\n', 'utf-8');
    await fs.writeFile(filePaths.noIndexableChunks, '', 'utf-8');

    const results = await processFiles(
      repoRoot,
      [
        filePaths.largeFile,
        filePaths.binaryFile,
        filePaths.ignoredJson,
        filePaths.noIndexableChunks,
        filePaths.processingError,
      ],
      new Map(),
    );

    const bucketByPath = Object.fromEntries(
      results.map((result) => [result.relPath, result.skipReason ?? null]),
    ) as Record<string, SkipReasonBucket | null>;

    expect(bucketByPath['src/large.ts']).toBe('large_file');
    expect(bucketByPath['src/binary.bin']).toBe('binary_file');
    expect(bucketByPath['src/package-lock.json']).toBe('ignored_json');
    expect(bucketByPath['src/empty.txt']).toBe('no_indexable_chunks');
    expect(bucketByPath['src/missing.ts']).toBe('processing_error');
  });

  it('exposes aggregated skip bucket counts without requiring per-file skip output', async () => {
    const { scan } = await import('../../src/scanner/index.js');
    const repoRoot = await createTempDir('cw-visibility-scan-');

    const stats = await scan(repoRoot, {
      precomputedFilePaths: [],
      vectorIndex: false,
    });

    expect(stats.skippedByReason).toEqual({});
    expect(stats.visibility).toEqual({
      candidateFiles: 0,
      processedFiles: 0,
      embeddingFiles: 0,
      selfHealFiles: 0,
      deletedPaths: 0,
    });
    expect(stats).not.toHaveProperty('skippedPaths');
  });

  it('throws a typed scanner failure with stage and safe partial stats', async () => {
    vi.doMock('../../src/config.js', () => ({
      getEmbeddingConfig: () => ({ dimensions: 1024 }),
    }));
    vi.doMock('../../src/db/index.js', () => ({
      batchDelete: vi.fn(),
      batchUpdateMtime: vi.fn(),
      batchUpsert: vi.fn(),
      clear: vi.fn(),
      closeDb: vi.fn(),
      generateProjectId: () => 'project-id',
      getAllFileMeta: () => new Map(),
      getAllPaths: () => [],
      getFilesNeedingVectorIndex: () => [],
      getStoredEmbeddingDimensions: () => null,
      initDb: () => ({}) as object,
      setStoredEmbeddingDimensions: vi.fn(),
    }));
    vi.doMock('../../src/indexer/index.js', () => ({
      closeAllIndexers: vi.fn(),
      getIndexer: async () => ({
        clear: vi.fn(),
        indexFiles: vi.fn().mockRejectedValue(new Error('boom')),
      }),
    }));
    vi.doMock('../../src/utils/logger.js', () => ({
      logger: {
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
      },
    }));
    vi.doMock('../../src/vectorStore/index.js', () => ({
      closeAllVectorStores: vi.fn(),
    }));
    vi.doMock('../../src/scanner/crawler.js', () => ({
      crawl: async () => ({
        filePaths: ['/repo/src/large.ts', '/repo/src/empty.ts'],
      }),
    }));
    vi.doMock('../../src/scanner/filter.js', () => ({
      initFilter: vi.fn(),
    }));
    vi.doMock('../../src/scanner/processor.js', () => ({
      processFiles: vi.fn().mockResolvedValue([
        {
          absPath: '/repo/src/large.ts',
          relPath: 'src/large.ts',
          hash: '',
          content: null,
          chunks: [],
          language: 'typescript',
          mtime: 1,
          size: 1,
          status: 'skipped',
          error: 'File too large',
          skipReason: 'large_file',
        },
        {
          absPath: '/repo/src/empty.txt',
          relPath: 'src/empty.txt',
          hash: 'hash',
          content: '',
          chunks: [],
          language: 'typescript',
          mtime: 1,
          size: 0,
          status: 'added',
          skipReason: 'no_indexable_chunks',
        },
      ]),
    }));

    const { ScanStageError, scan } = await import('../../src/scanner/index.js');

    await expect(scan('/repo')).rejects.toMatchObject({
      stage: expect.stringMatching(/^(crawl|process|chunk\/embed|persist)$/),
      partialStats: expect.objectContaining({
        skippedByReason: expect.objectContaining({
          large_file: 1,
          no_indexable_chunks: 1,
        }),
      }),
    });
    await expect(scan('/repo')).rejects.toBeInstanceOf(ScanStageError);
  });
});
