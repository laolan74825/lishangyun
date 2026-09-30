# 随礼记账本 — AI 辅助开发基本流程（v3.0 里程碑版）

> 文档版本：v3.0
> 编制日期：2026-09-21
> 本次更新：2026-09-24
> 适用对象：AI 开发助手（Qoder 等）
> 关联文档：
>
> - 项目基本开发要求.md（v3.0）— 整合性基本要求
> - 随礼记账本-需求分析.md（v4.1）— 功能需求权威源
> - 用户管理需求规划.md（v2.3）— 用户管理与权限体系
> - ui-design-spec.md（v3.1）— UI 设计规格
> - 智能体技能文件（backend-api、frontend-page）— 带 [已实现]/[待实现] 标注
> 技术栈目标：React 19.3+ / TypeScript 7.0.2 / Vite 8 / TanStack Router 1.x / TanStack Query 5.x / Tailwind CSS 4 / Python 3.14 / FastAPI 0.141+ / SQLAlchemy 2.0+ async / Argon2 / PyJWT 2.x

---

## 一、核心原则

1. **需求文档优先**：所有开发以 `.md` 需求文档为准，不凭记忆或推测。动手前先读文档。
2. **状态感知**：理解当前代码实现了什么、需求定义了但尚未实现什么。智能体技能文件使用 `[已实现]`/`[待实现]` 标注，开发前必须确认。
3. **最小变更**：每次只做一个明确的功能点或修复，不夹带无关改动。
4. **可验证**：每次交付必须说明如何验证（运行命令、测试步骤、预期结果）。
5. **不破坏现有功能**：改动前确认影响范围，回归测试关键路径。
6. **保持文档同步**：代码变更后，相关文档（技能文件、需求文档）同步更新。
7. **里程碑驱动**：按 9 个里程碑（MVP 1.0 → v5.0）分阶段交付，每个里程碑 2-3 周，优先完成 P0 功能。

---

## 二、项目现状概览（2026-09-24）

### 2.1 已实现（约 34%）

**后端（55 个 API 端点）：**

- 基础 CRUD：persons、guestbooks、gb_records、daily_records、payment_accounts
- 认证：JWT（PyJWT）+ Argon2 密码哈希
- 操作日志：operation_logs 基础记录
- 统计：基础聚合查询
- 数据库：10 张核心表（PostgreSQL 17）

**前端（32 个源文件）：**

- 页面：11 个（login、dashboard、records、guestbook、collect、people、stats、settings、accounts）
- 组件：14 个（collect 子组件、modal、autocomplete、reconciliation、toast 等）
- 状态管理：Zustand v5（基础状态）
- API 客户端：fetch wrapper + JWT 自动附加
- 设计系统：Tailwind CSS 4 @theme（颜色、字体、间距、圆角、阴影）
- 路由：react-router-dom v7（13 条路由）

**关键缺口（P0 阻塞多用户功能）：**

- ✅ owner_id 数据隔离（2026-09 已落地，所有业务表含 owner_id 外键）
- ✅ 角色体系（2026-10-01 落地为 3 级：super_admin / admin / user，原计划的 5 级体系已废止，详见"角色体系（已实现）"一节）
- ❌ 分页不完整（部分端点缺少分页参数）
- ✅ 本地优先同步（IndexedDB + Dexie.js 已实现）

### 2.2 待实现（约 66%）

**后端：**

- owner_id 数据隔离改造
- 角色权限体系（5 级 DB 角色 + 5 级应用角色）
- WebSocket 实时协作
- 离线同步引擎
- 客户端加密（AES-256-GCM + 助记词）
- 家庭组管理
- 授权码机制
- 数据导入/导出
- 管理后台 API

**前端：**

- TanStack Router 迁移（替代 react-router-dom）
- TanStack Query 集成（替代裸 fetch + useState）
- Dexie.js IndexedDB 离线存储
- WebSocket 协作 hook
- 布局组件（TopNavBar、DesktopSidebar、MobileBottomTabs）
- 业务组件（charts/、family/、authz/、admin/、merge/、import/）
- ECharts 统计图表
- SheetJS 数据导出
- 锁屏、通知中心、安全模式页面
- 管理后台页面（6 个）

### 2.3 智能体技能文件标注

两个智能体技能文件（`backend-api`、`frontend-page`）已全面标注 `[已实现]`/`[待实现]`：

- ✅ = 文件已存在，代码可用
- 🎯 = 需求已定义，代码尚未开发
- ⚠️ = 文件存在但需要更新（类型定义等；角色体系已于 2026-10-01 同步为 3 级，相关标注视为已解决）

**开发前必须检查技能文件中的状态标注**，避免 import 不存在的包或引用不存在的文件。

---

## 三、开发流程（单次任务）

```text
┌─────────────────────────────────────────────────────────────┐
│                    AI 开发单次任务流程                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ① 理解任务 + 确认里程碑                                    │
│     ├─ 读取相关需求文档（确认功能点、验收标准）              │
│     ├─ 确认该功能属于哪个里程碑（MVP 1.0 → v5.0）          │
│     ├─ 读取相关技能文件（backend-api / frontend-page）       │
│     ├─ 检查 [已实现]/[待实现] 标注，理解当前状态            │
│     └─ 确认当前代码状态（git status、相关文件）              │
│                                                             │
│  ② 规划方案                                                │
│     ├─ 列出需要修改/新增的文件                              │
│     ├─ 确认技术选型与现有模式一致                            │
│     ├─ 如涉及 [待实现] 依赖，说明需先安装的包                │
│     └─ 如有多种方案，先与用户讨论再动手                      │
│                                                             │
│  ③ 实现代码                                                │
│     ├─ 遵循项目编码规范（见下方第四节）                      │
│     ├─ 后端：模型 → Schema → API → 迁移                    │
│     ├─ 前端：组件 → Store → API 调用 → 路由                │
│     ├─ 双轨模式：如当前用裸 fetch，目标 TanStack Query，    │
│     │  先按当前模式实现，后续统一迁移                       │
│     └─ 每完成一个文件，检查语法和类型                        │
│                                                             │
│  ④ 验证                                                    │
│     ├─ 后端：启动服务 + curl/浏览器测试端点                  │
│     ├─ 前端：启动 dev server + 浏览器检查页面                │
│     ├─ 数据库：运行迁移 + 确认表结构                        │
│     ├─ 响应式：检查 mobile/tablet/desktop 三档               │
│     └─ 报告验证结果（通过/失败 + 原因）                      │
│                                                             │
│  ⑤ 收尾                                                    │
│     ├─ 更新相关文档（如有变更）                              │
│     ├─ 更新技能文件中的 [已实现]/[待实现] 标注              │
│     ├─ 简要说明做了什么、怎么验证                            │
│     └─ 标注遗留问题或下一步建议                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 四、编码规范速查

### 4.1 后端（Python 3.14 / FastAPI / SQLAlchemy 2.0+ async）

```python
# 依赖注入（Annotated 模式 + AsyncSession）
from typing import Annotated
from fastapi import Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.core.dependencies import get_current_user

DB = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]

# 端点模板（async def + select() 查询）
@router.get("/", response_model=list[ItemResponse])
async def list_items(db: DB, current_user: CurrentUser,
                     limit: int = Query(20, ge=1, le=100),
                     offset: int = Query(0, ge=0)):
    result = await db.execute(
        select(Item)
        .where(Item.owner_id == current_user.id)  # ⚠️ P0: owner_id 数据隔离
        .order_by(Item.created_at.desc())
        .offset(offset).limit(limit)
    )
    return result.scalars().all()

# 金额：Integer，单位分
# 枚举：Literal["cash", "wechat"]
# 校验：Field(..., ge=0, max_length=50)
# 审计：GbRecord 变更必须写 operation_log
# 密码：Argon2 哈希（passlib），旧 bcrypt 登录时自动升级
# JSON 字段：PostgreSQL 使用 JSONB 类型
# 软删除：is_deleted + deleted_at（30 天 purge）
```

### 4.2 前端（React 19 / Tailwind CSS 4）

#### 当前模式（裸 fetch + useState）[已实现]

```typescript
// 适用于当前代码库（react-router-dom v7 + 裸 fetch）
import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import dayjs from 'dayjs';

interface Props {
  guestbookId: number;
}

export function CollectPage({ guestbookId }: Props) {
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiClient.getRecords(guestbookId)
      .then(data => setRecords(data))
      .finally(() => setIsLoading(false));
  }, [guestbookId]);

  return (
    <div className="p-4 max-w-lg mx-auto">
      {/* Tailwind CSS 4：使用 @theme 中定义的 Token 类名 */}
      {/* 响应式：sm: md: lg: xl: 断点 */}
    </div>
  );
}
```

#### 目标模式（TanStack Query）[待实现]

```typescript
// 需先安装 @tanstack/react-query，迁移至 TanStack Router 后启用
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { apiClient } from '@/lib/api-client';

export function CollectPage({ guestbookId }: Props) {
  const { data: records, isLoading } = useQuery({
    queryKey: queryKeys.gbRecords.list(guestbookId),
    queryFn: () => apiClient.getRecords(guestbookId),
  });

  return <div>...</div>;
}
```

#### 通用规则

- TypeScript strict，禁止 `any`
- 服务端状态：当前裸 fetch，目标 TanStack Query 5（queryKey 工厂函数模式）
- 客户端状态：Zustand 5（终端设置/UI/锁定）
- API 调用：通过 `api-client.ts` 封装
- 日期：dayjs
- 样式：Tailwind CSS 4（@theme Token，不引入额外 CSS）
- 路由：当前 react-router-dom v7，目标 TanStack Router（编译时类型安全）
- 金额显示：后端存"分"，前端显示"元"（`amount / 100`）

### 4.3 数据库

```bash
# 修改模型后
cd server
alembic revision --autogenerate -m "add xxx"
alembic upgrade head

# 回退
alembic downgrade -1

# 注意：开发与生产环境均使用 PostgreSQL 17
# 确保本地 PostgreSQL 服务正在运行
```

---

## 五、任务类型与处理方式

### 5.1 新增功能（里程碑驱动）

```text
输入示例："实现礼簿合并向导的第一步"

流程：
1. 确认该功能属于哪个里程碑（合并向导 → v3.0）
2. 读取需求分析文档中合并向导的定义
3. 读取 backend-api 和 frontend-page 技能文件
4. 检查 [已实现]/[待实现] 标注，确认依赖项状态
5. 检查现有代码中相关模块的结构
6. 按 后端模型→Schema→API → 前端组件→页面→路由 顺序实现
7. 运行验证（后端 curl + 前端浏览器 + 响应式三档）
8. 更新技能文件标注（将 🎯 改为 ✅）
9. 报告结果
```

### 5.2 修复 Bug

```text
输入示例："收礼记录列表金额显示不正确"

流程：
1. 定位问题文件（grep/搜索相关代码）
2. 理解当前逻辑，找到 bug 根因
3. 最小化修复，不改动无关代码
4. 验证修复 + 确认无副作用
5. 报告修复内容和验证方式
```

### 5.3 重构/优化

```text
输入示例："给所有列表端点加分页"

流程：
1. 盘点当前状态（哪些已实现、哪些未实现）
2. 制定分批计划（按里程碑优先级）
3. 逐个文件修改，每个文件修改后验证
4. 全量回归测试
5. 更新技能文件中的规范描述
```

### 5.4 文档维护

```text
输入示例："更新后端智能体文档"

流程：
1. 读取当前技能文件
2. 对照实际代码逐项检查
3. 修正不一致的地方
4. 更新 [已实现]/[待实现] 标注
5. 不添加代码中不存在的内容（保持文档反映现实）
```

---

## 六、禁止事项

| 禁止行为 | 原因 | 状态 |
| ---------- | ------ | -------- |
| 使用 `text()` 写原生 SQL | 项目要求纯 ORM 操作（SQLAlchemy 2.0+ async） | ✅ |
| 使用 `any` 类型（前端） | TypeScript strict 模式 | ✅ |
| 跳过分页直接返回全量列表 | 3000+ 记录时性能崩溃 | ✅ |
| Python 层循环做聚合 | 必须用 `func.sum()` / `func.count()` | ✅ |
| 手动修改数据库表结构 | 必须走 Alembic 迁移 | ✅ |
| 跳过 owner_id 过滤 | 数据隔离安全要求（P0） | ⚠️ 待实现 |
| 在 API 层硬编码用户 ID | 必须从 JWT 获取（PyJWT） | ✅ |
| 修改 operation_logs 表数据 | 审计日志不可变 | ✅ |
| 引入新的 CSS 文件（前端） | 统一使用 Tailwind CSS 4（@theme） | ✅ |
| 使用 npm / pip | 包管理器固定为 pnpm / uv | ✅ |
| 使用 react-router-dom（新代码） | 目标迁移至 TanStack Router | ⚠️ 当前仍在使用 |
| 使用 python-jose / bcrypt | 已替换为 PyJWT / Argon2 | ✅ |
| 使用同步 Session | 后端全异步（AsyncSession + asyncpg） | ✅ |
| 手动 memo/useCallback/useMemo | React Compiler 自动优化 | ✅ |
| import 不存在的包 | 检查技能文件 [已实现]/[待实现] 标注 | ⚠️ 常见错误 |

---

## 七、验证清单

每次任务完成后，按以下清单自查：

### 后端

- [ ] 服务能正常启动（`uvicorn app.main:app --reload`）
- [ ] 新端点返回正确格式（curl 测试）
- [ ] 数据库迁移成功（`alembic upgrade head`）
- [ ] 现有端点未被破坏（关键路径回归）
- [ ] 错误响应格式统一（HTTPException + 中文 detail）
- [ ] owner_id 过滤已添加（如适用）
- [ ] 分页参数正确（limit/offset + total_count）

### 前端

- [ ] Dev server 正常启动（`pnpm dev`）
- [ ] 新页面可访问且无白屏
- [ ] 响应式布局正常（mobile <640 / tablet 640-1280 / desktop ≥1280）
- [ ] API 调用成功（Network 面板无报错）
- [ ] TypeScript 编译无错误（`pnpm build` 通过）
- [ ] 金额显示正确（后端分 → 前端元，`amount / 100`）
- [ ] 未 import 不存在的包（检查 [待实现] 依赖）

### 通用

- [ ] 无 console.error / Python traceback
- [ ] 相关文档已更新
- [ ] 技能文件 [已实现]/[待实现] 标注已更新
- [ ] 无无关文件被修改

---

## 八、沟通规范

### 8.1 任务开始时

- 确认理解了需求（如有歧义，先问再做）
- 确认该功能属于哪个里程碑
- 简要说明计划（改哪些文件、大致思路）
- 如有多种方案，列出选项供用户选择
- 如涉及 [待实现] 依赖，说明需先安装的包

### 8.2 任务进行中

- 遇到意外情况立即说明（如发现需求与代码冲突）
- 不静默跳过错误
- 长任务中途简要汇报进度
- 发现技能文件标注与实际不符时，主动更新

### 8.3 任务完成时

- 说明做了什么（简洁，不重复代码 diff）
- 说明如何验证（具体命令或操作步骤）
- 标注遗留问题或下一步建议
- 如有文档变更，列出更新的文件
- 更新技能文件中的 [已实现]/[待实现] 标注

---

## 九、智能体使用指南

本项目配置了两个专用智能体技能：

| 智能体 | 触发场景 | 覆盖范围 | 状态标注 |
|--------|----------|----------|----------|
| `backend-api` | 编写 FastAPI 端点、ORM 模型、Pydantic Schema、Alembic 迁移 | `server/app/` 下所有文件 | ✅/🎯/⚠️ |
| `frontend-page` | 构建 React 页面、组件、Zustand Store、API 调用 | `web/src/` 下所有文件 | ✅/🎯/⚠️ |

**使用原则：**

- 涉及后端代码时，先加载 `backend-api` 技能
- 涉及前端代码时，先加载 `frontend-page` 技能
- 跨前后端的功能，两个技能都加载
- **开发前必须检查技能文件中的 [已实现]/[待实现] 标注**
- 技能文件中的 checklist 是交付前的必查项
- 完成开发后，更新技能文件中的状态标注

**状态标注含义：**

- ✅ `[已实现]` — 文件已存在，代码可用
- 🎯 `[待实现]` — 需求已定义，代码尚未开发（需先安装依赖）
- ⚠️ — 文件存在但需要更新（类型定义等；角色体系已于 2026-10-01 同步为 3 级，相关标注视为已解决）

---

## 十、里程碑规划速查

| 里程碑 | 主题 | 核心功能 | 工期 | 状态 |
| -------- | ------ | ---------- | ------ | ------ |
| **MVP 1.0** | 日常记账基础 | 日常送/收记录 + 人员管理 + 本地存储 + 统计 + JWT 认证 | 2 周 | 🔄 进行中 |
| **v1.5** | 礼簿与现场收礼 | 礼簿 CRUD + 现场收礼 + 终端设置 + 限额预警 + TanStack Query | 2 周 | 🎯 |
| **v2.0** | 多客户端协作 | WebSocket 实时同步 + 离线暂存 + 代理送礼 + TanStack Router | 2 周 | 🎯 |
| **v2.5** | 安全与审计 | 操作日志 + 对账 + 防篡改 + SheetJS 导出 + 终端锁定 | 2 周 | 🎯 |
| **v3.0** | 智能合并 + 数据管理 | 合并向导 + 精确匹配 + 数据导入 + 云同步基础 | 2 周 | 🎯 |
| **v3.5** | 家庭共享 | 家庭组 + 成员权限 + 隐私记录 + 审批机制 | 2 周 | 🎯 |
| **v4.0** | 体验优化与部署 | PWA + React Compiler + 平板横屏 + Docker Compose + PostgreSQL | 2 周 | 🎯 |
| **v4.5** | 增强安全模式 | 双安全模式 + AES-256-GCM + 助记词 + 加密导出 | 2 周 | 🎯 |
| **v5.0** | 用户管理 | 5 级角色 + owner_id 隔离 + 授权码 + 子管理员 + 多终端锁定 | 3 周 | 🎯 |

**当前重点（MVP 1.0 收尾）：**

- 完成日常记录基础功能
- 完成人员管理基础功能
- 完成统计图表基础功能
- 完成用户注册/登录

**下一步（v1.5 准备）：**

- 安装 TanStack Query（`pnpm add @tanstack/react-query`）
- 集成 TanStack Query 到现有页面
- 开始礼簿 CRUD 开发

---

## 十一、文档体系

```text
项目根目录/
├── 随礼记账本-需求分析.md        ← 功能需求（v4.1，权威源）
├── 用户管理需求规划.md            ← 用户/权限需求（v2.3）
├── ui-design-spec.md              ← UI 设计规格（v3.1）
├── 项目基本开发要求.md            ← 整合性基本要求（v3.0，本文档的上游）
├── AI开发基本流程.md              ← 本文件（AI 工作规范 v3.0）
├── AI-support.md                  ← 面向终端用户和开发者的 AI 技术支持知识库
│
├── .qoder/skills/
│   ├── backend-api/               ← 后端开发智能体技能（带 [已实现]/[待实现] 标注）
│   │   ├── SKILL.md
│   │   └── references/
│   │       ├── conventions.md     ← 编码规范
│   │       ├── data-models.md     ← 数据模型参考
│   │       └── project-structure.md ← 项目结构
│   └── frontend-page/             ← 前端开发智能体技能（带 [已实现]/[待实现] 标注）
│       ├── SKILL.md
│       └── references/
│           ├── design-system.md   ← 设计令牌
│           └── project-structure.md ← 前端结构
```

**文档优先级：** 需求文档 > 项目基本开发要求 > 智能体技能文件 > 代码注释

当文档之间出现矛盾时，以需求文档为准，并更新下游文档。

---

## 十二、快速参考

### 包管理器

- 前端：**pnpm 12+**（禁止 npm）
- 后端：**uv 0.12+**（禁止 pip）

### 常用命令

```bash
# 前端
cd web
pnpm dev              # 启动开发服务器（http://localhost:5173）
pnpm build            # 生产构建
pnpm type-check       # TypeScript 类型检查

# 后端
cd server
uv run uvicorn app.main:app --reload  # 启动开发服务器（http://localhost:8001）
uv run alembic upgrade head           # 运行数据库迁移
uv run alembic revision --autogenerate -m "description"  # 创建迁移

# 数据库
psql -U postgres -d giftregistry         # PostgreSQL 开发环境
```

### 金额处理

```python
# 后端：存储为分（Integer）
class GbRecord(Base):
    amount = Column(Integer, nullable=False)  # 单位：分

# 前端：显示为元
const displayAmount = (amountFen: number) => `¥${(amountFen / 100).toFixed(2)}`;
```

### 角色体系（已实现，2026-10-01 起）

| DB 层角色 | 应用层角色 | 来源 | 权限 |
| ---------- | ---------- | ------ | ------ |
| `super_admin` | 超级管理员 | 系统首个注册用户自动产生 | 全部系统管理权限：用户管理（含授权）、系统配置、审计日志；账户受保护（不可被改角色/禁用/删除） |
| `admin` | 系统管理员 | 超级管理员授权或直接创建 | 管理后台日常管理（用户查看/创建一般用户、公告等），**不能**授权他人为系统管理员 |
| `user` | 一般用户 | 注册用户一律为此角色 | 个人数据完全控制 |

**说明：** 早期规划中的 5 级体系（editor/viewer/auditor）与家庭成员/临时协作者角色值已下线：历史数据经迁移 `g8h9i0j1k2l3` 统一归位为 `user`，协作权限改由礼簿级协作邀请（collaboration_invites）承载，不再依赖用户角色。接口层 `RoleType` 仅接受 `super_admin | admin | user` 三值。

### 数据隔离（P0）

```python
# 所有业务表必须包含 owner_id
class Guestbook(Base):
    __tablename__ = "guestbook"
    id = Column(Integer, primary_key=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # ...

# 所有查询必须过滤 owner_id
select(Guestbook).where(Guestbook.owner_id == current_user.id)
```

---

*本文档定义 AI 辅助开发的基本流程与规范（v3.0 里程碑版）。核心改进：引入 [已实现]/[待实现] 状态标注体系、里程碑驱动开发、双轨代码模式、项目现状概览。所有 AI 开发任务应遵循此流程执行。*
