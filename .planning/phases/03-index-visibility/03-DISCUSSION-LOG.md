# Phase 3: Index Visibility - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-01
**Phase:** 03-index-visibility
**Areas discussed:** 阶段进度展示, 跳过原因统计, 最终摘要形态, 边界场景文案

---

## 阶段进度展示

| Option          | Description                                                                                               | Selected |
| --------------- | --------------------------------------------------------------------------------------------------------- | -------- |
| 阶段名+关键计数 | 按 `crawl -> process -> chunk/embed -> persist` 明确切阶段；当前阶段显示必要计数，比如 embed 显示批次进度 | ✓        |
| 百分比优先      | 保留统一百分比/进度条为主，阶段名只是附带信息                                                             |          |
| 更细颗粒日志    | 把每个子阶段、更多中间动作都打出来                                                                        |          |

**User's choice:** 阶段名+关键计数
**Notes:** 以主阶段语义为主，同时允许在 embedding 这类耗时阶段补充关键计数。

---

## 跳过原因统计

| Option            | Description                             | Selected |
| ----------------- | --------------------------------------- | -------- |
| 总数+原因分桶     | 最终摘要先给 skipped 总数，再按原因分桶 | ✓        |
| 只给 skipped 总数 | 终端保持很短，具体原因只放 debug 日志   |          |
| 列出具体文件      | 除了原因分桶，还直接列出被跳过文件路径  |          |

**User's choice:** 总数+原因分桶
**Notes:** 默认输出要可追溯，但不需要变成逐文件清单模式。

---

## 最终摘要形态

| Option           | Description                                                          | Selected |
| ---------------- | -------------------------------------------------------------------- | -------- |
| 成功/失败双模板  | 成功时输出完整统计摘要；失败时输出失败结论+失败阶段+到失败前已知统计 | ✓        |
| 统一一套摘要模板 | 无论成功失败都尽量复用同一套字段，只在结论上区分                     |          |
| 失败只给结论     | 成功有完整摘要，失败只保留一句失败和 diagnostics                     |          |

**User's choice:** 成功/失败双模板
**Notes:** 失败路径不能为了格式统一而混入成功模板语义。

---

## 边界场景文案

| Option                 | Description                                                   | Selected |
| ---------------------- | ------------------------------------------------------------- | -------- |
| 显式说明实际发生了什么 | 对无可索引变更、仅同步删除/自愈、embedding 前失败等给专门结论 | ✓        |
| 尽量复用主流程文案     | 边界场景尽量套主流程模板                                      |          |
| 只在 debug 细说        | 默认终端只保留通用结论，边界细节交给 debug 日志               |          |

**User's choice:** 显式说明实际发生了什么
**Notes:** 边界场景也要保持“说真话”，避免用户自己推断发生了什么。

---

## the agent's Discretion

- 最终阶段标签的精确命名与是否拆分 `chunk` / `embed`
- 原因分桶的命名与归并细节
- 成功/失败摘要的排版与字段顺序
- 边界场景提示语的具体措辞

## Deferred Ideas

None.
