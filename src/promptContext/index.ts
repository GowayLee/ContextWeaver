import { ensureSearchableProject } from '../cli.js';
import { type RetrievalInput, retrieveCodeContext, type SearchResult } from '../retrieval/index.js';
import { detectLanguage } from './detect.js';
import { extractTechnicalTerms } from './technicalTerms.js';

export interface PromptContextEvidence {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  breadcrumb: string;
  text: string;
}

export interface PromptContextResult {
  prompt: string;
  language: 'zh' | 'en';
  technicalTerms: string[];
  retrieval: {
    status: 'ok' | 'skipped' | 'error';
    error?: string;
    topPaths: string[];
    evidence: PromptContextEvidence[];
  };
}

export interface BuildPromptContextOptions {
  prompt: string;
  repoPath?: string;
  explicitPaths?: string[];
  explicitSymbols?: string[];
  retrieve?: (input: RetrievalInput) => Promise<SearchResult>;
}

export type PromptContextOutputFormat = 'json' | 'text';

const PROMPT_CONTEXT_CONFIG_OVERRIDE = {
  maxTotalChars: 12000,
  maxSegmentsPerFile: 2,
};

export async function buildPromptContext(
  options: BuildPromptContextOptions,
): Promise<PromptContextResult> {
  const language = detectLanguage(options.prompt);
  const technicalTerms = Array.from(
    new Set([
      ...extractTechnicalTerms(options.prompt),
      ...(options.explicitPaths || []),
      ...(options.explicitSymbols || []),
    ]),
  );

  if (!options.repoPath) {
    return {
      prompt: options.prompt,
      language,
      technicalTerms,
      retrieval: {
        status: 'skipped',
        topPaths: [],
        evidence: [],
      },
    };
  }

  try {
    const retrieve =
      options.retrieve ??
      ((input: RetrievalInput) =>
        ensureSearchableProject(input.repoPath).then(() =>
          retrieveCodeContext(input, {
            configOverride: PROMPT_CONTEXT_CONFIG_OVERRIDE,
          }),
        ));
    const result = await retrieve({
      repoPath: options.repoPath,
      informationRequest: options.prompt,
      technicalTerms,
    });

    const evidence = result.files.flatMap((file) =>
      file.segments.map((segment) => ({
        path: file.path,
        startLine: segment.startLine,
        endLine: segment.endLine,
        score: segment.score,
        breadcrumb: segment.breadcrumb,
        text: segment.text,
      })),
    );

    return {
      prompt: options.prompt,
      language,
      technicalTerms,
      retrieval: {
        status: 'ok',
        topPaths: result.files.map((file) => file.path),
        evidence,
      },
    };
  } catch (error) {
    return {
      prompt: options.prompt,
      language,
      technicalTerms,
      retrieval: {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        topPaths: [],
        evidence: [],
      },
    };
  }
}

export function renderPromptContext(
  result: PromptContextResult,
  format: PromptContextOutputFormat,
): string {
  if (format === 'json') {
    return `${JSON.stringify(result, null, 2)}\n`;
  }

  const lines = [
    `language: ${result.language}`,
    `technicalTerms: ${result.technicalTerms.join(', ') || '<none>'}`,
    `retrieval: ${result.retrieval.status}`,
  ];

  if (result.retrieval.topPaths.length > 0) {
    lines.push(`topPaths: ${result.retrieval.topPaths.join(', ')}`);
  }

  if (result.retrieval.error) {
    lines.push(`error: ${result.retrieval.error}`);
  }

  return `${lines.join('\n')}\n`;
}
