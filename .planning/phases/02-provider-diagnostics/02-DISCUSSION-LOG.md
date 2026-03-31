# Phase 2: Provider Diagnostics - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-01T01:16:44+08:00
**Phase:** 02-provider-diagnostics
**Areas discussed:** 诊断输出结构, 错误分类策略, 安全诊断摘要

---

## 诊断输出结构

| Option         | Description                                                                                                                              | Selected |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 双层输出       | 先给一句失败结论，再跟一个多行诊断块：stage/provider/category/http/upstream summary/safe request summary。CLI 直接可读，也便于后续测试。 | ✓        |
| 单行浓缩       | 把所有关键信息压进一行，适合简洁日志，但可读性和扩展性较差。                                                                             |          |
| 结构化日志为主 | 终端只显示简短失败语句，详细信息放 logger 字段里。实现省事，但普通 CLI 用户排障会更依赖日志。                                            |          |

**User's choice:** 双层输出
**Notes:** 用户希望默认 CLI 就足够可读，不把核心诊断信息藏到日志里。

---

## 错误分类策略

| Option            | Description                                                                                                               | Selected |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- | -------- |
| 标准分类+原始摘要 | CLI 固定归一化成认证、限流、批次过大、维度不匹配、超时、网络、响应格式不兼容、未知等类别，同时保留上游 message 作为摘要。 |          |
| 仅原样透传        | 不做统一分类，只展示 provider 原始 message/type/code。实现最简单，但不同 provider 可读性不一致。                          |          |
| 弱分类            | 只区分 HTTP/网络/解析 三大类，其余保留原始摘要。复杂度低，但无法满足更细的自助定位目标。                                  |          |

**First pass choice:** 仅原样透传
**Notes:** 这与 `DIAG-03` 冲突，所以进入一次补充澄清。

| Option     | Description                                                                                                           | Selected |
| ---------- | --------------------------------------------------------------------------------------------------------------------- | -------- |
| 轻映射     | 优先使用 provider 自带 type/code/status；只有能明确判断时，才映射成认证/限流/批次过大等标准类别，并同时展示原始摘要。 | ✓        |
| 强映射     | 无论 provider 怎么返回，都尽量归一到固定类别集合，CLI 明确打印 category。                                             |          |
| 弱分类兜底 | 默认透传原始信息；只有在少数明显场景才补一个 category，其他保持 unknown。                                             |          |

**User's choice:** 轻映射
**Notes:** 用户更看重保留 provider 原始语义，不希望引入过重的人造分类规则；但接受在可明确判断时补标准类别以满足 requirement。

---

## 安全诊断摘要

| Option           | Description                                                                                                                                        | Selected |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 核心字段默认展示 | 默认显示 stage、provider/host、model、batch size、dimensions、HTTP status、错误摘要；不显示原始请求体、不显示完整 URL path、不显示任何 key/token。 |          |
| 最小摘要         | 默认只显示 provider/host、HTTP status、错误摘要；其余放 debug。输出更短，但自助排障能力较弱。                                                      |          |
| 扩展摘要         | 在核心字段基础上，再显示并发数、请求条目数、endpoint path、响应 error.type/code 等安全字段。信息更全，但默认输出更重。                             | ✓        |

**First pass choice:** 扩展摘要
**Notes:** 用户更偏向工程排障优先的默认输出。

| Option              | Description                                                                                             | Selected |
| ------------------- | ------------------------------------------------------------------------------------------------------- | -------- |
| 默认全展示          | 双层诊断块里直接包含 endpoint path、error.type/code、请求条目数、并发等扩展安全字段。适合工程排障优先。 | ✓        |
| 核心默认+扩展进日志 | 终端默认只放核心字段；endpoint path、error.type/code、并发、条目数放结构化日志/debug 字段。             |          |
| 按类别挑字段        | 批次过大默认显示 batch size/条目数，auth 默认显示 host/model，其他扩展字段按类别有条件出现。            |          |

**User's choice:** 默认全展示
**Notes:** 只要不泄露 secrets，扩展安全字段可以默认出现在诊断块中。

---

## the agent's Discretion

- 标准类别枚举值、unknown 的最终命名和排版细节由后续 planner / executor 决定
- 多行诊断块的最终视觉格式和测试断言方式由实现阶段决定

## Deferred Ideas

None
