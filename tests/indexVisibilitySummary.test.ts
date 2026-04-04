import { describe, expect, it, vi } from 'vitest';
import { EmbeddingFatalError } from '../src/api/embedding/index.js';
import { runIndexCliCommand } from '../src/index.js';
import { ScanStageError } from '../src/scanner/index.js';

describe('index visibility summary', () => {
  it('renders success summary with skip buckets and no default skipped path list', async () => {
    const info = vi.fn();
    const error = vi.fn();

    await runIndexCliCommand({
      rootPath: '/repo',
      yes: true,
      isInteractive: false,
      runIndexCommandFn: vi.fn().mockResolvedValue({
        totalFiles: 8,
        added: 2,
        modified: 1,
        unchanged: 3,
        deleted: 0,
        skipped: 5,
        errors: 0,
        skippedByReason: {
          large_file: 1,
          binary_file: 1,
          ignored_json: 1,
          no_indexable_chunks: 1,
          processing_error: 1,
        },
        visibility: {
          candidateFiles: 8,
          processedFiles: 8,
          embeddingFiles: 3,
          selfHealFiles: 0,
          deletedPaths: 0,
        },
      }),
      logger: { info, error },
      exit: vi.fn(),
    });

    expect(info).toHaveBeenCalledWith(expect.stringMatching(/^索引完成：/));
    expect(info).toHaveBeenCalledWith(expect.stringContaining('总数:8 新增:2 修改:1'));
    expect(info).toHaveBeenCalledWith(
      '跳过原因: 大文件 1, 二进制文件 1, 忽略的 JSON 1, 无可索引 chunk 1, 处理失败 1',
    );

    const output = info.mock.calls.map(([line]) => line).join('\n');
    expect(output).not.toContain('索引完成 (');
    expect(output).not.toContain('/repo/src/');
    expect(error).not.toHaveBeenCalled();
  });

  it('renders failure summary with stage and partial stats before diagnostics', async () => {
    const info = vi.fn();
    const error = vi.fn();
    const exit = vi.fn();
    const failure = new ScanStageError('process', '在 process 阶段终止', {
      totalFiles: 6,
      added: 1,
      modified: 1,
      unchanged: 2,
      deleted: 0,
      skipped: 2,
      errors: 1,
      skippedByReason: {
        large_file: 1,
        processing_error: 1,
      },
      visibility: {
        candidateFiles: 6,
        processedFiles: 4,
        embeddingFiles: 0,
        selfHealFiles: 0,
        deletedPaths: 0,
      },
    });

    await runIndexCliCommand({
      rootPath: '/repo',
      yes: true,
      isInteractive: false,
      runIndexCommandFn: vi.fn().mockRejectedValue(failure),
      logger: { info, error },
      exit,
    });

    expect(error).toHaveBeenNthCalledWith(1, '索引失败：在 process 阶段终止');
    expect(error).toHaveBeenNthCalledWith(2, '失败阶段: process');
    expect(error).toHaveBeenNthCalledWith(
      3,
      '已知统计: 总数:6 新增:1 修改:1 未变:2 删除:0 跳过:2 错误:1',
    );
    expect(error).toHaveBeenNthCalledWith(4, '跳过原因: 大文件 1, 处理失败 1');

    const output = error.mock.calls.map(([line]) => line).join('\n');
    expect(output).not.toContain('索引完成');
    expect(output).not.toContain('总数:6 新增:1 修改:1 未变:2 删除:0 跳过:2 错误:1\n阶段:');
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('renders explicit edge-case conclusions for no changes, sync-only, and pre-embed failure', async () => {
    const infoNoChanges = vi.fn();
    const errorNoChanges = vi.fn();

    await runIndexCliCommand({
      rootPath: '/repo',
      yes: true,
      isInteractive: false,
      runIndexCommandFn: vi.fn().mockResolvedValue({
        totalFiles: 3,
        added: 0,
        modified: 0,
        unchanged: 3,
        deleted: 0,
        skipped: 0,
        errors: 0,
        skippedByReason: {},
        visibility: {
          candidateFiles: 3,
          processedFiles: 3,
          embeddingFiles: 0,
          selfHealFiles: 0,
          deletedPaths: 0,
        },
      }),
      logger: { info: infoNoChanges, error: errorNoChanges },
      exit: vi.fn(),
    });

    expect(infoNoChanges).toHaveBeenCalledWith('索引完成：没有检测到新的可索引变更');

    const infoSyncOnly = vi.fn();
    const errorSyncOnly = vi.fn();
    await runIndexCliCommand({
      rootPath: '/repo',
      yes: true,
      isInteractive: false,
      runIndexCommandFn: vi.fn().mockResolvedValue({
        totalFiles: 4,
        added: 0,
        modified: 0,
        unchanged: 4,
        deleted: 1,
        skipped: 0,
        errors: 0,
        skippedByReason: {},
        visibility: {
          candidateFiles: 4,
          processedFiles: 4,
          embeddingFiles: 0,
          selfHealFiles: 1,
          deletedPaths: 1,
        },
        vectorIndex: {
          indexed: 0,
          deleted: 1,
          errors: 0,
        },
      }),
      logger: { info: infoSyncOnly, error: errorSyncOnly },
      exit: vi.fn(),
    });

    expect(infoSyncOnly).toHaveBeenCalledWith('索引完成：已同步删除或自愈，无新增向量嵌入');

    const infoFailure = vi.fn();
    const errorFailure = vi.fn();
    const exitFailure = vi.fn();
    const fatal = new EmbeddingFatalError('provider exploded', {
      diagnostics: {
        stage: 'embed',
        category: 'unknown',
        httpStatus: 500,
        providerType: 'server_error',
        providerCode: 'boom',
        upstreamMessage: 'provider exploded',
        endpointHost: 'api.example.com',
        endpointPath: '/v1/embeddings',
        model: 'test-model',
        batchSize: 2,
        dimensions: 1024,
        requestCount: 2,
      },
    });
    const stagedFatal = new ScanStageError('process', '在 process 阶段终止', undefined, {
      cause: fatal,
    });

    await runIndexCliCommand({
      rootPath: '/repo',
      yes: true,
      isInteractive: false,
      runIndexCommandFn: vi.fn().mockRejectedValue(stagedFatal),
      logger: { info: infoFailure, error: errorFailure },
      exit: exitFailure,
    });

    expect(errorFailure).toHaveBeenCalledWith('索引失败：在 process 阶段终止');
    expect(exitFailure).toHaveBeenCalledWith(1);
  });
});
