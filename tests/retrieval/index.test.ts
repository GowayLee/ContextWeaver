import { describe, expect, it } from 'vitest';
import { buildSearchResult, renderSearchResult } from '../../src/retrieval/index.js';
import type { ContextPack } from '../../src/search/types.js';

function createPack(): ContextPack {
  return {
    query: 'trace prompt context flow',
    seeds: [
      {
        filePath: 'src/promptContext/index.ts',
        chunkIndex: 0,
        score: 0.91,
        source: 'vector',
        record: {
          chunk_id: 'chunk-0',
          file_path: 'src/promptContext/index.ts',
          file_hash: 'hash',
          chunk_index: 0,
          vector: [0.1, 0.2],
          display_code: 'export async function buildPromptContext() {}',
          vector_text: 'buildPromptContext',
          language: 'typescript',
          breadcrumb: 'fn buildPromptContext',
          start_index: 0,
          end_index: 10,
          raw_start: 0,
          raw_end: 10,
          vec_start: 0,
          vec_end: 10,
          _distance: 0.01,
        },
      },
    ],
    expanded: [],
    files: [
      {
        filePath: 'src/promptContext/index.ts',
        segments: [
          {
            filePath: 'src/promptContext/index.ts',
            rawStart: 0,
            rawEnd: 10,
            startLine: 1,
            endLine: 10,
            score: 0.91,
            breadcrumb: 'src/promptContext/index.ts > fn buildPromptContext',
            text: 'export async function buildPromptContext() {}',
          },
        ],
      },
    ],
    debug: {
      wVec: 0.7,
      wLex: 0.3,
      timingMs: { total: 12 },
    },
  };
}

describe('buildSearchResult', () => {
  it('builds a structured result from ContextPack', () => {
    const result = buildSearchResult(createPack());

    expect(result.summary).toEqual({
      query: 'trace prompt context flow',
      seedCount: 1,
      expandedCount: 0,
      fileCount: 1,
      totalSegments: 1,
    });
    expect(result.files[0]?.path).toBe('src/promptContext/index.ts');
    expect(result.files[0]?.segments[0]).toMatchObject({
      startLine: 1,
      endLine: 10,
      language: 'typescript',
      breadcrumb: 'src/promptContext/index.ts > fn buildPromptContext',
    });
  });
});

describe('renderSearchResult', () => {
  it('renders text output compatible with human reading', () => {
    const text = renderSearchResult(buildSearchResult(createPack()), 'text');

    expect(text).toContain('Found 1 relevant code blocks');
    expect(text).toContain('## src/promptContext/index.ts (L1-10)');
    expect(text).toContain('```typescript');
  });

  it('renders JSON output for scripts and skills', () => {
    const json = renderSearchResult(buildSearchResult(createPack()), 'json');
    const parsed = JSON.parse(json) as {
      summary: { fileCount: number };
      files: Array<{ path: string }>;
    };

    expect(parsed.summary.fileCount).toBe(1);
    expect(parsed.files[0]?.path).toBe('src/promptContext/index.ts');
  });
});
