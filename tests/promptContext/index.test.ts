import { describe, expect, it, vi } from 'vitest';
import { buildPromptContext, renderPromptContext } from '../../src/promptContext/index.js';
import type { SearchResult } from '../../src/retrieval/index.js';

function createSearchResult(): SearchResult {
  return {
    summary: {
      query: '请帮我改造 prompt context，让它更适合 skill 工作流',
      seedCount: 2,
      expandedCount: 1,
      fileCount: 2,
      totalSegments: 2,
    },
    files: [
      {
        path: 'src/promptContext/index.ts',
        segments: [
          {
            startLine: 39,
            endLine: 90,
            score: 0.92,
            language: 'typescript',
            breadcrumb: 'src/promptContext/index.ts > fn buildPromptContext',
            text: 'export async function buildPromptContext(options) {}',
          },
        ],
      },
      {
        path: 'src/promptContext/technicalTerms.ts',
        segments: [
          {
            startLine: 1,
            endLine: 40,
            score: 0.81,
            language: 'typescript',
            breadcrumb: 'fn extractTechnicalTerms',
            text: 'export function extractTechnicalTerms(prompt) {}',
          },
        ],
      },
    ],
  };
}

describe('buildPromptContext', () => {
  it('builds deterministic evidence from the prompt and retrieval results', async () => {
    const retrieve = vi.fn().mockResolvedValue(createSearchResult());

    const result = await buildPromptContext({
      prompt:
        '请帮我改造 `buildPromptContext` 和 `src/promptContext/technicalTerms.ts`，让它更适合 skill 工作流。',
      repoPath: '/repo',
      retrieve,
    });

    expect(result.language).toBe('zh');
    expect(result.technicalTerms).toContain('buildPromptContext');
    expect(result.technicalTerms).toContain('src/promptContext/technicalTerms.ts');
    expect(result.retrieval.status).toBe('ok');
    expect(result.retrieval.topPaths).toEqual([
      'src/promptContext/index.ts',
      'src/promptContext/technicalTerms.ts',
    ]);
    expect(result.retrieval.evidence[0]).toMatchObject({
      path: 'src/promptContext/index.ts',
      startLine: 39,
      endLine: 90,
      breadcrumb: 'src/promptContext/index.ts > fn buildPromptContext',
    });
  });

  it('captures retrieval failure without discarding extracted prompt facts', async () => {
    const result = await buildPromptContext({
      prompt: 'Refactor `SearchService` into a skill-first workflow.',
      repoPath: '/repo',
      retrieve: vi.fn().mockRejectedValue(new Error('index missing')),
    });

    expect(result.language).toBe('en');
    expect(result.technicalTerms).toContain('SearchService');
    expect(result.retrieval.status).toBe('error');
    expect(result.retrieval.error).toContain('index missing');
    expect(result.retrieval.evidence).toEqual([]);
  });

  it('renders text output for humans and json output for scripts', async () => {
    const result = await buildPromptContext({
      prompt: 'Please refactor `SearchService`.',
    });

    const text = renderPromptContext(result, 'text');
    expect(text).toContain('language: en');
    expect(text).toContain('technicalTerms: SearchService');
    expect(text).toContain('retrieval: skipped');

    const json = renderPromptContext(result, 'json');
    expect(JSON.parse(json)).toMatchObject({
      language: 'en',
      technicalTerms: ['SearchService'],
      retrieval: { status: 'skipped' },
    });
  });
});
