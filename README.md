# ContextWeaver

<p align="center">
  <strong>🧵 为 AI Agent 精心编织的代码库上下文引擎</strong>
</p>

<p align="center">
  <em>Context Engine for AI Agents — Hybrid Search • Token-Aware Packing • Prompt Context Preparation</em>
</p>

<p align="center">
  <a href="./README.en.md">English</a> | 中文
</p>

---

**ContextWeaver** 是一个专为 AI 代码助手设计的上下文引擎，由 **CLI + Skill** 组成：CLI 提供稳定的本地检索与证据准备命令，Skill 指导运行中的 agent 如何消费这些结果、如何在必要时向用户提问、以及如何把模糊请求收敛成可执行任务。

<p align="center">
  <img src="assets/architecture.png" alt="ContextWeaver 架构概览" width="800" />
</p>

## 核心特性

- **混合检索引擎**：向量召回 + 词法召回 + RRF 融合 + 精排
- **三阶段上下文扩展**：邻居扩展、Breadcrumb 补全、Import 追踪
- **明确的索引范围**：首次索引必须先预览范围并显式确认
- **Skill**：内置可分发的 `using-contextweaver` 与 `enhancing-prompts` 技能资产
- **Prompt Context 准备 (Prompt Enhancement)**：把模糊请求转换为基于仓库事实的证据包，供 agent 自行增强任务说明

## 安装

```bash
pnpm build
npm pack
npm install -g ./haurynlee-contextweaver-*.tgz
```

## 初始化

```bash
contextweaver init
```

编辑 `~/.contextweaver/.env`，填入 Embedding 与 Reranker 配置：

```bash
EMBEDDINGS_API_KEY=your-api-key-here
EMBEDDINGS_BASE_URL=https://api.siliconflow.cn/v1/embeddings
EMBEDDINGS_MODEL=BAAI/bge-m3
EMBEDDINGS_MAX_CONCURRENCY=10
EMBEDDINGS_DIMENSIONS=1024

RERANK_API_KEY=your-api-key-here
RERANK_BASE_URL=https://api.siliconflow.cn/v1/rerank
RERANK_MODEL=BAAI/bge-reranker-v2-m3
RERANK_TOP_N=20
```

## 项目索引配置

仓库根目录通过 `cwconfig.json` 控制索引范围：

```bash
contextweaver init-project
```

示例：

```json
{
  "indexing": {
    "includePatterns": ["src/**"],
    "ignorePatterns": ["**/generated/**", "**/__snapshots__/**"]
  }
}
```

索引器将先匹配`includePatterns`, 然后从匹配项中排除`ignorePatterns`. 索引范围决定了后续语义搜索的精度, 请为每个项目仔细配置索引范围.

## 常用命令

```bash
# 建立或更新索引
contextweaver index

# 语义检索（默认文本输出）
contextweaver search [--format json] --information-request "提示词增强相关逻辑是怎么实现的？"

# 为模糊请求准备 repo-aware 证据（默认文本输出）
contextweaver prompt-context [--format json] "把 prompt enhance 对齐到 Skills"

# 安装内置 Skill 到当前目录
contextweaver install-skills

# 安装内置 Skill 到指定目录
contextweaver install-skills --dir ./agent-skills

# 清理失效索引
contextweaver clean
```

> CLI 默认输出优先给人看：`search` 与 `prompt-context` 默认都是 `text`；在 Skill 脚本中显式用 `--format json`.
> `search` 与 `prompt-context` 都要求当前仓库已经成功完成过一次索引 `contextweaver index`。

## Skill 资产

仓库提供可分发的 Skill 目录：`skills/`

- `skills/using-contextweaver/`
  - 面向语义检索与代码定位
  - 配套脚本 `scripts/search-context.mjs`
- `skills/enhancing-prompts/`
  - 面向“模糊代码库请求 -> repo-aware 推荐任务解释 -> 必要时一次 Question -> 最终任务 prompt”
  - 配套脚本 `scripts/prepare-enhancement-context.mjs`
  - Prompt 模板位于 `templates/`

通过 npm 全局安装后，内置 Skill 会随包一起分发；可用 `contextweaver install-skills` 直接复制到当前目录，也可以用 `--dir` 指定任意安装目录，方便接入不同 agent 环境。

## 架构

```text
      索引: Crawler → Processor → SemanticSplitter → Indexer → VectorStore / SQLite
      搜索: Query → Vector + FTS Recall → RRF Fusion → Rerank → GraphExpander → ContextPacker
Skill 链路: CLI 结构化 JSON 输出 → Skill 脚本 → Agent 解释/提问/任务收敛
```

关键模块：

| 模块            | 位置                          | 作用                        |
| --------------- | ----------------------------- | --------------------------- |
| `SearchService` | `src/search/SearchService.ts` | 混合搜索核心                |
| `GraphExpander` | `src/search/GraphExpander.ts` | 三阶段上下文扩展            |
| `ContextPacker` | `src/search/ContextPacker.ts` | 段落合并与预算控制          |
| `retrieval`     | `src/retrieval/index.ts`      | 结构化检索输出与 CLI 渲染   |
| `promptContext` | `src/promptContext/index.ts`  | Prompt 证据准备与技术词提取 |

## 多语言支持

ContextWeaver 通过 Tree-sitter 原生支持以下编程语言的 AST 解析：

| 语言       | AST 解析 | Import 解析 | 文件扩展名                    |
| ---------- | -------- | ----------- | ----------------------------- |
| TypeScript | ✅       | ✅          | `.ts`, `.tsx`                 |
| JavaScript | ✅       | ✅          | `.js`, `.jsx`, `.mjs`         |
| Python     | ✅       | ✅          | `.py`                         |
| Go         | ✅       | ✅          | `.go`                         |
| Java       | ✅       | ✅          | `.java`                       |
| Rust       | ✅       | ✅          | `.rs`                         |
| C          | ✅       | ✅          | `.c`, `.h`                    |
| C++        | ✅       | ✅          | `.cpp`, `.hpp`, `.cc`, `.cxx` |
| C#         | ✅       | ✅          | `.cs`                         |

## 致谢

- [hsingjui/ContextWeaver](https://github.com/hsingjui/ContextWeaver) - 原项目
- [lyy0709/ContextWeaver](https://github.com/lyy0709/ContextWeaver) - 社区 Fork, 增加了 Prompt Enhancement 功能
- [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) - 高性能语法解析
- [LanceDB](https://lancedb.com/) - 嵌入式向量数据库

## License

[MIT](https://github.com/GowayLee/ContextWeaver/blob/main/LICENSE)
