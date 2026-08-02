# BLOCKED.md — 待裁决清单（PR-0 合同收口）

最后更新：2026-08-03

## 待裁决

1. **任务书事实与代码不符：自定义 Emoji 上传入口仍存在**
   - 任务书写「前端 `grep -rn "uploadImage|giphy|emoji/upload" frontend/src` 零命中」「EmojiPicker 无上传调用」。
   - 实测：`frontend/src/lib/api.ts:571` 存在 `fetch("/api/emoji/upload")`；`frontend/src/components/EmojiPicker.tsx:110` 调用 `chatAPI.uploadEmoji(file, emojiName)`，UI 渲染「上传表情」按钮与隐藏文件输入（:209-223），并支持删除自定义 emoji（:251-262）；后端 `/api/emoji/upload`、`/uploads/emojis/` 仍注册（backend/main.go:160,171），`custom_emoji_add/list/delete` WS 事件仍处理。
   - 处置：矩阵按代码事实写为「Compat（只读展示为主，但上传/删除入口仍在运行面）」，未照抄任务书的「无上传入口」。
   - **待裁决**：自定义 Emoji 上传入口是否应列入后续运行面清理（任务 2 范围）？当前 PR 未动 `frontend/src/` 任何代码（禁令）。

2. **顺手活登记（本任务禁止做，仅留档）**：AuthState 重构、logout 完善、OIDC 收敛、prependHistory、pnpm 统一、CD 改造、backend `/api/upload`/`/api/emoji/upload`/`/api/giphy/*`/`/api/webhook/` 等路由删除与 hub legacy WS 事件清理（任务 2）。

## 无其他未决事项
