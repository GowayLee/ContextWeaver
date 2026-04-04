# src/ — 源代码

## OVERVIEW

ContextWeaver 全部业务逻辑，管道式分层架构：CLI 层 → 服务层 → 领域层 → 基础设施层。

## STRUCTURE

```
├── index.ts            CLI 入口：cac 定义命令，调用 cli.ts 实现
├── cli.ts              命令编排：交互确认、锁管理、项目配置读取
├── config.ts           全局配置：.env 加载、Embedding/Reranker API 配置
├── projectConfig.ts    项目级 cwconfig.json 的读取与验证（zod）
├── indexRegistry.ts    ~/.contextweaver/indexes.json 读写
├── api/                外部 API 适配
│   ├── embedding.ts    EmbeddingClient — 速率限制、自适应并发、错误分类
│   └── reranker.ts     RerankerClient
├── chunking/           Tree-sitter 语义分片
│   ├── index.ts        Barrel: SemanticSplitter, getParser, isLanguageSupported
│   ├── types.ts        ProcessedChunk (displayCode + vectorText), ChunkMetadata
│   ├── LanguageSpec.ts 配置驱动的语言 AST 节点定义（新增语言只需加配置）
│   ├── ParserPool.ts   按语言 ID 懒加载 Tree-sitter 解析器
│   ├── SemanticSplitter.ts AST 遍历 → 语义分片，失败降级到行分片
│   └── SourceAdapter.ts 源码适配
├── db/                 SQLite 持久层
│   └── index.ts        文件元数据 CRUD、FTS5 索引管理、projectId 生成
├── indexer/            索引编排
│   └── index.ts        Indexer 类：分片 → embedding → 写入 LanceDB + SQLite
├── promptContext/      Prompt 增强上下文构建
│   ├── index.ts        buildPromptContext() — 检索 + 渲染
│   ├── detect.ts       意图/关键词检测
│   └── technicalTerms.ts 技术术语提取
├── retrieval/          检索入口
│   └── index.ts        retrieveCodeContext() — ensureIndex → 搜索 → 渲染
├── scanner/            文件扫描管道
│   ├── index.ts        scan() 编排：crawl → filter → process → persist
│   ├── crawler.ts      fdir 文件发现
│   ├── filter.ts       gitignore + 排除模式过滤
│   ├── hash.ts         文件 SHA-256 哈希（变更检测）
│   ├── language.ts     语言识别（扩展名 → 语言 ID）
│   └── processor.ts    批量文件处理：编码检测 → AST 分片 → 结果收集
├── search/             混合搜索子系统（详见 search/AGENTS.md）
├── utils/              通用工具
│   ├── encoding.ts     chardet + iconv-lite 编码检测和转换
│   ├── lock.ts         跨进程文件锁（超时机制防死锁）
│   └── logger.ts       pino 日志实例
└── vectorStore/        LanceDB 向量存储
    └── index.ts        VectorStore 类 + 实例池 Map
```

## COMPONENTS

| 组件            | 类/函数                            | 职责                                     |
| --------------- | ---------------------------------- | ---------------------------------------- |
| CLI 层          | `runCli()`, `runIndexCliCommand()` | 命令分发和参数处理                       |
| Scanner         | `scan()`, `ScanStageError`         | 文件发现→过滤→处理→持久化的完整管道      |
| Indexer         | `Indexer` 类                       | 分片到向量写入的编排                     |
| Retrieval       | `retrieveCodeContext()`            | 确保索引就绪后执行搜索并渲染结果         |
| PromptContext   | `buildPromptContext()`             | 意图检测→术语提取→检索→渲染增强上下文    |
| EmbeddingClient | `EmbeddingClient` 类               | API 调用 + 速率限制 + 会话级致命错误广播 |
| VectorStore     | `VectorStore` 类                   | LanceDB chunk 表 CRUD                    |
| DB              | `initDb()`, `batchUpsert()`        | SQLite 全部操作                          |

## WHERE TO LOOK

| 需求                | 起点                                                                    |
| ------------------- | ----------------------------------------------------------------------- |
| 理解完整索引流程    | `scanner/index.ts:scan()` → `indexer/index.ts:Indexer`                  |
| 理解检索流程        | `retrieval/index.ts:retrieveCodeContext()` → `search/SearchService.ts`  |
| 理解 Prompt Context | `promptContext/index.ts:buildPromptContext()`                           |
| 修改扫描行为        | `scanner/processor.ts` (文件处理) 或 `scanner/filter.ts` (过滤规则)     |
| 修改分片策略        | `chunking/SemanticSplitter.ts` 或 `chunking/LanguageSpec.ts` (语言配置) |
| 修改数据库操作      | `db/index.ts`                                                           |
| 添加新语言支持      | `chunking/LanguageSpec.ts` + `search/resolvers/<Lang>Resolver.ts`       |
| 修改 Embedding 行为 | `api/embedding.ts`                                                      |

## CONVENTIONS

- 每个子目录的 `index.ts` 是 barrel 文件，导出公共 API
- 工厂函数模式：`getXxx()` 返回惰性单例，实例池用 `Map<string, Xxx>` 管理
- 测试注入：关键函数接受可选的函数参数（`scanFn?`, `retrieve?`），测试时替换
- 错误包装：扫描阶段错误用 `ScanStageError` 标记阶段，嵌入错误用 `EmbeddingFatalError` 携带诊断信息
