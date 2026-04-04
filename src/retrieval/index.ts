import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getProjectIdentity } from '../db/index.js';
import type { ContextPack, SearchConfig, Segment } from '../search/types.js';
import { logger } from '../utils/logger.js';

export interface SearchSummary {
  query: string;
  seedCount: number;
  expandedCount: number;
  fileCount: number;
  totalSegments: number;
}

export interface SearchResultSegment {
  startLine: number;
  endLine: number;
  score: number;
  language: string;
  breadcrumb: string;
  text: string;
}

export interface SearchResultFile {
  path: string;
  segments: SearchResultSegment[];
}

export interface SearchResult {
  summary: SearchSummary;
  files: SearchResultFile[];
}

export interface RetrievalInput {
  repoPath: string;
  informationRequest: string;
  technicalTerms?: string[];
}

export type SearchOutputFormat = 'text' | 'json';

const BASE_DIR = path.join(os.homedir(), '.contextweaver');
const INDEX_LOCK_TIMEOUT_MS = 10 * 60 * 1000;

async function ensureDefaultEnvFile(): Promise<void> {
  const configDir = BASE_DIR;
  const envFile = path.join(configDir, '.env');

  if (fs.existsSync(envFile)) {
    return;
  }

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
    logger.info({ configDir }, '创建配置目录');
  }

  const defaultEnvContent = `# ContextWeaver 示例环境变量配置文件

# Embedding API 配置（必需）
EMBEDDINGS_API_KEY=your-api-key-here
EMBEDDINGS_BASE_URL=https://api.siliconflow.cn/v1/embeddings
EMBEDDINGS_MODEL=BAAI/bge-m3
EMBEDDINGS_MAX_CONCURRENCY=10
EMBEDDINGS_DIMENSIONS=1024
EMBEDDINGS_MAX_INPUT_TOKENS=8192

# Reranker 配置（必需）
RERANK_API_KEY=your-api-key-here
RERANK_BASE_URL=https://api.siliconflow.cn/v1/rerank
RERANK_MODEL=BAAI/bge-reranker-v2-m3
RERANK_TOP_N=20
`;

  fs.writeFileSync(envFile, defaultEnvContent);
  logger.info({ envFile }, '已创建默认 .env 配置文件');
}

function isProjectIndexed(projectId: string): boolean {
  const dbPath = path.join(BASE_DIR, projectId, 'index.db');
  return fs.existsSync(dbPath);
}

async function ensureIndexed(
  repoPath: string,
  projectId: string,
  onProgress?: (current: number, total?: number, message?: string) => void,
): Promise<void> {
  const { withLock } = await import('../utils/lock.js');
  const { scan } = await import('../scanner/index.js');

  await withLock(
    projectId,
    'index',
    async () => {
      const wasIndexed = isProjectIndexed(projectId);

      if (!wasIndexed) {
        logger.info(
          { repoPath, projectId: projectId.slice(0, 10) },
          '代码库未初始化，开始首次索引...',
        );
        onProgress?.(0, 100, '代码库未索引，开始首次索引...');
      }

      const startTime = Date.now();
      const stats = await scan(repoPath, { vectorIndex: true, onProgress });
      const elapsed = Date.now() - startTime;

      logger.info(
        {
          projectId: projectId.slice(0, 10),
          isFirstTime: !wasIndexed,
          totalFiles: stats.totalFiles,
          added: stats.added,
          modified: stats.modified,
          deleted: stats.deleted,
          vectorIndex: stats.vectorIndex,
          elapsedMs: elapsed,
        },
        '索引完成',
      );
    },
    INDEX_LOCK_TIMEOUT_MS,
  );
}

export function buildSearchResult(pack: ContextPack): SearchResult {
  return {
    summary: {
      query: pack.query,
      seedCount: pack.seeds.length,
      expandedCount: pack.expanded.length,
      fileCount: pack.files.length,
      totalSegments: pack.files.reduce((acc, file) => acc + file.segments.length, 0),
    },
    files: pack.files.map((file) => ({
      path: file.filePath,
      segments: file.segments.map((segment) => buildSearchResultSegment(segment)),
    })),
  };
}

function buildSearchResultSegment(segment: Segment): SearchResultSegment {
  return {
    startLine: segment.startLine,
    endLine: segment.endLine,
    score: segment.score,
    language: detectSegmentLanguage(segment.filePath),
    breadcrumb: segment.breadcrumb,
    text: segment.text,
  };
}

export function renderSearchResult(result: SearchResult, format: SearchOutputFormat): string {
  if (format === 'json') {
    return `${JSON.stringify(result, null, 2)}\n`;
  }

  const fileBlocks = result.files
    .map((file) =>
      file.segments
        .map((segment) => {
          const header = `## ${file.path} (L${segment.startLine}-${segment.endLine})`;
          const breadcrumb = segment.breadcrumb ? `> ${segment.breadcrumb}` : '';
          const code = `\`\`\`${segment.language}\n${segment.text}\n\`\`\``;
          return [header, breadcrumb, code].filter(Boolean).join('\n');
        })
        .join('\n\n'),
    )
    .join('\n\n---\n\n');

  const summary = [
    `Found ${result.summary.seedCount} relevant code blocks`,
    `Files: ${result.summary.fileCount}`,
    `Total segments: ${result.summary.totalSegments}`,
  ].join(' | ');

  return `${summary}\n\n${fileBlocks}\n`;
}

export async function retrieveCodeContext(
  input: RetrievalInput,
  options?: {
    onProgress?: (current: number, total?: number, message?: string) => void;
    configOverride?: Partial<SearchConfig>;
  },
): Promise<SearchResult> {
  const { checkEmbeddingEnv, checkRerankerEnv } = await import('../config.js');
  const embeddingCheck = checkEmbeddingEnv();
  const rerankerCheck = checkRerankerEnv();
  const allMissingVars = [...embeddingCheck.missingVars, ...rerankerCheck.missingVars];

  if (allMissingVars.length > 0) {
    await ensureDefaultEnvFile();
    throw new Error(`ContextWeaver 环境变量未配置: ${allMissingVars.join(', ')}`);
  }

  const projectId = getProjectIdentity(input.repoPath).projectId;
  await ensureIndexed(input.repoPath, projectId, options?.onProgress);

  const query = [input.informationRequest, ...(input.technicalTerms || [])]
    .filter(Boolean)
    .join(' ');

  const { SearchService } = await import('../search/SearchService.js');
  const service = new SearchService(projectId, input.repoPath, options?.configOverride);
  await service.init();

  const pack = await service.buildContextPack(query);
  return buildSearchResult(pack);
}

function detectSegmentLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    rb: 'ruby',
    php: 'php',
    swift: 'swift',
    kt: 'kotlin',
    scala: 'scala',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    html: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    md: 'markdown',
    toml: 'toml',
  };
  return langMap[ext] || ext || 'plaintext';
}
