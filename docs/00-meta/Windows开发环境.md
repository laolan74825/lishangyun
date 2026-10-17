---
title: Windows 开发环境说明
version: "1.1"
updated: "2026-10-17"
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

**何时起全套容器（`docker compose up -d --build`，2026-10-17 定）**——容器是"出厂质检线"不是"工作台"，日常迭代（业务代码、前端页面、接口逻辑）全程用不到，出现以下任一情况才上质检线：

1. 上线/发版前（必做，验证生产形态全链路）。
2. 改了 `server/Dockerfile`、`docker-compose.yml`、`nginx.conf`、alembic 迁移脚本——这些只在容器形态下生效，改完不验证等于盲改。
3. `server/requirements.txt` 有新增/变更依赖（含编译型包如 `greenlet`，"只有生产容器才爆"的坑）。
4. 改了 alembic 迁移（api 容器 CMD 含 `alembic upgrade head`，撞号/幂等问题只在容器冷启动时暴露）。

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

## 六、AI 会话运行前后端的隔离规范（2026-10-17 定）

> 目的：用户在 IDE 里跑着开发实例（uvicorn :8001 / Vite :5173）时，AI 为验证改动而起的服务**不得抢占端口、不得另起一套与 IDE 实例并行写同一个库**。用户与 AI 共用同一套开发实例，而不是各跑一套。

1. **pytest / vitest 属于纯测试，不经由 HTTP 服务**：pytest 只连 `giftregistry_test`（每次重建，conftest 自动造数），**严禁**把测试配置指向开发库 `giftregistry`；vitest 为单测，不占端口、不依赖后端。跑这两类测试不需要起任何前后端。
2. **AI 起后端前必须先查 8001 占用**（`netstat -ano | grep 8001`）：
   - 已被占用（用户在 IDE 跑的 uvicorn）→ **直接复用该实例**，通过 `curl http://127.0.0.1:8001/...` 验证，不另起第二个 uvicorn（两个实例同库并行是数据冲突源）。
   - 空闲 → AI 可前台起一个 `uvicorn --reload --port 8001`，**测完必须结束进程**，禁止后台常驻（防孤儿进程，见第四节）。
   - 一律禁止用 8000（生产 API 端口）或 80（nginx）做开发验证。
3. **AI 起前端前必须先查 5173 占用**：被占用则复用用户已跑的 Vite（其代理已指向 8001）；空闲才可前台 `pnpm dev`，测完即关。注意 `vite.config.ts` 未设 `strictPort`，5173 被占时 Vite 会**静默飘移到 5174/5175**——AI 不得用飘移出来的端口私下验证而不告知，发现飘移应停止并回到第 2 条的端口核查。
4. **E2E（`e2e/e2e_flow.py`）是生产形态验证**：打 `http://localhost`（:80，全套容器，属"何时起全套容器"的例外场景），且 seed 数据写入开发库 `giftregistry`（与 IDE 实例同库）。约束：跑 E2E 前确认用户未在 IDE 中调试同一批账号数据；跑完执行 `e2e/e2e_cleanup.py` 清理造数。
5. **收尾纪律**：AI 起的任何服务/容器（uvicorn、Vite、临时 compose 栈）在任务结束前必须全部关闭；交付时说明"验证用过哪些端口、是否已关闭"。用户 IDE 里跑着的服务一律不动、不杀（唯一的例外是按用户明确要求清理孤儿进程）。
