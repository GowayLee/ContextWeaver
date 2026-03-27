# ContextWeaver

<p align="center">
  <strong>🧵 A Context Weaving Engine for AI Agents</strong>
</p>

<p align="center">
  <em>Context Engine for AI Agents — Hybrid Search • Token-Aware Packing • Prompt Context Preparation</em>
</p>

<p align="center">
  English | <a href="./README.md">中文</a>
</p>

---

**ContextWeaver** is a context engine for AI coding agents, built around **CLI + Skills**: the CLI provides deterministic local commands for retrieval and prompt-context preparation, while Skills teach the running agent how to consume repository evidence, when to ask one high-value question, and how to turn a vague repo change request into an executable task prompt.

<p align="center">
  <img src="assets/architecture.png" alt="ContextWeaver architecture overview" width="800" />
</p>

## Highlights

- **Hybrid retrieval**: vector recall + lexical recall + RRF fusion + rerank
- **Three-phase context expansion**: neighbors, breadcrumbs, imports
- **Explicit indexing scope**: the first index run must preview the scope and require explicit confirmation
- **Skills**: ships distributable `using-contextweaver` and `enhancing-prompts` skill assets
- **Prompt context preparation (Prompt Enhancement)**: converts vague requests into repository-grounded evidence so the agent can refine the task description on its own

## Install

```bash
pnpm build
npm pack
npm install -g ./haurynlee-contextweaver-*.tgz
```

## Initialize

```bash
contextweaver init
```

Edit `~/.contextweaver/.env` with embedding and reranker settings:

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

## Project Indexing Config

Use a repository-root `cwconfig.json` to scope indexing:

```bash
contextweaver init-project
```

Example:

```json
{
  "indexing": {
    "includePatterns": ["src/**"],
    "ignorePatterns": ["**/generated/**", "**/__snapshots__/**"]
  }
}
```

The indexer matches `includePatterns` first, then excludes any matched paths covered by `ignorePatterns`. Index scope directly affects semantic search quality, so it is worth tuning carefully for each repository.

## Common Commands

```bash
# Build or refresh the index
contextweaver index

# Semantic search (plain text by default)
contextweaver search [--format json] --information-request "How is prompt enhancement implemented?"

# Prepare repo-aware evidence for prompt enhancement (plain text by default)
contextweaver prompt-context [--format json] "Align prompt enhancement with Skills"

# Install bundled skills into the current directory
contextweaver install-skills

# Install bundled skills into a custom directory
contextweaver install-skills --dir ./agent-skills

# Clean stale indexes
contextweaver clean
```

> CLI output defaults to a human-friendly format: both `search` and `prompt-context` use `text` unless you explicitly pass `--format json` in skill scripts.
> `search` and `prompt-context` both require the repository to have completed at least one `contextweaver index` run.

## Skill Assets

The repository ships distributable skills under `skills/`:

- `skills/using-contextweaver/`
  - semantic retrieval and code location workflow
  - helper script: `scripts/search-context.mjs`
- `skills/enhancing-prompts/`
  - vague request -> repo-aware task interpretation -> optional single Question -> final task prompt
  - helper script: `scripts/prepare-enhancement-context.mjs`
  - prompt templates under `templates/`

When installed from npm, bundled skills ship with the package. Use `contextweaver install-skills` to copy them into the current directory, or pass `--dir` to target any agent-specific location.

## Architecture

```text
      Indexing: Crawler → Processor → SemanticSplitter → Indexer → VectorStore / SQLite
      Search: Query → Vector + FTS Recall → RRF Fusion → Rerank → GraphExpander → ContextPacker
Skill flow: CLI structured JSON output → Skill script → Agent interpretation / Question / task normalization
```

Key modules:

| Module          | Location                      | Responsibility                                            |
| --------------- | ----------------------------- | --------------------------------------------------------- |
| `SearchService` | `src/search/SearchService.ts` | hybrid retrieval core                                     |
| `GraphExpander` | `src/search/GraphExpander.ts` | three-phase context expansion                             |
| `ContextPacker` | `src/search/ContextPacker.ts` | segment packing and token budgeting                       |
| `retrieval`     | `src/retrieval/index.ts`      | structured search output and CLI rendering                |
| `promptContext` | `src/promptContext/index.ts`  | prompt evidence preparation and technical-term extraction |

## Multi-Language Support

ContextWeaver uses Tree-sitter to provide native AST parsing support for the following languages:

| Language   | AST Parsing | Import Resolution | File Extensions               |
| ---------- | ----------- | ----------------- | ----------------------------- |
| TypeScript | Yes         | Yes               | `.ts`, `.tsx`                 |
| JavaScript | Yes         | Yes               | `.js`, `.jsx`, `.mjs`         |
| Python     | Yes         | Yes               | `.py`                         |
| Go         | Yes         | Yes               | `.go`                         |
| Java       | Yes         | Yes               | `.java`                       |
| Rust       | Yes         | Yes               | `.rs`                         |
| C          | Yes         | Yes               | `.c`, `.h`                    |
| C++        | Yes         | Yes               | `.cpp`, `.hpp`, `.cc`, `.cxx` |
| C#         | Yes         | Yes               | `.cs`                         |

## Acknowledgements

- [hsingjui/ContextWeaver](https://github.com/hsingjui/ContextWeaver) - original project
- [lyy0709/ContextWeaver](https://github.com/lyy0709/ContextWeaver) - community fork that added Prompt Enhancement
- [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) - high-performance syntax parsing
- [LanceDB](https://lancedb.com/) - embedded vector database

## License

[MIT](https://github.com/GowayLee/ContextWeaver/blob/main/LICENSE)
