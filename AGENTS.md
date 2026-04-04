# AGENTS.md — ContextWeaver

## OVERVIEW

面向 AI Coding Agent 的代码库上下文引擎。CLI 工具（`cw` / `contextweaver`），提供语义索引、混合检索（向量 + FTS5 + RRF + Rerank）、三阶段图扩展和 Prompt Context 准备。单包 TypeScript/ESM 项目，非 monorepo。

## STRUCTURE

```
├── src/                    源代码（详见 src/AGENTS.md）
│   ├── index.ts            CLI 入口，cac 定义所有命令
│   ├── cli.ts              命令实现层，交互确认 + 编排
│   ├── config.ts           全局配置（.env 加载），必须最先导入
│   ├── projectConfig.ts    项目级 cwconfig.json 管理
│   ├── indexRegistry.ts    已索引项目注册表 (indexes.json)
│   ├── api/                外部 API 客户端
│   │   ├── embedding.ts    EmbeddingClient — 速率限制 + 自适应并发
│   │   └── reranker.ts     RerankerClient
│   ├── chunking/           Tree-sitter 语义分片（详见 src/AGENTS.md）
│   ├── db/                 SQLite 元数据 + FTS5 全文索引
│   ├── indexer/            索引编排：分片 → embedding → 写入 LanceDB/SQLite
│   ├── promptContext/      Prompt 增强上下文（意图检测 + 术语提取 + 检索）
│   ├── retrieval/          检索入口：ensureIndex → search → render
│   ├── scanner/            文件发现 + 变更检测 + 处理（详见 src/AGENTS.md）
│   ├── search/             混合搜索子系统（详见 src/search/AGENTS.md）
│   ├── utils/              encoding检测、文件锁、pino日志
│   └── vectorStore/        LanceDB 向量存储适配层
├── tests/                  Vitest 测试，目录结构镜像 src/
├── skills/                 可分发的内置 Skill 资产
│   ├── using-contextweaver/    检索决策树 + search-context.mjs
│   └── enhancing-prompts/      Prompt 增强四步工作流 + 模板
├── openspec/               OpenSpec 变更管理工作流配置
├── .github/workflows/      release.yml — tag 触发 npm OIDC 发布
├── biome.json              Biome lint + format（2空格, 行宽100, 单引号）
├── vitest.config.ts        globals, tests/**/*.test.ts, 15s超时
├── cwconfig.json           本项目自身的索引配置
└── knip.json               死代码检测
```

## SUBAGENT HIERARCHY

```
./AGENTS.md          ← 你在这里
├── src/AGENTS.md    ← 源代码架构、管道流程、模块职责
└── src/search/AGENTS.md ← 搜索子系统：混合检索、图扩展、多语言解析器
```

在 `src/` 子树下工作时，先查阅对应的子 AGENTS.md 获取模块级细节。

## WHERE TO LOOK

| 意图               | 位置                                                                          |
| ------------------ | ----------------------------------------------------------------------------- |
| 添加新 CLI 命令    | `src/index.ts`（定义）→ `src/cli.ts`（实现）                                  |
| 修改索引流程       | `src/scanner/index.ts` → `src/indexer/index.ts`                               |
| 修改搜索算法       | `src/search/SearchService.ts`（核心）                                         |
| 添加新语言支持     | `src/chunking/LanguageSpec.ts`（分片）+ `src/search/resolvers/`（import解析） |
| 修改 API 调用      | `src/api/embedding.ts` 或 `src/api/reranker.ts`                               |
| 数据库 schema 变更 | `src/db/index.ts`                                                             |
| 向量存储变更       | `src/vectorStore/index.ts`                                                    |
| Skill 开发         | `skills/<skill-name>/SKILL.md`                                                |
| 配置/环境变量      | `src/config.ts`                                                               |

## CODE MAP

两条核心管道，共享基础设施层：

**索引管道：** `cli.ts` → `scanner/` (crawl→filter→process) → `chunking/` (Tree-sitter AST) → `indexer/` → `api/embedding.ts` → `vectorStore/` + `db/`

**检索管道：** `retrieval/` → `search/SearchService` (向量召回+FTS5→RRF融合→Rerank→SmartTopK→GraphExpander→ContextPacker)

**基础设施层：** `config.ts`, `db/`, `vectorStore/`, `api/`, `utils/`

## CONVENTIONS

- **全中文**：源码注释、CLI 输出、日志全部中文
- **ESM + .js 后缀导入**：`import { x } from './foo.js'`（即使源文件是 .ts）
- **`import type`**：`verbatimModuleSyntax` 强制纯类型导入必须用 `import type`
- **`node:` 前缀**：Node 内置模块用 `node:fs`, `node:path` 等
- **Barrel 导出**：每个子目录有 `index.ts` 作为公共接口
- **惰性单例工厂**：`getXxx()` 函数管理重量级实例（`getEmbeddingClient`, `getVectorStore(projectId)` 等）
- **函数参数注入**：测试通过可选函数参数注入依赖，不用 DI 框架
- **确认式索引**：首次索引需交互确认（`y/N`），非交互环境必须 `--yes`
- **项目 ID**：路径 SHA-256 前 10 位 hex，隔离不同项目的索引数据
- **`config.ts` 最先导入**：`src/index.ts` 第一个 import 是 `'./config.js'`

## ANTI-PATTERNS (THIS PROJECT)

- 不要使用路径别名（tsconfig 无 paths 配置）
- 不要创建 library 导出（package.json 无 exports 字段，这是纯 CLI 工具）
- 不要直接实例化 EmbeddingClient/RerankerClient，使用工厂函数
- 不要跳过 `config.ts` 的导入顺序（它负责 .env 加载）
- 不要在 `fmt` 命令中包含 tests/（`pnpm fmt` 仅作用于 `./src`）
- Skill 脚本中不要硬编码 `contextweaver` 路径，优先检查 `CONTEXTWEAVER_BIN` 环境变量

## UNIQUE STYLES

- **降级链**：AST 分片失败 → 行分片；FTS trigram 不可用 → unicode61；chunks_fts 不可用 → files_fts + token overlap
- **错误分类**：`classifyFailure()` 将嵌入错误分为 8 类（authentication/rate_limit/batch_too_large/...），不同类别触发不同处理策略
- **会话级致命错误广播**：嵌入批处理中首个致命错误通过 AbortController 终止所有并发
- **自愈索引**：文件 hash 不匹配时自动补索引，无需手动干预

## COMMANDS

```bash
pnpm build          # 开发构建（带 sourcemap）
pnpm build:release  # 发布构建（无 sourcemap）
pnpm dev            # 监视模式构建
pnpm fmt            # Biome 格式化 + lint 修复（仅 src/）
pnpm test           # Vitest 单次运行
pnpm test:watch     # Vitest 监视模式
```

## NOTES

- CI 用 Node 20，本地开发用 Node 24（`.node-version: v24.12.0`），`engines.node: >=20`
- `isMcpMode` 检测保留但已不暴露 MCP 命令，纯 CLI 模式
- `pnpm.onlyBuiltDependencies` 精确控制原生模块编译，避免无关依赖触发编译
- 持久化存储：SQLite (`~/.contextweaver/<projectId>/index.db`)、LanceDB (`vectors.lance`)、JSON 注册表 (`indexes.json`)
