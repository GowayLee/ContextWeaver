# Phase 2: Provider Diagnostics - Research

**Date:** 2026-04-01
**Phase:** 02-provider-diagnostics
**Discovery level:** Level 0 — brownfield diagnostics enhancement on the existing embedding/indexing pipeline, no new dependency selection required

## Research Question

How should Phase 2 make `cw index` failures provider-diagnosable at the default CLI boundary, while preserving Phase 1 fail-fast semantics and never exposing secrets?

## Code Paths Reviewed

- `src/api/embedding.ts`
- `src/indexer/index.ts`
- `src/scanner/index.ts`
- `src/index.ts`
- `src/config.ts`
- `tests/api/embedding.test.ts`
- `tests/indexer/index.test.ts`
- `tests/indexCli.test.ts`
- `.planning/phases/02-provider-diagnostics/02-CONTEXT.md`
- `.planning/phases/01-fail-fast-exit/01-01-SUMMARY.md`
- `.planning/phases/01-fail-fast-exit/01-02-SUMMARY.md`

## Current Behavior

### 1. Fatal embedding errors carry almost no structured diagnostics

- `EmbeddingFatalError` currently only stores `stage = 'embed'` plus a message/cause.
- `processBatch()` throws `new Error('Embedding API 错误: ...')` without preserving HTTP status, upstream `error.type`, upstream `error.code`, endpoint host/path, batch size, or request count.
- `failSession()` turns whatever error arrives into a plain `EmbeddingFatalError`, so later layers cannot classify the failure reliably.

### 2. Indexer preserves stage context but not provider-aware metadata

- `Indexer.batchIndex()` already wraps embedding failures as `向量嵌入阶段失败: ...`, which is a good Phase 1 pattern.
- But the wrapper loses structured metadata because it only copies the string message.
- This means Phase 2 cannot satisfy `DIAG-01`/`DIAG-03` from the CLI without first upgrading the error contract below the CLI.

### 3. Top-level CLI still prints only a single failure line

- `runIndexCliCommand()` currently logs exactly one line on failure: `索引失败: ${error.message}`.
- This satisfies Phase 1 honesty but not Phase 2’s required dual-layer output from D-01/D-02.
- Safe request context from `getEmbeddingConfig()` is available, but nothing renders it at the terminal.

## Constraints Confirmed from Context

- **D-01 / D-02:** failure output must use a two-layer CLI shape: one-line verdict first, then a readable multi-line diagnostics block.
- **D-03:** preserve upstream raw `type`, `code`, `status`, and message instead of over-normalizing.
- **D-04:** add standard failure category only when confidence is high; otherwise keep `unknown`.
- **D-05 / D-06 / D-07:** default output must include a safe request summary (host/path/model/batch size/dimensions/request count/stage/status/provider fields) and must never expose API keys, tokens, or Authorization headers.
- **Phase 1 carry-forward:** fail-fast semantics and success-only completion output remain unchanged.

## Recommended Design

### A. Promote `EmbeddingFatalError` into a typed diagnostics carrier

Add a diagnostics payload to `EmbeddingFatalError`, for example:

- `stage: 'embed'`
- `providerType: string | null` (upstream `error.type`)
- `providerCode: string | null` (upstream `error.code`)
- `httpStatus: number | null`
- `upstreamMessage: string`
- `category: 'authentication' | 'rate_limit' | 'batch_too_large' | 'dimension_mismatch' | 'timeout' | 'network' | 'incompatible_response' | 'unknown'`
- `endpointHost: string`
- `endpointPath: string`
- `model: string`
- `batchSize: number`
- `dimensions: number`
- `requestCount: number`

Why here:

- `src/api/embedding.ts` is the only layer that sees both request config and raw upstream response fields.
- This preserves the existing error-flow architecture: transport creates diagnostics, indexer/scanner forward them, CLI renders them.

### B. Keep classification heuristic-based and conservative

Use explicit rules in `src/api/embedding.ts` only when the signal is clear:

- `authentication`: HTTP `401/403`, or upstream `type/code/message` containing `auth`, `api_key`, `unauthorized`, `forbidden`
- `rate_limit`: HTTP `429`, or `rate`, `quota`, `too many requests`
- `batch_too_large`: HTTP `400/413`, or `batch`, `too large`, `max input`, `payload too large`
- `dimension_mismatch`: message/code/type contains `dimension`
- `timeout`: `AbortError`, `ETIMEDOUT`, or `timeout`
- `network`: existing network-error detector patterns (`ECONNRESET`, `ENOTFOUND`, `fetch failed`, etc.)
- `incompatible_response`: response is HTTP-success-looking but missing `data`, non-array embeddings, invalid item indexes, or returned embedding length mismatches configured dimensions
- else `unknown`

This matches D-04: classify only when evidence is strong.

### C. Render diagnostics only at the CLI boundary

`src/index.ts` should keep the final user-facing contract:

1. first line: `索引失败: 向量嵌入阶段失败: ...`
2. subsequent lines: formatted diagnostics block

Recommended default block fields:

- `阶段: embed`
- `错误类别: <category>`
- `HTTP 状态: <status | unknown>`
- `Provider type/code: <raw value | <none>>`
- `Provider message: <raw upstream message>`
- `Endpoint: <host><path>`
- `Model: <model>`
- `Batch size: <batch size>`
- `Dimensions: <dimensions>`
- `Request items: <request count>`

Do not render:

- `apiKey`
- `Authorization` header
- full URL query strings if they can contain secrets
- raw request body content

## Testing Strategy

### High-value automated tests

1. **API diagnostics tests**
   - HTTP error preserves status/type/code/message
   - network and timeout failures classify correctly
   - incompatible response classifies correctly when payload shape or vector length is invalid

2. **Indexer propagation tests**
   - `Indexer.indexFiles()` rethrows `EmbeddingFatalError` while preserving diagnostics fields
   - stage message remains `向量嵌入阶段失败: ...`

3. **CLI rendering tests**
   - failure verdict is still a single first-line conclusion
   - multiline diagnostics block includes safe fields required by D-06
   - no secrets such as `test-key` or `Bearer ` appear anywhere

## Common Pitfalls to Avoid

- Do not collapse provider raw fields into only one normalized category; keep raw values visible per D-03.
- Do not read config again at the CLI layer if the source layer already captured request-time values; pass diagnostics through the error object.
- Do not assume every provider error has JSON `{ error: ... }`; handle malformed or HTML/plain-text bodies as `incompatible_response` or `unknown`.
- Do not expose full headers or API keys in logs or terminal output.
- Do not change Phase 1 success/failure boundary semantics while adding richer diagnostics.

## Validation Architecture

Phase 2 can use the current Vitest setup; no new infra or dependency work is needed.

- **Quick run:** `pnpm test -- tests/api/embedding.test.ts tests/indexer/index.test.ts tests/indexCli.test.ts`
- **Build sanity:** `pnpm build`
- **Requirements mapping:**
  - `DIAG-01` -> typed provider diagnostics + CLI rendering tests
  - `DIAG-02` -> safe-summary assertions with secret-redaction checks
  - `DIAG-03` -> category-classification tests

## Planning Implications

Recommended plan split:

- **Plan 01 (Wave 1):** add provider-diagnostics contract/tests in API + indexer propagation
- **Plan 02 (Wave 2):** render the dual-layer CLI diagnostics block and assert safe output

This keeps the contract-producing layer ahead of the rendering layer and mirrors the real dependency chain.
