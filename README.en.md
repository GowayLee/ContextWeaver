# ContextWeaver

<p align="center">
  <strong>🧵 A Context Weaving Engine for AI Agents</strong>
</p>

<p align="center">
  <em>Context Engine for AI Agents — Hybrid Search • Graph Expansion • Token-Aware Packing • Prompt Context Preparation</em>
</p>

<p align="center">
  English | <a href="./README.md">中文</a>
</p>

---

**ContextWeaver** is a context engine for AI coding agents, built around **CLI + Skills**: the CLI provides deterministic local commands for retrieval and prompt-context preparation, while Skills teach the running agent how to consume repository evidence, when to ask one high-value question, and how to turn a vague repo change request into an executable task prompt.

## ✨ Highlights

- **Hybrid retrieval**: vector recall + lexical recall + RRF fusion + rerank
- **Three-phase context expansion**: neighbors, breadcrumbs, imports
- **Confirmed indexing**: the first index run must show scope and get explicit approval
- **Skill assets**: ships distributable `using-contextweaver` and `enhancing-prompts` skill assets
- **Prompt context preparation**: converts vague requests into repository-grounded evidence for the agent

## 📦 Install

```bash
pnpm build
npm pack
npm install -g ./haurynlee-contextweaver-*.tgz
```

## ⚙️ Initialize

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

## 🗂️ Project Indexing Config

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

## 🚀 Common Commands

```bash
# Build or refresh the index
contextweaver index

# Semantic search for humans
contextweaver search --information-request "How is prompt enhancement implemented?"

# Semantic search for scripts / skills
contextweaver search --format json --information-request "How is prompt enhancement implemented?"

# Prepare repo-aware evidence for prompt enhancement (human-readable text by default)
contextweaver prompt-context "Align prompt enhancement with Skills"

# Prepare structured evidence for scripts / skills
contextweaver prompt-context --format json "Align prompt enhancement with Skills"

# Install bundled skills into the current directory
contextweaver install-skills

# Install bundled skills into a custom directory
contextweaver install-skills --dir ./agent-skills

# Preview stale indexes
contextweaver clean --dry-run
```

CLI defaults are for humans: both `search` and `prompt-context` default to `text`. Scripts and skills should use `--format json`, or call the bundled helper scripts directly.

Both `search` and `prompt-context` require the repository to have completed at least one confirmed `contextweaver index` run.

## 🧠 Skill Assets

The repository ships distributable skills under `skills/`:

- `skills/using-contextweaver/`
  - semantic retrieval and code location workflow
  - helper script: `scripts/search-context.mjs`
  - defaults to JSON; use `--format text` for debugging
- `skills/enhancing-prompts/`
  - vague request -> repo-aware task interpretation -> optional single Question -> final task prompt
  - helper script: `scripts/prepare-enhancement-context.mjs`
  - Chinese templates under `templates/`
  - defaults to JSON; use `--format text` for debugging

When installed from npm, bundled skills ship with the package. Use `contextweaver install-skills` to copy them into the current directory, or pass `--dir` to target any agent-specific location.

## 🏗️ Architecture

```text
Indexing: Crawler → Processor → SemanticSplitter → Indexer → VectorStore / SQLite
Search: Query → Vector + FTS Recall → RRF Fusion → Rerank → GraphExpander → ContextPacker
Skill asset flow: CLI structured JSON output → Skill script → Agent interpretation / Question / task normalization
```

Key modules:

| Module          | Location                      | Responsibility                                            |
| --------------- | ----------------------------- | --------------------------------------------------------- |
| `SearchService` | `src/search/SearchService.ts` | hybrid retrieval core                                     |
| `GraphExpander` | `src/search/GraphExpander.ts` | three-phase context expansion                             |
| `ContextPacker` | `src/search/ContextPacker.ts` | segment packing and token budgeting                       |
| `retrieval`     | `src/retrieval/index.ts`      | structured search output and CLI rendering                |
| `promptContext` | `src/promptContext/index.ts`  | prompt evidence preparation and technical-term extraction |

## 📁 Layout

```text
src/
  search/
  scanner/
  retrieval/
  promptContext/
skills/
  using-contextweaver/
  enhancing-prompts/
```

## 📄 License

MIT
