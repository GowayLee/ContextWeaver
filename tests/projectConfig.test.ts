import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getProjectIdentity } from '../src/db/index.js';
import {
  formatProjectIndexingScope,
  getDefaultProjectConfig,
  loadProjectConfig,
  stringifyProjectConfig,
} from '../src/projectConfig.js';

async function createTempRepo(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'cw-project-config-'));
}

async function writeConfig(repoRoot: string, content: string): Promise<void> {
  await fs.writeFile(path.join(repoRoot, 'cwconfig.json'), content, 'utf-8');
}

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('loadProjectConfig', () => {
  it('returns defaults when cwconfig.json is missing', async () => {
    const repoRoot = await createTempRepo();
    tempDirs.push(repoRoot);

    await expect(loadProjectConfig(repoRoot)).resolves.toEqual({
      indexing: { includePatterns: null, ignorePatterns: [] },
    });
  });

  it('loads indexing include and ignore patterns', async () => {
    const repoRoot = await createTempRepo();
    tempDirs.push(repoRoot);
    await writeConfig(
      repoRoot,
      JSON.stringify(
        {
          indexing: {
            includePatterns: ['src/**', 'packages/*/src/**'],
            ignorePatterns: ['**/generated/**', 'fixtures/'],
          },
        },
        null,
        2,
      ),
    );

    await expect(loadProjectConfig(repoRoot)).resolves.toEqual({
      indexing: {
        includePatterns: ['src/**', 'packages/*/src/**'],
        ignorePatterns: ['**/generated/**', 'fixtures/'],
      },
    });
  });

  it('fills defaults when indexing fields are omitted', async () => {
    const repoRoot = await createTempRepo();
    tempDirs.push(repoRoot);
    await writeConfig(repoRoot, JSON.stringify({ indexing: {} }));

    await expect(loadProjectConfig(repoRoot)).resolves.toEqual({
      indexing: { includePatterns: null, ignorePatterns: [] },
    });
  });

  it('throws when cwconfig.json contains invalid JSON', async () => {
    const repoRoot = await createTempRepo();
    tempDirs.push(repoRoot);
    await writeConfig(repoRoot, '{ invalid json');

    await expect(loadProjectConfig(repoRoot)).rejects.toThrow('cwconfig.json');
  });

  it('throws when the root JSON value is not an object', async () => {
    const repoRoot = await createTempRepo();
    tempDirs.push(repoRoot);
    await writeConfig(repoRoot, JSON.stringify(['src/**']));

    await expect(loadProjectConfig(repoRoot)).rejects.toThrow('cwconfig.json');
  });

  it('throws when indexing is not an object', async () => {
    const repoRoot = await createTempRepo();
    tempDirs.push(repoRoot);
    await writeConfig(repoRoot, JSON.stringify({ indexing: 'src/**' }));

    await expect(loadProjectConfig(repoRoot)).rejects.toThrow('indexing');
  });

  it('throws when includePatterns is not an array', async () => {
    const repoRoot = await createTempRepo();
    tempDirs.push(repoRoot);
    await writeConfig(repoRoot, JSON.stringify({ indexing: { includePatterns: 'src/**' } }));

    await expect(loadProjectConfig(repoRoot)).rejects.toThrow('includePatterns');
  });

  it('throws when ignorePatterns is not an array', async () => {
    const repoRoot = await createTempRepo();
    tempDirs.push(repoRoot);
    await writeConfig(repoRoot, JSON.stringify({ indexing: { ignorePatterns: 'dist/' } }));

    await expect(loadProjectConfig(repoRoot)).rejects.toThrow('ignorePatterns');
  });

  it('throws when includePatterns contains non-string values', async () => {
    const repoRoot = await createTempRepo();
    tempDirs.push(repoRoot);
    await writeConfig(repoRoot, JSON.stringify({ indexing: { includePatterns: ['src/**', 1] } }));

    await expect(loadProjectConfig(repoRoot)).rejects.toThrow('includePatterns');
  });

  it('throws when ignorePatterns contains non-string values', async () => {
    const repoRoot = await createTempRepo();
    tempDirs.push(repoRoot);
    await writeConfig(repoRoot, JSON.stringify({ indexing: { ignorePatterns: ['dist/', false] } }));

    await expect(loadProjectConfig(repoRoot)).rejects.toThrow('ignorePatterns');
  });

  it('throws when includePatterns contains a negated pattern', async () => {
    const repoRoot = await createTempRepo();
    tempDirs.push(repoRoot);
    await writeConfig(repoRoot, JSON.stringify({ indexing: { includePatterns: ['!src/**'] } }));

    await expect(loadProjectConfig(repoRoot)).rejects.toThrow('includePatterns');
  });

  it('throws when ignorePatterns contains a negated pattern', async () => {
    const repoRoot = await createTempRepo();
    tempDirs.push(repoRoot);
    await writeConfig(repoRoot, JSON.stringify({ indexing: { ignorePatterns: ['!dist/**'] } }));

    await expect(loadProjectConfig(repoRoot)).rejects.toThrow('ignorePatterns');
  });
});

describe('project config helpers', () => {
  it('returns the canonical default project config', () => {
    expect(getDefaultProjectConfig()).toEqual({
      indexing: {
        includePatterns: null,
        ignorePatterns: [],
      },
    });
  });

  it('stringifies the default project config without includePatterns', () => {
    expect(stringifyProjectConfig(getDefaultProjectConfig())).toBe(
      '{\n  "indexing": {\n    "ignorePatterns": []\n  }\n}\n',
    );
  });

  it('formats scope summaries for default and empty include scopes', () => {
    expect(formatProjectIndexingScope(getDefaultProjectConfig())).toEqual({
      includeSummary: '<all files>',
      ignoreSummary: '<none>',
      hasEmptyIncludeScope: false,
    });

    expect(
      formatProjectIndexingScope({
        indexing: {
          includePatterns: [],
          ignorePatterns: ['dist/**'],
        },
      }),
    ).toEqual({
      includeSummary: '<empty>',
      ignoreSummary: 'dist/**',
      hasEmptyIncludeScope: true,
    });
  });
});

describe('getProjectIdentity', () => {
  it('returns project path, birthtime, and derived project id', async () => {
    const repoRoot = await createTempRepo();
    tempDirs.push(repoRoot);

    const identity = getProjectIdentity(repoRoot);

    expect(identity.projectPath).toBe(repoRoot);
    expect(identity.pathBirthtimeMs).toBeGreaterThanOrEqual(0);
    expect(identity.projectId).toMatch(/^[a-f0-9]{10}$/);
  });
});
