import { fdir } from 'fdir';
import { isAllowedFile, isFiltered, isIncluded } from './filter.js';

export interface CrawlResult {
  filePaths: string[];
  relativePaths: string[];
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 使用 fdir 扫描文件系统
 */
export async function crawl(rootPath: string): Promise<CrawlResult> {
  const relativePaths: string[] = [];
  const api = new fdir()
    .withFullPaths()
    .withErrors()
    .filter((filePath: string) => {
      // 标准化路径分隔符为 /，确保跨平台兼容
      const normalizedFilePath = filePath.replace(/\\/g, '/');
      const normalizedRootPath = rootPath.replace(/\\/g, '/');
      const relativePath = normalizedFilePath.replace(
        new RegExp(`^${escapeRegExp(normalizedRootPath)}/?`),
        '',
      );
      const matched =
        isIncluded(relativePath) && !isFiltered(relativePath) && isAllowedFile(relativePath);
      if (matched) {
        relativePaths.push(relativePath);
      }
      return matched;
    });

  const filePaths = await api.crawl(rootPath).withPromise();
  return { filePaths, relativePaths };
}
