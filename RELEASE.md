# Release Checklist

## 每次发布前

- [ ] 后端构建通过：`cd backend && go build ./...`
- [ ] 后端测试通过：`cd backend && go test ./...`
- [ ] 前端构建通过：`cd frontend && npm run build`
- [ ] 前端测试通过：`cd frontend && npx vitest run`
- [ ] 类型检查通过：`cd frontend && npx tsc --noEmit`
- [ ] E2E 测试通过：`cd frontend && E2E_BASE_URL=https://chat.vectorcontrol.tech npx playwright test src/e2e/ --project=chromium`
- [ ] 无敏感信息泄露：grep 服务器 IP / 内部端口 / SSH 配置
- [ ] `.gitignore` 覆盖所有生成文件
- [ ] `.env.example` 无真实凭据或内部 URL

## 打 Tag

```bash
git tag -a v0.x.0 -m "v0.x.0: <简要描述>"
git push origin v0.x.0
```

## 生产部署后验证

- [ ] `/api/health` 返回 `{"status":"ok"}`
- [ ] WebSocket 连接 + 消息收发正常
- [ ] `@TokenBot` 和 `@PicoClaw` 正常回复
- [ ] 前端页面无 JS 错误（打开浏览器控制台检查）
