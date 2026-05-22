# Contributing

欢迎贡献！

## 开发流程

1. Fork 仓库，创建 feature 分支
2. 遵循现有代码风格（Go: `gofmt`，TSX: Prettier 默认）
3. 保持改动聚焦，避免无关重构
4. 为新功能补充测试
5. 确保构建和测试通过后再提交 PR

```bash
# 后端
cd backend && go build ./... && go test ./...

# 前端
cd frontend && npm run build && npx vitest run
```

## 提交规范

- `feat:` 新功能
- `fix:` 修复
- `docs:` 文档
- `refactor:` 重构
- `test:` 测试
- `chore:` 构建/工具

## 安全

- 不要在代码或文档中硬编码服务器 IP、内部端口、凭据
- 敏感配置使用环境变量（参考 `.env.example`）
- 发现安全漏洞请私下报告，不要公开提 Issue

## PR 模板

```markdown
## Summary
<简要描述改动>

## Test plan
- [ ] 后端测试通过
- [ ] 前端测试通过
- [ ] 手动验证（截图/描述）
```
