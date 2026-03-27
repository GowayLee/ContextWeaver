import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { getProjectIdentity, type ProjectIdentity } from './db/index.js';
import {
  findStaleIndexedProjects,
  type IndexedProjectRecord,
  removeIndexedProjects,
  upsertIndexedProject,
} from './indexRegistry.js';
import {
  formatProjectIndexingScope,
  getDefaultProjectConfig,
  loadProjectConfig,
  stringifyProjectConfig,
} from './projectConfig.js';
import { type ScanOptions, type ScanStats, scan } from './scanner/index.js';
import { logger } from './utils/logger.js';

function getBaseDir(): string {
  return path.join(os.homedir(), '.contextweaver');
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

export async function buildIndexScopeLogLines(rootPath: string): Promise<string[]> {
  const config = await loadProjectConfig(rootPath);
  const scope = formatProjectIndexingScope(config);

  return [
    '索引范围:',
    `  - include: ${scope.includeSummary}`,
    `  - ignore (project): ${scope.ignoreSummary}`,
    '  - ignore (.gitignore at repo root): enabled',
    '  - ignore (built-in): enabled',
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

  await fs.writeFile(configPath, stringifyProjectConfig(getDefaultProjectConfig()), 'utf-8');
  return configPath;
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

export async function recordIndexedProject(rootPath: string): Promise<void> {
  const identity = getProjectIdentity(rootPath);
  await upsertIndexedProject({
    projectId: identity.projectId,
    projectPath: identity.projectPath,
    pathBirthtimeMs: identity.pathBirthtimeMs,
    lastIndexedAt: new Date().toISOString(),
  });
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
  logLine?: (line: string) => void;
  scanFn?: (rootPath: string, options: ScanOptions) => Promise<ScanStats>;
  recordIndexedProjectFn?: (rootPath: string) => Promise<void>;
  identity?: ProjectIdentity;
}): Promise<ScanStats> {
  const logLine = options.logLine ?? ((line: string) => logger.info(line));
  const identity = options.identity ?? getProjectIdentity(options.rootPath);

  logLine(`开始扫描: ${options.rootPath}`);
  logLine(`项目 ID: ${identity.projectId}`);
  if (options.force) {
    logLine('强制重新索引: 是');
  }
  for (const line of await buildIndexScopeLogLines(options.rootPath)) {
    logLine(line);
  }

  const { withLock } = await import('./utils/lock.js');
  let lastLoggedPercent = 0;
  const stats = await withLock(
    identity.projectId,
    'index',
    async () =>
      (options.scanFn ?? scan)(options.rootPath, {
        force: options.force,
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
  await (options.recordIndexedProjectFn ?? recordIndexedProject)(options.rootPath);
  return stats;
}
