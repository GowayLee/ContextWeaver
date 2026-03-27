import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getProjectIdentity } from './db/index.js';

export interface IndexedProjectRecord {
  projectId: string;
  projectPath: string;
  pathBirthtimeMs: number;
  lastIndexedAt: string;
  confirmedAt: string | null;
}

interface RegistryFile {
  version: 1;
  indexes: IndexedProjectRecord[];
}

function getBaseDir(): string {
  return path.join(os.homedir(), '.contextweaver');
}

function getRegistryPath(): string {
  return path.join(getBaseDir(), 'indexes.json');
}

function normalizeRecord(record: IndexedProjectRecord): IndexedProjectRecord {
  return {
    ...record,
    confirmedAt: record.confirmedAt ?? null,
    projectPath: path.resolve(record.projectPath),
  };
}

function validateRecord(value: unknown, registryPath: string): IndexedProjectRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid ${registryPath}: index record must be an object`);
  }

  const record = value as Record<string, unknown>;
  if (typeof record.projectId !== 'string') {
    throw new Error(`Invalid ${registryPath}: projectId must be a string`);
  }
  if (typeof record.projectPath !== 'string') {
    throw new Error(`Invalid ${registryPath}: projectPath must be a string`);
  }
  if (typeof record.pathBirthtimeMs !== 'number') {
    throw new Error(`Invalid ${registryPath}: pathBirthtimeMs must be a number`);
  }
  if (typeof record.lastIndexedAt !== 'string') {
    throw new Error(`Invalid ${registryPath}: lastIndexedAt must be a string`);
  }
  if (
    record.confirmedAt !== undefined &&
    record.confirmedAt !== null &&
    typeof record.confirmedAt !== 'string'
  ) {
    throw new Error(`Invalid ${registryPath}: confirmedAt must be a string or null`);
  }

  return normalizeRecord({
    projectId: record.projectId,
    projectPath: record.projectPath,
    pathBirthtimeMs: record.pathBirthtimeMs,
    lastIndexedAt: record.lastIndexedAt,
    confirmedAt: (record.confirmedAt as string | null | undefined) ?? null,
  });
}

async function readRegistry(): Promise<RegistryFile> {
  const registryPath = getRegistryPath();

  let content: string;
  try {
    content = await fs.readFile(registryPath, 'utf-8');
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      return { version: 1, indexes: [] };
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const err = error as Error;
    throw new Error(`Invalid ${registryPath}: failed to parse JSON (${err.message})`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Invalid ${registryPath}: top-level value must be an object`);
  }

  const registry = parsed as Record<string, unknown>;
  if (!Array.isArray(registry.indexes)) {
    throw new Error(`Invalid ${registryPath}: indexes must be an array`);
  }

  return {
    version: 1,
    indexes: registry.indexes.map((item) => validateRecord(item, registryPath)),
  };
}

async function writeRegistry(records: IndexedProjectRecord[]): Promise<void> {
  const registryPath = getRegistryPath();
  await fs.mkdir(path.dirname(registryPath), { recursive: true });
  const sorted = records
    .map(normalizeRecord)
    .sort((a, b) => a.projectPath.localeCompare(b.projectPath));
  await fs.writeFile(
    registryPath,
    `${JSON.stringify({ version: 1, indexes: sorted }, null, 2)}
`,
    'utf-8',
  );
}

export async function listIndexedProjects(): Promise<IndexedProjectRecord[]> {
  const registry = await readRegistry();
  return registry.indexes;
}

export async function upsertIndexedProject(record: IndexedProjectRecord): Promise<void> {
  const registry = await readRegistry();
  const normalized = normalizeRecord(record);
  const indexes = registry.indexes.filter((item) => item.projectId !== normalized.projectId);
  indexes.push(normalized);
  await writeRegistry(indexes);
}

export async function markIndexedProjectConfirmed(
  projectId: string,
  confirmedAt: string,
): Promise<void> {
  const registry = await readRegistry();
  const indexes = registry.indexes.map((item) =>
    item.projectId === projectId ? { ...item, confirmedAt } : item,
  );
  await writeRegistry(indexes);
}

export async function isIndexedProjectConfirmed(projectId: string): Promise<boolean> {
  const registry = await readRegistry();
  return registry.indexes.some((item) => item.projectId === projectId && item.confirmedAt !== null);
}

export async function findStaleIndexedProjects(): Promise<IndexedProjectRecord[]> {
  const indexes = await listIndexedProjects();
  const stale: IndexedProjectRecord[] = [];

  for (const record of indexes) {
    try {
      const stats = await fs.stat(record.projectPath);
      if (!stats.isDirectory()) {
        stale.push(record);
        continue;
      }
      if (getProjectIdentity(record.projectPath).pathBirthtimeMs !== record.pathBirthtimeMs) {
        stale.push(record);
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        stale.push(record);
        continue;
      }
      throw error;
    }
  }

  return stale;
}

export async function removeIndexedProjects(projectIds: string[]): Promise<void> {
  const registry = await readRegistry();
  await writeRegistry(registry.indexes.filter((item) => !projectIds.includes(item.projectId)));
}
