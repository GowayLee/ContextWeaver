# Technology Stack

**Analysis Date:** 2026-03-31

## Languages

**Primary:**

- TypeScript 5.x - 应用源码集中在 `src/**/*.ts`，编译入口是 `src/index.ts`，TypeScript 版本声明在 `package.json`

**Secondary:**

- JavaScript (ESM runtime output) - 构建产物发布到 `dist/**/*.js`，CLI bin 指向 `dist/index.js`，定义在 `package.json`
- Markdown - 用户文档和 Skill 文档位于 `README.md`、`README.en.md`、`skills/**/SKILL.md`
- YAML - 发布流水线定义位于 `.github/workflows/release.yml`

## Runtime

**Environment:**

- Node.js >= 20 - 通过 `package.json` 的 `engines.node` 约束；运行模式是 ESM，见 `package.json` 的 `"type": "module"`

**Package Manager:**

- pnpm - 项目脚本和 CI 都使用 pnpm，见 `package.json` 与 `.github/workflows/release.yml`
- Lockfile: present (`pnpm-lock.yaml`)

## Frameworks

**Core:**

- Node.js CLI + `cac` - 命令行入口和子命令定义在 `src/index.ts`
- Tree-sitter (`@keqingmoe/tree-sitter` + 多语言 grammar 包) - AST 分块和多语言解析，核心实现在 `src/chunking/SemanticSplitter.ts`、`src/chunking/ParserPool.ts`
- LanceDB (`@lancedb/lancedb`) - 向量索引存储，适配层位于 `src/vectorStore/index.ts`
- SQLite FTS5 (`better-sqlite3`) - 元数据和全文检索存储，初始化位于 `src/db/index.ts`、`src/search/fts.ts`
- Zod - 输入/配置校验依赖，声明在 `package.json`

**Testing:**

- Vitest 4.x - 测试运行器，配置在 `vitest.config.ts`，测试文件位于 `tests/**/*.test.ts`

**Build/Dev:**

- tsup - ESM + d.ts 构建与 watch，脚本定义在 `package.json`
- TypeScript compiler - 语言和类型检查配置在 `tsconfig.json`
- Biome - 格式化和 lint，配置在 `biome.json`

## Key Dependencies

**Critical:**

- `@lancedb/lancedb` - 向量召回底座；`src/vectorStore/index.ts` 负责 `vectors.lance` 读写
- `better-sqlite3` - 元数据、FTS 和项目索引状态；`src/db/index.ts` 负责 `index.db`
- `@keqingmoe/tree-sitter` 及 `tree-sitter-*` - 语义切分和多语言支持；使用点在 `src/chunking/*.ts`
- `cac` - CLI 命令解析；使用点在 `src/index.ts`
- `dotenv` - 环境变量加载；使用点在 `src/config.ts`

**Infrastructure:**

- `pino` - 结构化日志，实现在 `src/utils/logger.ts`
- `fdir` - 文件扫描，使用点在 `src/scanner/crawler.ts`
- `ignore` - `.gitignore` / 项目忽略规则处理，使用点在 `src/scanner/filter.ts`
- `p-limit` - 索引处理并发控制，使用点在 `src/scanner/processor.ts`
- `chardet` + `iconv-lite` - 文件编码检测与转换，使用点在 `src/utils/encoding.ts`

## Configuration

**Environment:**

- 统一从 `src/config.ts` 加载环境变量；开发模式优先读取项目根目录的 `.env`，生产模式读取 `~/.contextweaver/.env`
- 运行搜索和索引前需要配置 `EMBEDDINGS_API_KEY`、`EMBEDDINGS_BASE_URL`、`EMBEDDINGS_MODEL`、`RERANK_API_KEY`、`RERANK_BASE_URL`、`RERANK_MODEL`，校验逻辑在 `src/config.ts`
- 项目级索引范围通过 `cwconfig.json` 控制，读取逻辑在 `src/projectConfig.ts`
- 仓库内未检测到 `.env*` 文件；运行时配置入口由 `src/index.ts` 和 `src/retrieval/index.ts` 在用户目录生成示例文件

**Build:**

- 构建配置由 `package.json` 脚本驱动：`build`、`build:release`、`dev`
- TypeScript 编译目标为 ES2022，模块解析为 Bundler，见 `tsconfig.json`
- 代码格式和 lint 规则使用 `biome.json`
- npm 发布流水线定义在 `.github/workflows/release.yml`

## Platform Requirements

**Development:**

- 需要 Node.js 20+、pnpm 10（CI 在 `.github/workflows/release.yml` 中显式安装 pnpm 10）
- 需要可用的 Embedding 与 Rerank HTTP API 凭据，入口由 `src/config.ts` 读取
- 本地运行会在用户目录 `~/.contextweaver/` 下创建 `.env`、日志和索引文件，相关代码在 `src/index.ts`、`src/utils/logger.ts`、`src/db/index.ts`、`src/vectorStore/index.ts`

**Production:**

- 交付形态是 npm 全局 CLI 包 `@haurynlee/contextweaver`，发布目标见 `package.json` 与 `.github/workflows/release.yml`
- 运行产物是本地命令行工具，不存在独立服务端部署清单；执行入口始终是 `dist/index.js`

---

_Stack analysis: 2026-03-31_
