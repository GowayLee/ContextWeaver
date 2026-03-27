import fs from 'node:fs/promises';
import path from 'node:path';
import ignore from 'ignore';
import { getExcludePatterns } from '../config.js';
import { loadProjectConfig } from '../projectConfig.js';
import { isAllowedExtension } from './language.js';

let includeInstance: ignore.Ignore | null = null;
let defaultIgnoreInstance: ignore.Ignore | null = null;
let projectIgnoreInstance: ignore.Ignore | null = null;
let gitignoreInstance: ignore.Ignore | null = null;
let includeAll = true;
let lastConfigHash: string | null = null;

/**
 * 生成配置文件内容的 hash
 */
async function generateConfigHash(rootPath: string): Promise<string> {
  const crypto = await import('node:crypto');
  const hashes: string[] = [];

  const configPath = path.join(rootPath, 'cwconfig.json');
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    hashes.push(`cwconfig:${crypto.createHash('sha256').update(content).digest('hex')}`);
  } catch {
    hashes.push('cwconfig:missing');
  }

  const gitignorePath = path.join(rootPath, '.gitignore');
  try {
    const content = await fs.readFile(gitignorePath, 'utf-8');
    hashes.push(`gitignore:${crypto.createHash('sha256').update(content).digest('hex')}`);
  } catch {
    hashes.push('gitignore:missing');
  }

  // 合并所有 hashes
  const combined = hashes.join('|');
  return crypto.createHash('sha256').update(combined).digest('hex');
}

/**
 * 初始化过滤器
 */
export async function initFilter(rootPath: string): Promise<void> {
  const currentHash = await generateConfigHash(rootPath);

  if (
    lastConfigHash === currentHash &&
    defaultIgnoreInstance &&
    projectIgnoreInstance &&
    gitignoreInstance &&
    (includeAll || includeInstance)
  ) {
    return; // 配置未变更，复用实例
  }

  const projectConfig = await loadProjectConfig(rootPath);

  if (projectConfig.indexing.includePatterns === null) {
    includeAll = true;
    includeInstance = null;
  } else {
    includeAll = false;
    includeInstance = ignore().add(projectConfig.indexing.includePatterns);
  }

  defaultIgnoreInstance = ignore().add(getExcludePatterns());
  projectIgnoreInstance = ignore().add(projectConfig.indexing.ignorePatterns);

  // 加载 .gitignore
  const gitignorePath = path.join(rootPath, '.gitignore');
  const gitignore = ignore();
  try {
    await fs.access(gitignorePath);
    gitignore.add(await fs.readFile(gitignorePath, 'utf-8'));
  } catch {
    // 文件不存在，静默跳过
  }

  gitignoreInstance = gitignore;
  lastConfigHash = currentHash;
}

/**
 * 判断文件路径是否应该被过滤掉
 */
export function isFiltered(relativePath: string): boolean {
  if (!defaultIgnoreInstance || !projectIgnoreInstance || !gitignoreInstance) {
    throw new Error('Filter not initialized. Call initFilter() first.');
  }

  return (
    relativePath === 'cwconfig.json' ||
    defaultIgnoreInstance.ignores(relativePath) ||
    projectIgnoreInstance.ignores(relativePath) ||
    gitignoreInstance.ignores(relativePath)
  );
}

/**
 * 判断文件路径是否在项目配置的包含范围内
 */
export function isIncluded(relativePath: string): boolean {
  if (includeAll) {
    return true;
  }

  if (!includeInstance) {
    throw new Error('Filter not initialized. Call initFilter() first.');
  }

  return includeInstance.ignores(relativePath);
}

/**
 * 判断文件扩展名是否在白名单中
 */
export function isAllowedFile(filePath: string): boolean {
  return isAllowedExtension(filePath);
}
