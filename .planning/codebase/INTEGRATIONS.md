# External Integrations

**Analysis Date:** 2026-03-31

## APIs & External Services

**AI Retrieval APIs:**

- Embedding API - 用于把查询和代码块转成向量；客户端实现在 `src/api/embedding.ts`
  - SDK/Client: repository-local client built on global `fetch` in `src/api/embedding.ts`
  - Auth: `EMBEDDINGS_API_KEY`
  - Endpoint config: `EMBEDDINGS_BASE_URL`
  - Model config: `EMBEDDINGS_MODEL`
- Rerank API - 用于对召回结果精排；客户端实现在 `src/api/reranker.ts`
  - SDK/Client: repository-local client built on global `fetch` in `src/api/reranker.ts`
  - Auth: `RERANK_API_KEY`
  - Endpoint config: `RERANK_BASE_URL`
  - Model config: `RERANK_MODEL`

**Distribution:**

- npm Registry - CLI 包发布目标，发布步骤定义在 `.github/workflows/release.yml`
  - SDK/Client: `npm publish` in `.github/workflows/release.yml`
  - Auth: `NPM_TOKEN` GitHub Actions secret

## Data Storage

**Databases:**

- SQLite (embedded, local filesystem)
  - Connection: 无单独 env var；路径由 `src/db/index.ts` 固定为 `~/.contextweaver/<projectId>/index.db`
  - Client: `better-sqlite3` in `src/db/index.ts`
  - Usage: 文件元数据、项目级 metadata、FTS 索引，配套函数在 `src/search/fts.ts`
- LanceDB (embedded, local filesystem)
  - Connection: 无单独 env var；路径由 `src/vectorStore/index.ts` 固定为 `~/.contextweaver/<projectId>/vectors.lance`
  - Client: `@lancedb/lancedb` in `src/vectorStore/index.ts`
  - Usage: chunk 向量和相似度检索

**File Storage:**

- Local filesystem only
  - 用户配置写入 `~/.contextweaver/.env`，创建逻辑在 `src/index.ts`、`src/retrieval/index.ts`
  - 日志写入 `~/.contextweaver/logs/app.YYYY-MM-DD.log`，实现位于 `src/utils/logger.ts`
  - Skill 资产从包内 `skills/` 复制到目标目录，逻辑位于 `src/cli.ts`

**Caching:**

- None detected as standalone cache service
  - 仅有进程内缓存/复用，例如 `src/search/SearchService.ts` 的 token regex cache 与惰性初始化客户端

## Authentication & Identity

**Auth Provider:**

- Custom API-key based outbound authentication
  - Implementation: `src/api/embedding.ts` 和 `src/api/reranker.ts` 通过 `Authorization: Bearer ...` 调用外部 HTTP API

**Project Identity:**

- Local project identity hash
  - Implementation: `src/db/index.ts` 通过仓库路径 + birthtime 生成 `projectId`，用于隔离本地索引目录

## Monitoring & Observability

**Error Tracking:**

- None detected as external SaaS

**Logs:**

- `pino` local structured logging
  - Implementation: `src/utils/logger.ts`
  - Sink: console + `~/.contextweaver/logs/`
  - Retention: 7 days cleanup in `src/utils/logger.ts`

## CI/CD & Deployment

**Hosting:**

- npm package distribution, not a hosted web service
  - Package metadata in `package.json`
  - Release flow in `.github/workflows/release.yml`

**CI Pipeline:**

- GitHub Actions
  - Workflow: `.github/workflows/release.yml`
  - Trigger: git tag `v*` or manual dispatch
  - Steps: checkout → pnpm install → build → version check → `npm publish` → GitHub Release

## Environment Configuration

**Required env vars:**

- `EMBEDDINGS_API_KEY` - read in `src/config.ts`, consumed by `src/api/embedding.ts`
- `EMBEDDINGS_BASE_URL` - read in `src/config.ts`, consumed by `src/api/embedding.ts`
- `EMBEDDINGS_MODEL` - read in `src/config.ts`, consumed by `src/api/embedding.ts`
- `EMBEDDINGS_MAX_CONCURRENCY` - read in `src/config.ts`, shapes client throttling in `src/api/embedding.ts`
- `EMBEDDINGS_DIMENSIONS` - read in `src/config.ts`, propagated to `src/search/SearchService.ts` and `src/vectorStore/index.ts`
- `RERANK_API_KEY` - read in `src/config.ts`, consumed by `src/api/reranker.ts`
- `RERANK_BASE_URL` - read in `src/config.ts`, consumed by `src/api/reranker.ts`
- `RERANK_MODEL` - read in `src/config.ts`, consumed by `src/api/reranker.ts`
- `RERANK_TOP_N` - read in `src/config.ts`, used by `src/api/reranker.ts`

**Secrets location:**

- User-level secrets are expected in `~/.contextweaver/.env`; sample generation is implemented in `src/index.ts` and `src/retrieval/index.ts`
- CI publish secret is `NPM_TOKEN` in GitHub Actions, referenced by `.github/workflows/release.yml`
- Repo root `.env*` files are not detected in this repository snapshot

## Webhooks & Callbacks

**Incoming:**

- None detected

**Outgoing:**

- HTTP POST to embedding provider from `src/api/embedding.ts`
- HTTP POST to rerank provider from `src/api/reranker.ts`
- npm publish to registry from `.github/workflows/release.yml`
- GitHub Release creation via `softprops/action-gh-release` in `.github/workflows/release.yml`

---

_Integration audit: 2026-03-31_
