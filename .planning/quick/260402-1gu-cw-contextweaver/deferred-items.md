# Deferred Items

- `pnpm build` 的 d.ts 阶段仍会在 `src/chunking/ParserPool.ts(104)` 因既有类型错误失败；本次快速任务未扩展到该无关构建问题，只复用已成功产出的 ESM `dist/index.js` 完成入口回归验证。
