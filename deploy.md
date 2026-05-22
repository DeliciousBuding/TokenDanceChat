# Deployment Guide

> 通用部署流程。服务器具体配置见私有运维文档。

## 1. 构建

```bash
# 前端
cd frontend && npm run build

# 后端（交叉编译 Linux amd64）
cd backend
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-s -w" -o tokendancechat .
```

## 2. 部署

### Docker 方式（推荐）

```bash
# 上传文件到服务器
scp backend/tokendancechat user@server:/tmp/
scp -r frontend/dist/* user@server:/tmp/frontend-dist/
scp Dockerfile.runtime user@server:/tmp/

# 在服务器上构建并运行
ssh user@server "
  cd /tmp &&
  docker build -f Dockerfile.runtime -t tokendancechat:latest . &&
  docker stop tokendancechat 2>/dev/null || true &&
  docker rm tokendancechat 2>/dev/null || true &&
  docker run -d --name tokendancechat \
    --network host \
    -v /path/to/data:/app/data \
    -e CHAT_ADDR=:3221 \
    -e CHAT_DB_PATH=/app/data/chat.db \
    -e CHAT_FRONTEND_DIR=/app/frontend/dist \
    --env-file /path/to/secrets.env \
    tokendancechat:latest
"
```

### 仅更新前端（不动后端）

```bash
cd frontend && npm run build
scp -r dist/* user@server:/tmp/frontend-dist/
ssh user@server "
  docker exec -u root tokendancechat sh -c 'rm -rf /app/frontend/dist/assets/* /app/frontend/dist/index.html' &&
  docker cp /tmp/frontend-dist/. tokendancechat:/app/frontend/dist/
"
```

## 3. 验证

```bash
curl https://chat.vectorcontrol.tech/api/health
# → {"db":"ok","service":"tokendancechat","status":"ok"}

# WebSocket 冒烟测试
node -e "
const ws = new WebSocket('wss://chat.vectorcontrol.tech/ws');
ws.addEventListener('open', () => ws.send(JSON.stringify({type:'join', username:'smoke'+Date.now()})));
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.type==='history') { console.log('OK'); ws.close(); process.exit(0); }});
setTimeout(() => process.exit(1), 10000);
"
```

## 4. Nginx 参考

```nginx
server {
    listen 443 ssl http2;
    server_name chat.example.com;

    ssl_certificate     /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3221;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `CHAT_ADDR` | `:8080` | 监听地址 |
| `CHAT_DB_PATH` | `data/chat.db` | SQLite 路径 |
| `CHAT_FRONTEND_DIR` | `frontend/dist` | 前端静态文件目录 |
| `CHAT_ALLOWED_ORIGINS` | — | 允许的 WS 来源 |
| `CHAT_LLM_PROVIDER` | `openai` | LLM 协议 |
| `CHAT_LLM_BASE_URL` | — | LLM API 地址 |
| `CHAT_LLM_MODEL` | — | LLM 模型名 |
| `CHAT_LLM_API_KEY` | — | LLM API 密钥 |
| `CHAT_PICOCLAW_URL` | — | PicoClaw WS 地址 |
| `CHAT_PICOCLAW_TOKEN` | — | PicoClaw Token |
