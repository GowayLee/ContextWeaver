/**
 * 统一配置模块
 *
 * 整合环境变量加载、API 配置、排除模式等所有配置项
 *
 * 加载策略：
 * - 开发环境 (NODE_ENV !== "production"): 加载项目根目录的 .env 文件
 * - 生产环境 (NODE_ENV === "production"): 加载 ~/.contextweaver/.env 文件
 *
 * 此模块必须在应用启动时最先导入，以确保环境变量在其他模块加载前可用。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';

// 环境变量加载

const isDev = process.env.NODE_ENV === 'dev';

// 兼容 logger 的非交互模式检测；当前已不再暴露 MCP 命令。
export const isMcpMode = process.argv.includes('mcp');

function loadEnv(): void {
  // 可能的 .env 文件路径（按优先级排序）
  const candidates = isDev
    ? [
        path.join(process.cwd(), '.env'), // 1. 当前目录（开发用）
        path.join(os.homedir(), '.contextweaver', '.env'), // 2. 用户配置目录（回退）
      ]
    : [
        path.join(os.homedir(), '.contextweaver', '.env'), // 生产环境只用用户配置
      ];

  // 找到第一个存在的文件
  const envPath = candidates.find((p) => fs.existsSync(p));

  if (envPath) {
    const result = dotenv.config({ path: envPath, quiet: true });
    if (result.error) {
      // 环境变量加载失败是致命错误，此时 logger 尚未初始化，只能用 console
      console.error(`[config] 加载环境变量失败: ${result.error.message}`);
      process.exit(1);
    }
  }
  // 所有路径都不存在时静默跳过，允许无 .env 文件运行
}

// 立即执行加载
loadEnv();

// API 配置类型定义

export interface EmbeddingConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxConcurrency: number;
  /** 向量维度 */
  dimensions: number;
  /** 模型最大输入 token 数，超过此值的文本会在请求前截断 */
  maxInputTokens: number;
}

export interface RerankerConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  topN: number;
}

// API 配置获取

/**
 * 环境变量检查结果
 */
export interface EnvCheckResult {
  isValid: boolean;
  missingVars: string[];
}

/**
 * 默认的 API Key 占位符（未修改则视为未配置）
 */
const DEFAULT_API_KEY_PLACEHOLDER = 'your-api-key-here';

/**
 * 检查 Embedding 相关环境变量是否已配置（不抛出错误）
 * @returns 检查结果，包含是否有效和缺失的变量列表
 */
export function checkEmbeddingEnv(): EnvCheckResult {
  const missingVars: string[] = [];

  const apiKey = process.env.EMBEDDINGS_API_KEY;
  if (!apiKey || apiKey === DEFAULT_API_KEY_PLACEHOLDER) {
    missingVars.push('EMBEDDINGS_API_KEY');
  }
  if (!process.env.EMBEDDINGS_BASE_URL) {
    missingVars.push('EMBEDDINGS_BASE_URL');
  }
  if (!process.env.EMBEDDINGS_MODEL) {
    missingVars.push('EMBEDDINGS_MODEL');
  }

  return {
    isValid: missingVars.length === 0,
    missingVars,
  };
}

/**
 * 检查 Reranker 相关环境变量是否已配置（不抛出错误）
 * @returns 检查结果，包含是否有效和缺失的变量列表
 */
export function checkRerankerEnv(): EnvCheckResult {
  const missingVars: string[] = [];

  const apiKey = process.env.RERANK_API_KEY;
  if (!apiKey || apiKey === DEFAULT_API_KEY_PLACEHOLDER) {
    missingVars.push('RERANK_API_KEY');
  }
  if (!process.env.RERANK_BASE_URL) {
    missingVars.push('RERANK_BASE_URL');
  }
  if (!process.env.RERANK_MODEL) {
    missingVars.push('RERANK_MODEL');
  }

  return {
    isValid: missingVars.length === 0,
    missingVars,
  };
}

/**
 * 获取 Embedding 配置
 * @throws 如果必需的配置项缺失
 */
export function getEmbeddingConfig(): EmbeddingConfig {
  const apiKey = process.env.EMBEDDINGS_API_KEY;
  const baseUrl = process.env.EMBEDDINGS_BASE_URL;
  const model = process.env.EMBEDDINGS_MODEL;
  const maxConcurrency = parseInt(process.env.EMBEDDINGS_MAX_CONCURRENCY || '10', 10);

  if (!apiKey) {
    throw new Error('EMBEDDINGS_API_KEY 环境变量未设置');
  }
  if (!baseUrl) {
    throw new Error('EMBEDDINGS_BASE_URL 环境变量未设置');
  }
  if (!model) {
    throw new Error('EMBEDDINGS_MODEL 环境变量未设置');
  }

  const dimensions = parseInt(process.env.EMBEDDINGS_DIMENSIONS || '1024', 10);
  const maxInputTokens = parseInt(process.env.EMBEDDINGS_MAX_INPUT_TOKENS || '8192', 10);

  return {
    apiKey,
    baseUrl,
    model,
    maxConcurrency: Number.isNaN(maxConcurrency) ? 4 : maxConcurrency,
    dimensions: Number.isNaN(dimensions) ? 1024 : dimensions,
    maxInputTokens: Number.isNaN(maxInputTokens) ? 8192 : maxInputTokens,
  };
}

/**
 * 获取 Reranker 配置
 * @throws 如果必需的配置项缺失
 */
export function getRerankerConfig(): RerankerConfig {
  const apiKey = process.env.RERANK_API_KEY;
  const baseUrl = process.env.RERANK_BASE_URL;
  const model = process.env.RERANK_MODEL;
  const topN = parseInt(process.env.RERANK_TOP_N || '10', 10);

  if (!apiKey) {
    throw new Error('RERANK_API_KEY 环境变量未设置');
  }
  if (!baseUrl) {
    throw new Error('RERANK_BASE_URL 环境变量未设置');
  }
  if (!model) {
    throw new Error('RERANK_MODEL 环境变量未设置');
  }

  return {
    apiKey,
    baseUrl,
    model,
    topN: Number.isNaN(topN) ? 10 : topN,
  };
}

// 排除模式配置

/**
 * 默认排除列表
 *
 * 策略：
 * 1. 绝对屏蔽高 Token 消耗且低语义价值的文件 (Lock files, Maps, Assets)
 * 2. 绝对屏蔽构建产物和依赖 (Dist, node_modules)
 * 3. 智能保留测试逻辑，但剔除测试数据
 */
const DEFAULT_EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '.idea',
  '.vscode',
  '.vs',
  '.venv',
  'venv',
];

/**
 * 获取合并后的排除模式列表
 * @returns 排除模式数组
 */
export function getExcludePatterns(): string[] {
  return [...DEFAULT_EXCLUDE_PATTERNS];
}

export { isDev };
