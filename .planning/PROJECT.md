# ContextWeaver

## What This Is

ContextWeaver 是一个面向 AI Agent 的代码语义检索上下文引擎，由本地 CLI 和可分发 Skill 资产组成。它为本地代码库提供索引、混合搜索、上下文扩展和 prompt 证据准备能力，当前工作重点是在保留既有能力的前提下修复索引链路中的稳定性问题。

## Core Value

Agent 能稳定、可信地从本地代码库中获得可用的检索结果与上下文证据，而不是在索引或搜索主链路中遇到误导性成功状态或难以诊断的失败。

## Requirements

### Validated

- ✓ 用户可以通过 `contextweaver init` 初始化本地环境配置并生成 `~/.contextweaver/.env` 模板 — existing
- ✓ 用户可以通过 `contextweaver init-project` 和 `cwconfig.json` 定义项目索引范围 — existing
- ✓ 用户可以通过 `contextweaver index` 对本地仓库执行扫描、分块、Embedding 和索引写入 — existing
- ✓ `index` 在 Embedding API 返回上游错误时立即停止后续向量化工作，不继续处理剩余批次 — Phase 1
- ✓ `index` 失败时不再打印“索引完成”或误导性的成功统计，CLI 退出状态与索引真实结果保持一致 — Phase 1
- ✓ 用户可以通过 `contextweaver search` 执行混合搜索并获得文本或 JSON 结果 — existing
- ✓ 用户可以通过 `contextweaver prompt-context` 生成面向 prompt enhancement 的仓库证据包 — existing
- ✓ 用户可以通过 `contextweaver install-skills` 安装内置 Skill 资产供 agent 使用 — existing

### Active

- [ ] `index` 在 Embedding 失败后保持 SQLite、LanceDB 与索引状态的一致性，不留下假成功或半完成状态
- [ ] CLI 对上游 Embedding API 错误输出足够详细的诊断信息，尤其要帮助定位 batch size 与 provider 限制类问题
- [ ] 索引链路具备更清晰的失败恢复语义，便于后续处理部分失败、重试或安全回滚能力

### Out of Scope

- 新的搜索能力或新的 CLI 子命令 — 这轮目标是修复现有 `index` 主链路，而不是扩展产品面
- `search` 与 `prompt-context` 的功能性重构 — 本轮仅在必要时保证它们面对失败索引时行为不误导
- 新的远程服务形态或托管后端 — 当前产品仍以本地 CLI + 本地索引存储为主

## Context

- 当前代码库已经实现了完整的 brownfield 能力面：CLI 入口位于 `src/index.ts`，索引主链路从 `src/cli.ts` 进入 `src/scanner/index.ts`，再进入 `src/indexer/index.ts` 和 `src/api/embedding.ts`
- 检索链路已经包含向量召回、FTS 召回、RRF 融合、精排、图扩展和打包，核心模块位于 `src/search/SearchService.ts`、`src/search/GraphExpander.ts`、`src/search/ContextPacker.ts`
- 索引持久化分散在 SQLite 与 LanceDB：元数据和全文索引位于 `src/db/index.ts`、`src/search/fts.ts`，向量索引位于 `src/vectorStore/index.ts`
- 当前已知问题集中在 `index` 命令的异常路径：日志显示 Embedding API 出现 `HTTP 400` 后，CLI 仍打印“向量索引完成”“索引完成”，并继续输出 Embedding 进度，最后在高进度阶段异常退出且未写入 LanceDB
- 社区反馈表明不同上游 Embedding API 对 batch size 的限制不同，当前错误显示过于粗糙，缺少足够的 provider 响应细节和操作建议，导致定位和修复成本高
- `.planning/codebase/CONCERNS.md` 已指出当前代码库在 API 传输、索引一致性和测试覆盖上存在薄弱点，尤其是 `src/api/embedding.ts`、`src/indexer/index.ts`、`src/scanner/index.ts`

## Constraints

- **Product shape**: 保持本地 CLI + Skill 的产品形态不变 — 当前 README、发布流程和用户心智都围绕这一模式建立
- **Tech stack**: 继续使用 Node.js + TypeScript + SQLite + LanceDB + 外部 Embedding/Rerank API — 这是现有实现与发布资产的基础
- **Brownfield compatibility**: 修复必须尽量复用现有命令接口与工作流 — 避免为了修 bug 打断已有用户脚本和文档
- **Failure semantics**: 上游 Embedding API 出错时以立即失败并退出为准 — 这是当前明确确认的目标行为
- **Diagnostics**: 错误输出必须比现在更可诊断，但不能泄露敏感凭据 — 社区需要定位线索，同时日志仍需安全可分享

## Key Decisions

| Decision                                         | Rationale                                                                    | Outcome   |
| ------------------------------------------------ | ---------------------------------------------------------------------------- | --------- |
| 本轮只聚焦 `index` 主链路                        | 当前最严重的问题出现在索引稳定性和状态一致性上，先修主路径最能恢复产品可信度 | Kept      |
| Embedding API 错误默认立即失败并退出             | 当前“继续跑 + 打印成功”会制造假成功状态，优先保证结果真实性                  | Done      |
| 错误显示要补足上游响应与 batch size 诊断信息     | 社区已有频繁 issue，当前错误信息不足以支持自助排障                           | — Pending |
| 将恢复能力作为设计方向纳入，但不改变本轮失败策略 | 先统一失败语义，再为后续重试/跳过/回滚能力铺路                               | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):

1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):

1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

_Last updated: 2026-04-01 after Phase 1 execution_
