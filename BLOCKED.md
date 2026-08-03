# BLOCKED.md — 待裁决清单（PR-0/PR-1）

最后更新：2026-08-03

## 待裁决

1. **自定义 Emoji 上传入口是否清理**（PR-1 保留，未动）
   - 现状：`frontend/src/components/EmojiPicker.tsx:110` 有「上传表情」按钮，`lib/api.ts:571` 调 `/api/emoji/upload`；后端 `UploadEmoji`/`ServeEmoji` 完整保留（本次裁决：真实可达用户功能，删需领导拍板）。
   - 选项 A：保留现状，后续 PR 加固（magic bytes 校验、尺寸/像素限制、禁止 SVG、服务端重编码）。
   - 选项 B：删上传/删除入口，只留只读展示（矩阵改 Compat 只读）。
   - 管理者默认：选项 A（加固）。

2. **Webhook 路由与 hub legacy WS 事件**：`/api/webhook/` 仍注册、`group_*`/`friend_*`/`call_*` 等 WS 事件仍处理（矩阵标 Compat/Archived 运行面清理中）——归后续 Core/Compat 收口 PR，本次未动。

3. **顺手活登记（后续 PR）**：AuthState 重构、logout 统一、OIDC 收敛（issuer 校验/nonce/JWKS 刷新/删无调用者端点）、prependHistory 修复、pnpm 统一、CD 单 pipeline、slog 结构化日志、PR-2 消息正确性。

## 无其他未决事项
