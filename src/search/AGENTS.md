# src/search/ — 混合搜索子系统

## OVERVIEW

ContextWeaver 检索管道的核心：向量召回 + FTS5 词法召回 → RRF 融合 → Rerank → Smart TopK → 三阶段图扩展 → Token 感知上下文打包。

## STRUCTURE

```
├── SearchService.ts     搜索编排：6 阶段流水线的入口
├── config.ts            SearchConfig — 全流程参数（召回数/权重/Rerank/扩展深度/Token预算）
├── types.ts             ScoredChunk, Segment, ContextPack, SearchConfig 等核心类型
├── fts.ts               FTS5 全文检索：混合分词（英文+中文 Intl.Segmenter）、segmentQuery()
├── GraphExpander.ts     三阶段图扩展：E1 邻居 → E2 breadcrumb → E3 import 追踪
├── ContextPacker.ts     Token 感知打包：合并重叠区间 + 预算裁剪
└── resolvers/           多语言 import 解析器（策略模式）
    ├── types.ts         ImportResolver 接口：supports/extract/resolve
    ├── index.ts         createResolvers() 工厂
    ├── JsTsResolver.ts  JS/TS import/require 解析
    ├── PythonResolver.ts Python import 解析
    ├── GoResolver.ts    Go import 解析
    ├── JavaResolver.ts  Java import 解析
    ├── RustResolver.ts  Rust use/mod 解析
    ├── CppResolver.ts   C++ #include 解析
    └── CSharpResolver.ts C# using 解析
```

## COMPONENTS

| 组件          | 关键函数/类                     | 职责                                                               |
| ------------- | ------------------------------- | ------------------------------------------------------------------ |
| SearchService | `search(query, options)`        | 6 阶段编排：向量召回→FTS召回→RRF融合→Rerank→扩展→打包              |
| FTS           | `searchFts()`, `segmentQuery()` | FTS5 查询 + 混合分词策略（trigram 不可用降级 unicode61）           |
| GraphExpander | `expand(chunks)`                | E1 同文件邻居补全 → E2 目录结构面包屑 → E3 import 跨文件追踪       |
| ContextPacker | `pack(chunks, budget)`          | 合并重叠区间 → Token 预算裁剪 → 输出 ContextPack                   |
| Resolvers     | `ImportResolver` 接口           | 每种语言独立实现 extract + resolve，`createResolvers()` 按语言分发 |

## WHERE TO LOOK

| 需求                   | 位置                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| 修改搜索流程/参数      | `SearchService.ts`（编排）+ `config.ts`（默认参数）                                               |
| 修改 RRF 融合权重      | `SearchService.ts` 中的 RRF 阶段（wVec=0.6, wLex=0.4）                                            |
| 修改图扩展策略         | `GraphExpander.ts` — E1/E2/E3 三个阶段各自独立                                                    |
| 修改上下文打包逻辑     | `ContextPacker.ts` — 区间合并 + Token 预算                                                        |
| 修改分词策略           | `fts.ts` — `segmentQuery()`                                                                       |
| 添加新语言 import 解析 | `resolvers/` 下新建 `<Lang>Resolver.ts`，实现 `ImportResolver` 接口，在 `resolvers/index.ts` 注册 |
| 修改搜索类型定义       | `types.ts` — ScoredChunk, Segment, ContextPack                                                    |

## CONVENTIONS

- SearchService 接受 `Partial<SearchConfig>` 覆盖默认配置，`promptContext` 模块利用此机制传递不同参数
- GraphExpander 使用 `getGraphExpander(projectId)` 惰性单例，实例池用 Map 管理
- ImportResolver 策略模式：`supports()` 判断语言 → `extract()` 提取 import → `resolve()` 解析为文件路径
- 降级链：FTS chunks 表不可用时降级到 files 表 + token overlap 下钻
