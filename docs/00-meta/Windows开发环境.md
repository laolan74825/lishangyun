---
title: Windows 开发环境说明
version: "1.0"
updated: "2026-10-16"
status: active
---

# Windows 开发环境说明

> 本项目日常开发在 **Windows 11 + Git Bash** 环境下进行。本文档是与 Linux/macOS 环境的差异汇总与操作避坑，由 `docs/README.md` 与 `AGENTS.md` 的环境内容合并而成（2026-10-16），任何一处引用以本文为准。

---

## 一、路径与 Shell

- **Shell**：使用 Git Bash（POSIX sh），而非 PowerShell 或 cmd.exe。所有文档中的 bash 命令均在此环境下执行。
- **路径分隔符**：文档内统一使用正斜杠 `/`，Git Bash 可正确识别；向 Windows 原生程序传路径时可能需要转换（`cmd //c`、批处理文件可绕过转义问题）。
- **MSYS 路径转换陷阱**：`docker run ... ls /data` 中的 `/data` 会被 Git Bash 改写成 Windows 路径，需 `export MSYS_NO_PATHCONV=1` 规避。
- **PowerShell 保留变量**：`$pid` 在 PowerShell 中是保留变量，写脚本时需避免使用此变量名。

## 二、端口与服务

| 场景 | 端口 | 说明 |
|------|------|------|
| 开发后端 | `8001` | `uvicorn --reload --port 8001`；`web/vite.config.ts` 代理 `/api` 和 `/api/ws` 到 `127.0.0.1:8001`。**起在 8000 会"页面能开接口全挂"** |
| 生产入口 | `80` | nginx 容器对外 |
| 生产 API | `127.0.0.1:8000` | 只绑回环，由 nginx 反代 |
| 数据库 | `127.0.0.1:5432` | 只绑回环，不对公网开放 |

**开发/生产启动方式**：开发只跑 db 容器 + 本地 uvicorn（`docker compose up -d postgres`）；生产才 `docker compose up -d --build`。api 容器重建后若 nginx 502，重启 nginx（nginx.conf 已改 Docker 内嵌 DNS 动态解析，旧坑仍需知道）。

**Docker 运行拓扑（compose 项目名 `lishangyun`，2026-10-16 起）**：容器 `lishangyun-db/api/web/nginx`；web 容器是**一次性构建容器**（pnpm build 后把静态产物拷进 `lishangyun_static_files` 卷即退出，退出码 0 属正常，不是故障）。数据卷 `lishangyun_pgdata`（数据库，删了数据就没了）与 `lishangyun_static_files`。

**Git Bash 使用 Docker**：

```bash
export PATH="$PATH:/c/Program Files/Docker/Docker/resources/bin"
```

注意 resources/bin 里只有独立的 `docker-compose.exe`（**v1，不识别 `name:` 字段**，项目名按目录名取），没有 compose v2 插件，命令用 `docker-compose` 而非 `docker compose`。

## 三、Git 与仓库

- **仓库级代理**：向 GitHub 推送时必须走代理，当前配置为：
  ```bash
  git config --local http.proxy http://127.0.0.1:9567
  ```
  若代理端口变更，需同步更新 `.git/config`（直连 GitHub 被重置）。
- **Junction 路径**：`D:\web\GiftRegistry` 是指向 `D:\web\lishangyun` 的 Windows junction（旧对话窗口恢复用）。确认无用后可删除：
  ```bash
  rmdir "D:\web\GiftRegistry"
  ```

## 四、前端验证陷阱

- **PWA Service Worker 缓存**：浏览器缓存会导致"代码改了但页面没变化"。验证前务必 **Ctrl+F5 强制刷新** 或清除缓存。
- **Uvicorn 热重载失灵**：`--reload` 在 Windows 下偶发不生效，改代码后以 `curl http://127.0.0.1:8001/openapi.json` 实测为准。
- **Kimi 桌面端孤儿进程**：Kimi 桌面端可能托管 dev server，终端关闭后 uvicorn 可能仍在后台运行。用以下命令检查并结束：
  ```bash
  netstat -ano | grep LISTENING   # 查看占用 8001 的进程
  taskkill /PID <pid> /F          # 结束进程（在 cmd 中执行）
  ```

## 五、测试执行

- **后端测试**：系统 Python 无 pytest，必须在项目虚拟环境中运行：
  ```bash
  cd server
  .venv/Scripts/python.exe -m pytest
  ```
- **前端测试**：
  ```bash
  cd web
  npx vitest run
  npx tsc --noEmit
  ```
