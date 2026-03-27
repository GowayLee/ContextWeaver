import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { getExcludePatterns } from './config.js';
import { getProjectIdentity, type ProjectIdentity } from './db/index.js';
import {
  findStaleIndexedProjects,
  type IndexedProjectRecord,
  isIndexedProjectConfirmed,
  removeIndexedProjects,
  upsertIndexedProject,
} from './indexRegistry.js';
import {
  formatProjectIndexingScope,
  getRecommendedProjectConfigTemplate,
  loadProjectConfig,
  stringifyProjectConfig,
} from './projectConfig.js';
import { crawl } from './scanner/crawler.js';
import { initFilter } from './scanner/filter.js';
import { type ScanOptions, type ScanStats, scan } from './scanner/index.js';
import { logger } from './utils/logger.js';

function getBaseDir(): string {
  return path.join(os.homedir(), '.contextweaver');
}

function getPackageRootDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export function resolveSkillInstallTarget(options: { cwd: string; targetDir?: string }): string {
  if (options.targetDir) {
    return path.resolve(options.cwd, options.targetDir);
  }

  return options.cwd;
}

export async function installBundledSkills(options: {
  targetDir: string;
  force: boolean;
}): Promise<Array<{ name: string; targetPath: string }>> {
  const bundledSkillsDir = path.join(getPackageRootDir(), 'skills');
  const entries = await fs.readdir(bundledSkillsDir, { withFileTypes: true });
  const skillDirs = entries.filter((entry) => entry.isDirectory());

  await fs.mkdir(options.targetDir, { recursive: true });

  const installed: Array<{ name: string; targetPath: string }> = [];
  for (const entry of skillDirs) {
    const sourcePath = path.join(bundledSkillsDir, entry.name);
    const targetPath = path.join(options.targetDir, entry.name);

    if (await pathExists(targetPath)) {
      if (!options.force) {
        throw new Error(`skill directory already exists: ${targetPath}`);
      }
      await fs.rm(targetPath, { recursive: true, force: true });
    }

    await fs.cp(sourcePath, targetPath, { recursive: true });
    installed.push({ name: entry.name, targetPath });
  }

  return installed;
}

async function defaultConfirmDelete(count: number): Promise<boolean> {
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    const answer = await rl.question(`确认删除以上 ${count} 个失效索引？ [y/N] `);
    return answer.trim().toLowerCase() === 'y';
  } finally {
    rl.close();
  }
}

async function defaultConfirmIndex(): Promise<boolean> {
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    const answer = await rl.question('确认开始索引？ [y/N] ');
    return answer.trim().toLowerCase() === 'y';
  } finally {
    rl.close();
  }
}

function summarizeDirectory(relativePath: string): string {
  const firstSlash = relativePath.indexOf('/');
  if (firstSlash === -1) {
    return './';
  }
  return `${relativePath.slice(0, firstSlash + 1)}`;
}

function getExtension(relativePath: string): string {
  const ext = path.extname(relativePath).toLowerCase();
  return ext || '<no-ext>';
}

export async function buildIndexScopeLogLines(rootPath: string): Promise<string[]> {
  const config = await loadProjectConfig(rootPath);
  const scope = formatProjectIndexingScope(config);

  return [
    '索引范围:',
    `  - include: ${scope.includeSummary}`,
    `  - ignore (project): ${scope.ignoreSummary}`,
    '  - ignore (.gitignore at repo root): enabled',
    `  - ignore (built-in): ${getExcludePatterns().join(', ')}`,
    '  - always excluded: cwconfig.json',
    ...(scope.hasEmptyIncludeScope
      ? ['  - warning: current config yields an empty indexing scope']
      : []),
  ];
}

export async function initProjectConfigCommand(options: {
  cwd: string;
  force: boolean;
}): Promise<string> {
  const configPath = path.join(options.cwd, 'cwconfig.json');

  if (!options.force) {
    try {
      await fs.access(configPath);
      throw new Error(`cwconfig.json already exists: ${configPath}`);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  await fs.writeFile(
    configPath,
    stringifyProjectConfig(getRecommendedProjectConfigTemplate()),
    'utf-8',
  );
  return configPath;
}

export async function ensureProjectConfigForIndex(
  rootPath: string,
): Promise<{ kind: 'ready'; configPath: string } | { kind: 'created_config'; configPath: string }> {
  const configPath = path.join(rootPath, 'cwconfig.json');

  try {
    await fs.access(configPath);
    return { kind: 'ready', configPath };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== 'ENOENT') {
      throw error;
    }
  }

  await fs.writeFile(
    configPath,
    stringifyProjectConfig(getRecommendedProjectConfigTemplate()),
    'utf-8',
  );
  return { kind: 'created_config', configPath };
}

export async function buildIndexPreview(rootPath: string): Promise<{
  matchedFilePaths: string[];
  totalFiles: number;
  directorySummaries: string[];
  extensionSummaries: string[];
  samplePaths: string[];
}> {
  await initFilter(rootPath);
  const { filePaths, relativePaths } = await crawl(rootPath);

  const directoryStats = new Map<string, Map<string, number>>();
  const extensionStats = new Map<string, number>();

  for (const relativePath of relativePaths) {
    const directory = summarizeDirectory(relativePath);
    const extension = getExtension(relativePath);
    const directoryEntry = directoryStats.get(directory) ?? new Map<string, number>();
    directoryEntry.set(extension, (directoryEntry.get(extension) ?? 0) + 1);
    directoryStats.set(directory, directoryEntry);
    extensionStats.set(extension, (extensionStats.get(extension) ?? 0) + 1);
  }

  const directorySummaries = [...directoryStats.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([directory, extensions]) => {
      const extensionSummary = [...extensions.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([ext, count]) => `${ext}(${count})`)
        .join(', ');
      return `${directory}: ${extensionSummary}`;
    });

  const extensionSummaries = [...extensionStats.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ext, count]) => `${ext}(${count})`);

  return {
    matchedFilePaths: filePaths,
    totalFiles: filePaths.length,
    directorySummaries,
    extensionSummaries,
    samplePaths: [...relativePaths].sort().slice(0, 10),
  };
}

export async function deleteIndexedProjectDirectory(projectId: string): Promise<void> {
  if (!/^[a-f0-9]{10}$/.test(projectId)) {
    throw new Error(
      `projectId must resolve to a direct child of ${getBaseDir()}; reserved names are blocked`,
    );
  }
  if (
    !projectId ||
    path.basename(projectId) !== projectId ||
    projectId === '.' ||
    projectId === '..'
  ) {
    throw new Error(`projectId must resolve to a direct child of ${getBaseDir()}`);
  }

  await fs.rm(path.join(getBaseDir(), projectId), { recursive: true });
}

export async function recordIndexedProject(
  rootPath: string,
  options?: { confirmedAt?: string | null },
): Promise<void> {
  const identity = getProjectIdentity(rootPath);
  const lastIndexedAt = new Date().toISOString();
  await upsertIndexedProject({
    projectId: identity.projectId,
    projectPath: identity.projectPath,
    pathBirthtimeMs: identity.pathBirthtimeMs,
    lastIndexedAt,
    confirmedAt: options?.confirmedAt ?? null,
  });
}

export async function ensureSearchableProject(rootPath: string): Promise<void> {
  const configPath = path.join(rootPath, 'cwconfig.json');
  try {
    await fs.access(configPath);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      throw new Error('当前仓库尚未完成确认式索引，请先运行 `cw index`。');
    }
    throw error;
  }

  const identity = getProjectIdentity(rootPath);
  if (!(await isIndexedProjectConfirmed(identity.projectId))) {
    throw new Error('当前仓库尚未完成确认式索引，请先运行 `cw index`。');
  }
}

export async function runCleanIndexes(options: {
  isInteractive: boolean;
  yes?: boolean;
  dryRun?: boolean;
  staleProjects?: IndexedProjectRecord[];
  confirmDelete?: (count: number) => Promise<boolean>;
  deleteDirectory?: (projectId: string) => Promise<void>;
  removeRecords?: (projectIds: string[]) => Promise<void>;
  writeLine?: (line: string) => void;
}): Promise<{
  staleProjectIds: string[];
  deletedProjectIds: string[];
  failedProjectIds: string[];
  prunedProjectIds: string[];
}> {
  if (!options.isInteractive && !options.yes && !options.dryRun) {
    throw new Error('Non-interactive cleanup requires --yes or --dry-run');
  }

  const staleProjects = options.staleProjects ?? (await findStaleIndexedProjects());
  const staleProjectIds = staleProjects.map((item) => item.projectId);
  const writeLine = options.writeLine ?? (() => {});

  if (staleProjects.length === 0) {
    writeLine('没有发现可清理的失效索引');
    return {
      staleProjectIds: [],
      deletedProjectIds: [],
      failedProjectIds: [],
      prunedProjectIds: [],
    };
  }

  writeLine(`发现 ${staleProjects.length} 个失效索引:`);
  for (const item of staleProjects) {
    writeLine(`- ${item.projectId} ${item.projectPath}`);
  }

  if (options.dryRun) {
    return {
      staleProjectIds,
      deletedProjectIds: [],
      failedProjectIds: [],
      prunedProjectIds: [],
    };
  }

  if (!options.yes) {
    const confirmed = await (options.confirmDelete ?? defaultConfirmDelete)(staleProjects.length);
    if (!confirmed) {
      return {
        staleProjectIds,
        deletedProjectIds: [],
        failedProjectIds: [],
        prunedProjectIds: [],
      };
    }
  }

  const deleteDirectory = options.deleteDirectory ?? deleteIndexedProjectDirectory;
  const removeRecords = options.removeRecords ?? removeIndexedProjects;
  const deletedProjectIds: string[] = [];
  const failedProjectIds: string[] = [];
  const prunedProjectIds: string[] = [];

  for (const item of staleProjects) {
    try {
      await deleteDirectory(item.projectId);
      deletedProjectIds.push(item.projectId);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        prunedProjectIds.push(item.projectId);
        continue;
      }
      failedProjectIds.push(item.projectId);
    }
  }

  const removableIds = [...deletedProjectIds, ...prunedProjectIds];
  if (removableIds.length > 0) {
    await removeRecords(removableIds);
  }

  return {
    staleProjectIds,
    deletedProjectIds,
    failedProjectIds,
    prunedProjectIds,
  };
}

export async function runIndexCommand(options: {
  rootPath: string;
  force?: boolean;
  yes?: boolean;
  isInteractive?: boolean;
  confirmIndex?: () => Promise<boolean>;
  logLine?: (line: string) => void;
  scanFn?: (rootPath: string, options: ScanOptions) => Promise<ScanStats>;
  recordIndexedProjectFn?: (
    rootPath: string,
    options?: { confirmedAt?: string | null },
  ) => Promise<void>;
  identity?: ProjectIdentity;
}): Promise<ScanStats> {
  const logLine = options.logLine ?? ((line: string) => logger.info(line));
  const isInteractive = options.isInteractive ?? Boolean(stdin.isTTY && stdout.isTTY);
  const identity = options.identity ?? getProjectIdentity(options.rootPath);

  const configState = await ensureProjectConfigForIndex(options.rootPath);
  if (configState.kind === 'created_config') {
    throw new Error(`已创建 ${configState.configPath}，请先检查配置后重新运行 cw index。`);
  }

  const preview = await buildIndexPreview(options.rootPath);
  if (preview.totalFiles === 0) {
    throw new Error('Current config matches no indexable files.');
  }

  logLine(`开始扫描: ${options.rootPath}`);
  logLine(`项目 ID: ${identity.projectId}`);
  if (options.force) {
    logLine('强制重新索引: 是');
  }
  for (const line of await buildIndexScopeLogLines(options.rootPath)) {
    logLine(line);
  }
  logLine(`实际匹配预览: ${preview.totalFiles} 个文件`);
  for (const line of preview.directorySummaries) {
    logLine(`- ${line}`);
  }
  logLine('匹配路径样本:');
  for (const samplePath of preview.samplePaths) {
    logLine(`- ${samplePath}`);
  }

  if (!options.yes) {
    if (!isInteractive) {
      throw new Error('Non-interactive index preview requires --yes');
    }

    const confirmed = await (options.confirmIndex ?? defaultConfirmIndex)();
    if (!confirmed) {
      throw new Error('Index confirmation declined');
    }
  }

  const { withLock } = await import('./utils/lock.js');
  let lastLoggedPercent = 0;
  const confirmedAt = new Date().toISOString();
  const stats = await withLock(
    identity.projectId,
    'index',
    async () =>
      (options.scanFn ?? scan)(options.rootPath, {
        force: options.force,
        precomputedFilePaths: preview.matchedFilePaths,
        onProgress: (current, total, message) => {
          if (total === undefined) {
            return;
          }
          const percent = Math.floor((current / total) * 100);
          if (percent >= lastLoggedPercent + 30 && percent < 100) {
            logLine(`索引进度: ${percent}% - ${message || ''}`);
            lastLoggedPercent = Math.floor(percent / 30) * 30;
          }
        },
      }),
    10 * 60 * 1000,
  );
  await (options.recordIndexedProjectFn ?? recordIndexedProject)(options.rootPath, { confirmedAt });
  return stats;
}
