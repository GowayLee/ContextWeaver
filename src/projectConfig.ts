import fs from 'node:fs/promises';
import path from 'node:path';

export interface ProjectIndexingConfig {
  includePatterns: string[] | null;
  ignorePatterns: string[];
}

export interface ProjectConfig {
  indexing: ProjectIndexingConfig;
}

const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  indexing: {
    includePatterns: null,
    ignorePatterns: [],
  },
};

export function getDefaultProjectConfig(): ProjectConfig {
  return {
    indexing: {
      includePatterns: DEFAULT_PROJECT_CONFIG.indexing.includePatterns,
      ignorePatterns: [...DEFAULT_PROJECT_CONFIG.indexing.ignorePatterns],
    },
  };
}

export function getRecommendedProjectConfigTemplate(): ProjectConfig {
  return {
    indexing: {
      includePatterns: ['src/**'],
      ignorePatterns: [],
    },
  };
}

export function stringifyProjectConfig(config: ProjectConfig): string {
  return `${JSON.stringify(
    {
      indexing: {
        ...(config.indexing.includePatterns === null
          ? {}
          : { includePatterns: config.indexing.includePatterns }),
        ignorePatterns: config.indexing.ignorePatterns,
      },
    },
    null,
    2,
  )}
`;
}

export function formatProjectIndexingScope(config: ProjectConfig): {
  includeSummary: string;
  ignoreSummary: string;
  hasEmptyIncludeScope: boolean;
} {
  const include = config.indexing.includePatterns;

  return {
    includeSummary:
      include === null ? '<all files>' : include.length === 0 ? '<empty>' : include.join(', '),
    ignoreSummary:
      config.indexing.ignorePatterns.length === 0
        ? '<none>'
        : config.indexing.ignorePatterns.join(', '),
    hasEmptyIncludeScope: Array.isArray(include) && include.length === 0,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validatePatterns(value: unknown, fieldName: string, configPath: string): string[] | null {
  if (value === undefined) {
    return fieldName === 'includePatterns' ? null : [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${configPath}: indexing.${fieldName} must be an array of strings`);
  }

  for (const pattern of value) {
    if (typeof pattern !== 'string') {
      throw new Error(`Invalid ${configPath}: indexing.${fieldName} must be an array of strings`);
    }

    if (pattern.startsWith('!')) {
      throw new Error(
        `Invalid ${configPath}: indexing.${fieldName} does not support negated patterns`,
      );
    }
  }

  return value;
}

export async function loadProjectConfig(rootPath: string): Promise<ProjectConfig> {
  const configPath = path.join(rootPath, 'cwconfig.json');

  let content: string;
  try {
    content = await fs.readFile(configPath, 'utf-8');
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      return getDefaultProjectConfig();
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const err = error as Error;
    throw new Error(`Invalid ${configPath}: failed to parse JSON (${err.message})`);
  }

  if (!isPlainObject(parsed)) {
    throw new Error(`Invalid ${configPath}: top-level value must be an object`);
  }

  const indexingValue = parsed.indexing;
  if (indexingValue === undefined) {
    return getDefaultProjectConfig();
  }

  if (!isPlainObject(indexingValue)) {
    throw new Error(`Invalid ${configPath}: indexing must be an object`);
  }

  return {
    indexing: {
      includePatterns: validatePatterns(
        indexingValue.includePatterns,
        'includePatterns',
        configPath,
      ),
      ignorePatterns:
        validatePatterns(indexingValue.ignorePatterns, 'ignorePatterns', configPath) ?? [],
    },
  };
}
