# AGENTS.md — 礼尚云（lishangyun）

> 本文件由 Kimi Work 对话历史提炼生成（2026-10-12），供 AI 开发会话快速建立上下文。
> 2026-10-16 增补：1.1 AI 会话阅读清单、第 10 节会话结束保存规范、Docker 运行拓扑。
> 完整对话存档见 `docs/99-archive/`（含索引 README.md）。
> 权威需求与规格以 `docs/` 文档为准，本文件只做决策摘要与避坑指引。
>
> **【开工强制步骤】任何开发、排障、答疑操作前，必须先完成 1.1 节的阅读链**：读 `docs/README.md`（文档地图与版本表）→ 按任务类型读对应文档。跳过此链凭记忆动手，视同违反工作规则第 1 条。

## 1. 项目速览

- **产品**：礼尚云 —— 面向中国家庭的礼金往来记账工具（日常记账 + 婚礼/寿宴现场多终端协作收礼），slogan「人情往来小账本，随手记下每一份心意」。原名「礼云随笔 / GiftRegistry」，2026-10-10 更名。
- **技术栈**：前端 React 19 + TypeScript + Vite 8 + TanStack Query/Router + Tailwind 4 + Dexie.js + ECharts；后端 Python 3.14 + FastAPI + SQLAlchemy 2.0 async + PostgreSQL 17；部署 Docker Compose 四服务（db / api / web / nginx）。
- **先读文档**（按任务类型，见下表）：总规范 `docs/01-core-specs/01-项目基本开发要求.md`、开发流程 `docs/01-core-specs/02-AI开发基本流程.md`、需求权威源 `docs/01-core-specs/03-礼尚云-需求分析.md`、UI 规格 `docs/01-core-specs/05-ui-design-spec.md`、合规 `docs/03-operations/上线合规检查清单.md`。文档地图与阅读路径见 `docs/README.md`。

## 1.1 AI 会话阅读清单

**每次会话开始（必读，按序）**：

1. 本文件（AGENTS.md）——约束、红线、避坑
2. `docs/README.md`——文档地图、版本表、推荐阅读路径
3. 按任务类型读下表对应文档

| 任务类型 | 必读文档 |
|---------|---------|
| 日常功能开发 | `01-core-specs/03-礼尚云-需求分析.md`（确认模块与 F-x.x 编号、`[已实现]`/`[待实现]` 状态）+ `02-AI开发基本流程.md` |
| 用户管理/权限 | `01-core-specs/04-用户管理需求规划.md` + `01-项目基本开发要求.md` |
| 新功能方案设计 | `02-plans/` 下对应专项方案 + `02-plans/sync-protocol.md`（涉及同步时） |
| 修复 Bug | `01-core-specs/06-测试方案.md` + `05-implementation/` 近期汇总（查已知问题） |
| 用户答疑/故障排查 | `04-support/AI-support.md` + `05-implementation/` 近期汇总 |
| 部署/运维 | `docker-compose.yml` + `nginx.conf` + `03-operations/` + 本文第 7 节 |
| 追溯历史决策 | `docs/99-archive/README.md`（完整对话存档索引） |

**禁止**：不读需求文档凭记忆实现；跨模块改动不查 `05-implementation/` 近期汇总（同一坑可能修过）。

## 2. 工作规则

1. 需求文档优先，不凭记忆推测；动手前确认相关模块 `[已实现]`/`[待实现]` 状态。
2. 最小变更：一次只做一件明确的事，不夹带无关改动。
3. 每步可验证：后端 `cd server && .venv/Scripts/python.exe -m pytest`（系统 Python 无 pytest；测试库为真实 PG 的 `giftregistry_test`）；前端 `npx vitest run` + `npx tsc`；交付时说明验证方式。
4. 文档同步：有代码变更就更新相关 docs、CHANGELOG；较大改动新建 `docs/YYYY-MM-DD-主题汇总.md`。
5. 提交按逻辑拆分，信息带范围前缀（fix/feat/docs/chore），中文描述。
6. 版本号唯一出处 `web/package.json`，发版用 `npm run release[:patch]`（同步 CHANGELOG）。
7. git 推送须走仓库级代理 `http.proxy=http://127.0.0.1:9567`（直连 GitHub 被重置；代理换端口要同步 `.git/config`）。

## 3. 品牌与命名红线

- 用户可见文案一律「礼尚云」：`web/` 包名 `lishangyun`、PWA manifest、页面 `<title>`、Swagger 标题「礼尚云 API」、邮件主题 `【礼尚云】××验证码`。出现"礼云随笔"即回归 bug。
- **刻意保留旧标识，禁止"统一命名"时误改**（改了会破坏存量用户数据）：
  - IndexedDB 名 `GiftRegistryDB`（`web/src/lib/dexie.ts`）
  - 安全存储键 `GiftRegistrySecureStorage`、KEK 盐值常量（`secure-storage.ts` / `crypto.ts`）
  - PostgreSQL 库名 `giftregistry`（含 `giftregistry_test`）
- 新旧路径联接：`D:\web\GiftRegistry` 是指向 `D:\web\lishangyun` 的 junction（旧对话窗口恢复用），确认无用后 `rmdir "D:\web\GiftRegistry"` 删除。

## 4. 后端关键约定

- **时间**：所有 DateTime 以无时区 UTC 入库，统一用 `app.core.time.utcnow()`（禁 `datetime.utcnow()`）。按"本地某一天"过滤必须先把本地日期换算成 UTC 区间，否则午夜后数据漏查。
- **金额**：一律以分（Integer）存储，展示侧除 100。
- **分页**：响应字段 `pagination.total_count`（不是 total）；`page_size` 上限 100。
- **用户 ID**：创建年份(4 位)+6 位流水号（如 `2026000001`），由 `app/core/user_id.py` 生成，注册/管理员建号/导入三处统一接入。
- **角色 3 级**：`user`（注册默认）/ `admin`（超管授权）/ `super_admin`（首个注册，受保护：不可改角色/禁用/删除，前后端双重拦截）。旧的 5 级体系已废止，接口拒绝旧值（422）。中文标签：一般用户 / 系统管理员 / 超级管理员。
- **认证防护**：登录防爆破内存滑动窗口（10 分钟 5 次，429 带剩余秒数）；验证码用 `secrets` 生成、有效期 10 分钟、60 秒重发节流。
- **礼簿访问控制**：任何礼簿相关新端点必须接入 `server/app/core/guestbook_access.py` 依赖并声明权限（owner→家庭→协作者三级，协作按 `collaboration_start_at/end_at` 时段窗口校验），否则协作者会被静默挡在门外。无授权语义用 403。
- **协作邀请体系已整体替代旧授权码**（旧 Model/API/页面已删）：6 位邀请码仅创建时明文返回一次；接受信号 10 分钟有效；结束收礼会撤销该礼簿全部邀请。
- **邮件/SMTP 配置存数据库** `system_settings` 表（不走 .env），后台录入，缺配置发信返回 400；端口 465=SSL、其他=STARTTLS（本机定 587）；密码只回显 `smtp_password_set` 布尔。找回密码用 email-hint 掩码邮箱防枚举。
- **生产密钥 fail-fast**：`APP_ENCRYPTION_KEY` 等默认值在生产环境拒绝启动（compose 默认 `ENVIRONMENT=production`）。
- **其他坑**：`requirements.txt` 需 `sqlalchemy[asyncio]` + `greenlet>=3.0`（缺了只有生产容器里才爆）；`pytest.ini` 必须 `asyncio_default_fixture_loop_scope = function`（session 会致 asyncpg 跨循环挂起，别改回）；FastAPI 路由顺序——固定路径（如 `/payment-accounts/received-summary`）必须放在 `/{account_id}` 之前；alembic 迁移先查 ID 撞号（撞过，容器起不来）；迁移命名 `xx_mN_描述.py`，幂等可重复执行；软删除统一 `is_deleted`+`deleted_at`，审计用 `write_audit_log`。

## 5. 前端关键约定

- **错误提示三层规范（开发要求 8.4，禁止静默失败）**：字段级错误→输入框下方红字 + 红边框 + 输入即清；业务/全局错误→Toast（约 4 秒、去重）；网络故障（status 0）与 503→常驻粘性横幅。登录/注册页顶部错误横幅已移除，不得回归。后端对应 `errors.py`：数据库故障→503 通用文案、其余→500，堆栈只进日志、客户端不泄露内部细节。
- **React Query 纪律**：一切数据变更走带缓存失效的 mutation hooks，禁止页面直调原始 API；改接口必须同步 `queryKeys.ts`（含参数），否则"界面不刷新"类 bug 复发（已多次踩坑）。
- **金额格式化**用共享 `formatFen`；`types/index.ts` 的 `formatAmount` 语义不同（无 ¥），勿混用。
- **事由中文映射唯一出口** `web/src/lib/eventType.ts`（`EVENT_TYPE_LABELS` / `eventTypeLabel()`），其他地方不得重复定义。礼簿事由枚举：wedding 婚礼、engagement 订婚、birthday_banquet 生日/寿宴、fullmoon 满月酒、housewarming 乔迁、graduation 升学宴、funeral 丧葬、holiday 节日红包、other 其他——改动需同步下拉、后端 schemas 两处枚举、import/export 中英文映射共 5 处。日常记账事由是自由文本（≤30 字）。
- localStorage 键统一 `gr.` 前缀（`gr.access_token` / `gr.current_user` / `gr_operator_name`）。
- 组件不得定义在组件内部（子树重建）；ECharts 用增量 `setOption`，不销毁重建；窄屏适配原则：`w-full`+`min-w-0`+`max-w-6xl`（flex 子项 `min-width:auto` 和 `mx-auto` 是两个溢出坑），**用户不接受页面横向滚动**。

## 6. 统计口径（高频踩坑区）

- 归月/区间筛选/人员排行按**数据日期** `event_date`（宴席日期）；账户对账「今日已收」与微信限额按**录入时间** `record_time`（UTC）。
- 净差额 = 收 − 送 + 差额调整；年度/累计口径已统一为含调整（`net_with_adjustment`），与人员排行一致；卡片需标注统计范围。
- 收到合计 = 日常 + 礼簿收礼（`/api/stats/overview` 不传日期即全量累计）。

## 7. 本机环境陷阱

- **后端固定 8001 端口**：`cd server && uv run uvicorn app.main:app --reload --port 8001`；`web/vite.config.ts` 代理 `/api` 和 `/api/ws` 到 `127.0.0.1:8001`。起在 8000 会"页面能开接口全挂"。
- 开发环境只跑 db 容器 + 本地 uvicorn；生产才 `docker compose up -d --build`。api 容器重建后若 nginx 502，重启 nginx（nginx.conf 已改 Docker 内嵌 DNS 动态解析，旧坑仍需知道）。
- **Docker 运行拓扑（compose 项目名 `lishangyun`，2026-10-16 起）**：容器 `lishangyun-db/api/web/nginx`。生产形态——nginx 占 80 端口对外，api 只绑 `127.0.0.1:8000` 由 nginx 反代，db 只绑 `127.0.0.1:5432`；web 容器是**一次性构建容器**（pnpm build 后把静态产物拷进 `lishangyun_static_files` 卷即退出，退出码 0 属正常，不是故障）。数据卷 `lishangyun_pgdata`（数据库，删了数据就没了）与 `lishangyun_static_files`。
- Git Bash 没有 docker：`export PATH="$PATH:/c/Program Files/Docker/Docker/resources/bin"`（还需 cli-plugins）。注意 resources/bin 里只有独立的 `docker-compose.exe`（v1，不识别 `name:` 字段，项目名按目录名取），没有 compose v2 插件。
- **PWA Service Worker 缓存**会制造"改了没生效"的假象——验证前先 Ctrl+F5 或清缓存。
- uvicorn `--reload` watcher 多次失灵；改代码后以 `curl openapi.json` 实测为准。Kimi 桌面端可能托管 dev server，终端关后留意孤儿 uvicorn（`netstat -ano | grep LISTENING` 确认）。
- 后端路由不带尾斜线（尾斜线 307 跨源会剥 Authorization 头 → 401"闪现跳回登录页"）。
- PowerShell 里 `$pid` 是保留变量；bash 传 Windows 路径用正斜杠。

## 8. 安全与合规

- 新增依赖先核许可证并同步 `docs/第三方依赖许可证清单.md`（现全部为宽松许可证，无 GPL/AGPL）。
- 严禁任何密钥/个人文件入库；历史曾用 `git filter-branch` 重写清除照片并 force push——**其他设备需重新克隆**。
- 对外公开运营需办：ICP 备案、App 备案、PIPL 隐私政策与注销渠道（当前自部署/亲友使用不触发）。商标（第 9/42 类）与 `lishangyun.com` 域名待办。
- 阿里云短信当前为 Mock 模式（验证码在 `docker compose logs api` 的 INFO 日志），签名/模板审核通过后在管理后台切真实模式。

## 9. 未完成事项（截至 2026-10-16）

- 商标近似查询与注册（按新名「礼尚云」，第 9/42 类）、域名 `lishangyun.com` 注册。
- 归档/删除旧仓库 `laolan74825/GiftRegistry`；清理 `D:\web\giftregistry.bundle`；删除 junction（确认旧窗口不用后）。~~Docker 旧容器/旧数据卷~~ 已于 2026-10-16 清理完毕。
- GitHub 账号开 2FA、启用 Secret scanning / Push Protection。
- 短信切真实模式并同步云服务器配置；Capacitor APK 打包、软著、App 备案。
- `VSCode扩展备份.txt` 是否留在仓库，待决定。

## 10. 会话结束保存规范

对话中产生的成果，按类型落到对应位置，**不许只留在对话里**（对话记录易失，项目文档与 git 才是持久层）：

| 成果类型 | 去向 | 说明 |
|---------|------|------|
| 新踩的坑、新定的关键决策 | 更新本文件（AGENTS.md）对应小节 | 这是下一个会话的上下文来源，价值最高 |
| 接口/口径/约束变更 | `01-core-specs/` 对应规范 + `CHANGELOG.md`「未发布」段 | 规范与代码同步是硬纪律 |
| 跨模块、多文件的较大改动 | `05-implementation/YYYY-MM-DD-主题汇总.md` | 记录变更点、验证方式、运维说明 |
| 值得留存的完整对话 | `docs/99-archive/YYYY-MM-DD-主题.md` | 同步更新其 `README.md` 索引（主题、轮数、日期） |
| 新文档 / 文档版本变化 | `docs/README.md` 对应表格 | 版本号改动必须同步版本表 |
| 配置/部署形态变化 | 本文件第 7 节 + `docker-compose.yml` 注释 | 如端口、容器名、卷名 |

提交纪律：中文提交信息、带范围前缀（fix/feat/docs/chore）、按逻辑拆分、不夹带无关文件（如个人脚本 `ask.py` 不入库）；推送前确认走仓库级代理（见第 2 节第 7 条）。

## 11. 历史存档

需要追溯某项决策的来龙去脉时，读 `docs/99-archive/README.md` 按主题找到对应对话全文（2026-09-30 起持续追加）。
