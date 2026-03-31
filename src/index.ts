#!/usr/bin/env node
// 配置必须最先加载（包含环境变量初始化）
import './config.js';

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cac from 'cac';
import { type EmbeddingFailureDiagnostics, EmbeddingFatalError } from './api/embedding.js';
import {
  initProjectConfigCommand,
  installBundledSkills,
  resolveSkillInstallTarget,
  runCleanIndexes,
  runIndexCommand,
} from './cli.js';
import { logger } from './utils/logger.js';

// 读取 package.json 获取版本号
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.resolve(__dirname, '../package.json');
const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));

const cli = cac('contextweaver');

function formatEmbeddingFailureDiagnostics(error: unknown): string[] | null {
  if (!(error instanceof EmbeddingFatalError)) {
    return null;
  }

  const diagnostics = error.diagnostics;
  const endpointPath = sanitizeEndpointPath(diagnostics.endpointPath);

  return [
    `阶段: ${formatUnknownValue(diagnostics.stage)}`,
    `错误类别: ${formatUnknownValue(diagnostics.category)}`,
    `HTTP 状态: ${formatUnknownValue(diagnostics.httpStatus)}`,
    `Provider type: ${formatNoneValue(diagnostics.providerType)}`,
    `Provider code: ${formatNoneValue(diagnostics.providerCode)}`,
    `Provider message: ${formatUnknownValue(diagnostics.upstreamMessage)}`,
    `Endpoint: ${formatEndpoint(diagnostics.endpointHost, endpointPath)}`,
    `Model: ${formatUnknownValue(diagnostics.model)}`,
    `Batch size: ${formatUnknownValue(diagnostics.batchSize)}`,
    `Dimensions: ${formatUnknownValue(diagnostics.dimensions)}`,
    `Request items: ${formatUnknownValue(diagnostics.requestCount)}`,
  ];
}

function sanitizeEndpointPath(endpointPath: string): string {
  const safePath = endpointPath.split('?')[0] || '/';
  return safePath.startsWith('/') ? safePath : `/${safePath}`;
}

function formatEndpoint(endpointHost: string, endpointPath: string): string {
  const host = formatUnknownValue(endpointHost);
  const path = formatUnknownValue(endpointPath);
  return host === '<unknown>' ? '<unknown>' : `${host}${path}`;
}

function formatUnknownValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '<unknown>';
  }

  if (typeof value === 'string') {
    return value.trim() === '' ? '<unknown>' : value;
  }

  return String(value);
}

function formatNoneValue(value: string | null | undefined): string {
  if (value === null || value === undefined || value.trim() === '') {
    return '<none>';
  }

  return value;
}

export async function runIndexCliCommand(options: {
  rootPath: string;
  force?: boolean;
  yes?: boolean;
  isInteractive?: boolean;
  runIndexCommandFn?: typeof runIndexCommand;
  logger?: {
    info: (message: string) => void;
    error: (message: string) => void;
  };
  exit?: (code: number) => void;
}): Promise<void> {
  const startTime = Date.now();
  const run = options.runIndexCommandFn ?? runIndexCommand;
  const output = options.logger ?? logger;
  const exit = options.exit ?? ((code: number) => process.exit(code));

  try {
    const stats = await run({
      rootPath: options.rootPath,
      force: options.force,
      yes: options.yes,
      isInteractive: options.isInteractive,
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    output.info(`索引完成 (${duration}s)`);
    output.info(
      `总数:${stats.totalFiles} 新增:${stats.added} 修改:${stats.modified} 未变:${stats.unchanged} 删除:${stats.deleted} 跳过:${stats.skipped} 错误:${stats.errors}`,
    );
  } catch (err) {
    const error = err as { message?: string };
    output.error(`索引失败: ${error.message || '未知错误'}`);
    const diagnosticsLines = formatEmbeddingFailureDiagnostics(err);
    if (diagnosticsLines) {
      for (const line of diagnosticsLines) {
        output.error(line);
      }
    }
    exit(1);
  }
}

// 自定义版本输出，只显示版本号
if (process.argv.includes('-v') || process.argv.includes('--version')) {
  console.log(pkg.version);
  process.exit(0);
}

cli.command('init', '初始化 ContextWeaver 配置').action(async () => {
  const configDir = path.join(os.homedir(), '.contextweaver');
  const envFile = path.join(configDir, '.env');

  logger.info('开始初始化 ContextWeaver...');

  // 创建配置目录
  try {
    await fs.mkdir(configDir, { recursive: true });
    logger.info(`创建配置目录: ${configDir}`);
  } catch (err) {
    const error = err as { code?: string; message?: string; stack?: string };
    if (error.code !== 'EEXIST') {
      logger.error({ err, stack: error.stack }, `创建配置目录失败: ${error.message}`);
      process.exit(1);
    }
    logger.info(`配置目录已存在: ${configDir}`);
  }

  // 检查是否已存在 .env 文件
  try {
    await fs.access(envFile);
    logger.warn(`.env 文件已存在: ${envFile}`);
    logger.info('初始化完成！');
    return;
  } catch {
    // 文件不存在，继续创建
  }

  // 写入默认 .env 配置
  const defaultEnvContent = `# ContextWeaver 示例环境变量配置文件

# Embedding API 配置（必需）
EMBEDDINGS_API_KEY=your-api-key-here
EMBEDDINGS_BASE_URL=https://api.siliconflow.cn/v1/embeddings
EMBEDDINGS_MODEL=BAAI/bge-m3
EMBEDDINGS_MAX_CONCURRENCY=10
EMBEDDINGS_DIMENSIONS=1024

# Reranker 配置（必需）
RERANK_API_KEY=your-api-key-here
RERANK_BASE_URL=https://api.siliconflow.cn/v1/rerank
RERANK_MODEL=BAAI/bge-reranker-v2-m3
RERANK_TOP_N=20

`;
  try {
    await fs.writeFile(envFile, defaultEnvContent);
    logger.info(`创建 .env 文件: ${envFile}`);
  } catch (err) {
    const error = err as { message?: string; stack?: string };
    logger.error({ err, stack: error.stack }, `创建 .env 文件失败: ${error.message}`);
    process.exit(1);
  }

  logger.info('下一步操作:');
  logger.info(`   1. 编辑配置文件: ${envFile}`);
  logger.info('   2. 填写你的 API Key 和其他配置');
  logger.info('初始化完成！');
});

cli
  .command('index [path]', '扫描代码库并建立索引')
  .option('-f, --force', '强制重新索引')
  .option('-y, --yes', '跳过确认预览，直接开始索引')
  .action(async (targetPath: string | undefined, options: { force?: boolean; yes?: boolean }) => {
    const rootPath = targetPath ? path.resolve(targetPath) : process.cwd();

    await runIndexCliCommand({
      rootPath,
      force: options.force,
      yes: options.yes,
      isInteractive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    });
  });

cli
  .command('init-project', '初始化当前目录的 cwconfig.json')
  .option('-f, --force', '覆盖已有 cwconfig.json')
  .action(async (options: { force?: boolean }) => {
    try {
      const configPath = await initProjectConfigCommand({
        cwd: process.cwd(),
        force: options.force === true,
      });
      logger.info(`创建项目配置文件: ${configPath}`);
      logger.info('includePatterns 省略时表示按默认规则索引整个项目');
      logger.info('ignorePatterns 可用于排除项目中的生成目录或低价值路径');
    } catch (err) {
      const error = err as { message?: string; stack?: string };
      logger.error({ err, stack: error.stack }, `初始化项目配置失败: ${error.message}`);
      process.exit(1);
    }
  });

cli
  .command('install-skills', '安装内置 Skill 到目标目录')
  .option('--dir <path>', '安装目录（默认当前目录）')
  .option('-f, --force', '覆盖已存在的 Skill 目录')
  .action(async (options: { dir?: string; force?: boolean }) => {
    try {
      const resolvedTarget = resolveSkillInstallTarget({
        cwd: process.cwd(),
        targetDir: options.dir,
      });

      const installed = await installBundledSkills({
        targetDir: resolvedTarget,
        force: options.force === true,
      });

      logger.info(`已安装 ${installed.length} 个 Skill 到: ${resolvedTarget}`);
      for (const skill of installed) {
        logger.info(`- ${skill.name}`);
      }
    } catch (err) {
      const error = err as { message?: string; stack?: string };
      logger.error({ err, stack: error.stack }, `安装 Skill 失败: ${error.message}`);
      process.exit(1);
    }
  });

cli
  .command('clean', '交互式清理失效索引')
  .option('-y, --yes', '跳过确认，直接删除失效索引')
  .option('--dry-run', '仅显示待清理索引，不执行删除')
  .action(async (options: { yes?: boolean; dryRun?: boolean }) => {
    try {
      const result = await runCleanIndexes({
        isInteractive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
        yes: options.yes,
        dryRun: options.dryRun,
        writeLine: (line) => logger.info(line),
      });

      if (result.deletedProjectIds.length > 0) {
        logger.info(`已删除 ${result.deletedProjectIds.length} 个失效索引`);
      }
      if (result.prunedProjectIds.length > 0) {
        logger.info(`已清理 ${result.prunedProjectIds.length} 条缺失索引记录`);
      }
      if (result.failedProjectIds.length > 0) {
        throw new Error(`部分索引删除失败: ${result.failedProjectIds.join(', ')}`);
      }
    } catch (err) {
      const error = err as { message?: string; stack?: string };
      logger.error({ err, stack: error.stack }, `清理失败: ${error.message}`);
      process.exit(1);
    }
  });

cli
  .command('search', '本地检索（参数对齐 MCP）')
  .option('--repo-path <path>', '代码库根目录（默认当前目录）')
  .option('--information-request <text>', '自然语言问题描述（必填）')
  .option('--technical-terms <terms>', '精确术语（逗号分隔）')
  .option('--format <type>', '输出格式 (text/json)', { default: 'text' })
  .action(
    async (options: {
      repoPath?: string;
      informationRequest?: string;
      technicalTerms?: string;
      format?: string;
    }) => {
      const repoPath = options.repoPath ? path.resolve(options.repoPath) : process.cwd();
      const informationRequest = options.informationRequest;
      if (!informationRequest) {
        logger.error('缺少 --information-request');
        process.exit(1);
      }

      const technicalTerms = (options.technicalTerms || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const format = options.format === 'json' ? 'json' : 'text';

      await import('./cli.js').then(({ ensureSearchableProject }) =>
        ensureSearchableProject(repoPath),
      );

      const { renderSearchResult, retrieveCodeContext } = await import('./retrieval/index.js');

      const result = await retrieveCodeContext({
        repoPath,
        informationRequest,
        technicalTerms: technicalTerms.length > 0 ? technicalTerms : undefined,
      });

      process.stdout.write(renderSearchResult(result, format));
    },
  );

cli
  .command('prompt-context <prompt>', '为 prompt 增强准备仓库证据（默认输出 text）')
  .option('--repo-path <path>', '代码库根目录（默认当前目录）')
  .option('--paths <paths>', '显式文件路径（逗号分隔）')
  .option('--symbols <symbols>', '显式符号（逗号分隔）')
  .option('--format <type>', '输出格式 (text/json)', { default: 'text' })
  .action(
    async (
      prompt: string,
      options: {
        repoPath?: string;
        paths?: string;
        symbols?: string;
        format?: string;
      },
    ) => {
      const repoPath = options.repoPath ? path.resolve(options.repoPath) : process.cwd();
      const explicitPaths = (options.paths || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const explicitSymbols = (options.symbols || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

      const { buildPromptContext, renderPromptContext } = await import('./promptContext/index.js');
      const result = await buildPromptContext({
        prompt,
        repoPath,
        explicitPaths,
        explicitSymbols,
      });

      const format = options.format === 'json' ? 'json' : 'text';
      process.stdout.write(renderPromptContext(result, format));
    },
  );

cli.help();

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli.parse();
}
