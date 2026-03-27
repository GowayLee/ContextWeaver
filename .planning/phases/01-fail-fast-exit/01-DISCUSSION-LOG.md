# Phase 1: Fail-fast Exit - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-01
**Phase:** 01-Fail-fast Exit
**Areas discussed:** 失败判定范围, 在途批次处理, 失败输出形态, 部分进度怎么说

---

## 失败判定范围

| Option                      | Description                                                                    | Selected |
| --------------------------- | ------------------------------------------------------------------------------ | -------- |
| 最终 embedding 失败即 fatal | 保留 429/网络重试；只要重试耗尽或拿到不可恢复失败，整次 `index` 立即失败退出   | ✓        |
| 只配置型错误 fatal          | 仅把明确的 provider/config 错误视为 fatal，其余失败不在 Phase 1 升级为整次失败 |          |
| 整个向量阶段都 fatal        | Embedding、LanceDB、FTS 任一步失败都让本次 `index` 失败                        |          |

**User's choice:** 最终 embedding 失败即 fatal
**Notes:** 不提前建立错误分类学；Phase 1 先把 fail-fast 边界锁在 embedding 在现有重试后仍失败这一层。

---

## 在途批次处理

| Option             | Description                                                            | Selected |
| ------------------ | ---------------------------------------------------------------------- | -------- |
| best-effort cancel | fatal 后未启动批次不再开始，已发请求尽量 abort，任何晚到结果都视为无效 | ✓        |
| 只停未启动批次     | 允许在途请求自己跑完，但它们的结果不再影响本次 `index` 成功路径        |          |
| 等当前轮收尾再失败 | 不主动停在途请求，等这一轮都结束后再统一失败                           |          |

**User's choice:** best-effort cancel
**Notes:** 对外语义要体现为立即停机；底层即使无法完全硬取消，也不能再继续推动成功路径。

---

## 失败输出形态

| Option              | Description                                  | Selected |
| ------------------- | -------------------------------------------- | -------- |
| 失败结论+阶段上下文 | 失败时说明卡在哪个阶段，但不输出成功统计     | ✓        |
| 只给失败结论        | 只保留简短失败 verdict，不补阶段说明         |          |
| 失败结论+部分统计   | 允许带少量处理中统计，但必须明确本次并未成功 |          |

**User's choice:** 失败结论+阶段上下文
**Notes:** 最终出口要是单一 failure verdict，不再出现上层报错、下层成功摘要并存的情况。

---

## 部分进度怎么说

| Option                       | Description                                          | Selected |
| ---------------------------- | ---------------------------------------------------- | -------- |
| 保留进度,失败只说阶段        | 运行中进度照常，但失败出口只说失败阶段，不带成功统计 | ✓        |
| 失败时不总结进度             | 最终只给失败结论，完全不回顾前面的进度               |          |
| 明确显示 interrupted/partial | 最终显式标记中断/部分完成语义                        |          |

**User's choice:** 保留进度,失败只说阶段
**Notes:** 不提前定义 partial 语义；运行中进度可以存在，但失败时不复述成功量化信息。

---

## the agent's Discretion

- 失败阶段名的具体措辞
- fatal 触发后如何收敛多余进度日志
- 内部 abort/fatal 状态结构命名

## Deferred Ideas

None.
