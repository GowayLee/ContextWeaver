#!/usr/bin/env node
// 配置必须最先加载（包含环境变量初始化）
import './config.js';

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cac from 'cac';
import { initProjectConfigCommand, runCleanIndexes, runIndexCommand } from './cli.js';
import { logger } from './utils/logger.js';

// 读取 package.json 获取版本号
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.resolve(__dirname, '../package.json');
const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));

const cli = cac('contextweaver');

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

# Prompt Enhancer 配置（可选，使用 enhance 命令时需要）
# PROMPT_ENHANCER_ENDPOINT=openai
# PROMPT_ENHANCER_BASE_URL=
# PROMPT_ENHANCER_TOKEN=your-api-key-here
# PROMPT_ENHANCER_MODEL=
# PROMPT_ENHANCER_TEMPLATE=
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

    const startTime = Date.now();

    try {
      const stats = await runIndexCommand({
        rootPath,
        force: options.force,
        yes: options.yes,
        isInteractive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
      });

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      logger.info(`索引完成 (${duration}s)`);
      logger.info(
        `总数:${stats.totalFiles} 新增:${stats.added} 修改:${stats.modified} 未变:${stats.unchanged} 删除:${stats.deleted} 跳过:${stats.skipped} 错误:${stats.errors}`,
      );
    } catch (err) {
      const error = err as { message?: string; stack?: string };
      logger.error({ err, stack: error.stack }, `索引失败: ${error.message}`);
      process.exit(1);
    }
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

cli.command('mcp', '启动 MCP 服务器').action(async () => {
  // 动态导入并启动 MCP 服务器
  const { startMcpServer } = await import('./mcp/server.js');
  try {
    await startMcpServer();
  } catch (err) {
    const error = err as { message?: string; stack?: string };
    logger.error(
      { error: error.message, stack: error.stack },
      `MCP 服务器启动失败: ${error.message}`,
    );
    process.exit(1);
  }
});

cli
  .command('enhance <prompt>', '增强提示词')
  .option('--no-browser', '直接输出到终端，不启动浏览器')
  .option('--endpoint <type>', '指定 API 端点 (openai/claude/gemini)')
  .action(
    async (
      prompt: string,
      options: {
        browser?: boolean;
        endpoint?: string;
      },
    ) => {
      const endpointRaw = options.endpoint?.toLowerCase();
      const endpointOverride =
        endpointRaw === 'openai' || endpointRaw === 'claude' || endpointRaw === 'gemini'
          ? endpointRaw
          : undefined;

      if (options.browser === false) {
        const { enhancePrompt } = await import('./enhancer/index.js');
        try {
          const result = await enhancePrompt({ prompt, endpointOverride });
          process.stdout.write(`${result.enhanced}\n`);
        } catch (err) {
          const error = err as { message?: string; stack?: string };
          logger.error(
            { error: error.message, stack: error.stack },
            `enhance 失败: ${error.message}`,
          );
          process.exit(1);
        }
        return;
      }

      const { startEnhanceServer } = await import('./enhancer/server.js');
      const { openBrowser } = await import('./enhancer/browser.js');

      try {
        const result = await startEnhanceServer(prompt, {
          endpointOverride,
          onStarted: (url) => {
            openBrowser(url);
          },
        });
        process.stdout.write(`${result.enhanced}\n`);
      } catch (err) {
        const error = err as { message?: string; stack?: string };
        logger.error(
          { error: error.message, stack: error.stack },
          `enhance 失败: ${error.message}`,
        );
        process.exit(1);
      }
    },
  );

cli
  .command('search', '本地检索（参数对齐 MCP）')
  .option('--repo-path <path>', '代码库根目录（默认当前目录）')
  .option('--information-request <text>', '自然语言问题描述（必填）')
  .option('--technical-terms <terms>', '精确术语（逗号分隔）')
  .action(
    async (options: {
      repoPath?: string;
      informationRequest?: string;
      technicalTerms?: string;
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

      await import('./cli.js').then(({ ensureSearchableProject }) =>
        ensureSearchableProject(repoPath),
      );

      const { handleCodebaseRetrieval } = await import('./mcp/tools/codebaseRetrieval.js');

      const response = await handleCodebaseRetrieval({
        repo_path: repoPath,
        information_request: informationRequest,
        technical_terms: technicalTerms.length > 0 ? technicalTerms : undefined,
      });

      const text = response.content.map((item) => item.text).join('\n');
      process.stdout.write(`${text}\n`);
    },
  );

cli.help();
cli.parse();
