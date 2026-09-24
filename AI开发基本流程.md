# 随礼记账本 — AI 辅助开发基本流程（v2.0 现代化版）

> 文档版本：v2.0
> 编制日期：2026-09-21
> 现代化更新：2026-09-21
> 适用对象：AI 开发助手（Qoder 等）
> 关联文档：项目基本开发要求.md（v2.0）、各智能体技能文件（backend-api、frontend-page）
> 技术栈：React 19.3 + Compiler / TanStack Router / TanStack Query 5 / Tailwind CSS 4 / Python 3.14 / FastAPI / SQLAlchemy 2.0+ async / Argon2

---

## 一、核心原则

1. **需求文档优先**：所有开发以 `.md` 需求文档为准，不凭记忆或推测。动手前先读文档。
2. **最小变更**：每次只做一个明确的功能点或修复，不夹带无关改动。
3. **可验证**：每次交付必须说明如何验证（运行命令、测试步骤、预期结果）。
4. **不破坏现有功能**：改动前确认影响范围，回归测试关键路径。
5. **保持文档同步**：代码变更后，相关文档（技能文件、需求文档）同步更新。

---

## 二、开发流程（单次任务）

```
┌─────────────────────────────────────────────────────────────┐
│                    AI 开发单次任务流程                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ① 理解任务                                                │
│     ├─ 读取相关需求文档（确认功能点、验收标准）              │
│     ├─ 读取相关技能文件（backend-api / frontend-page）       │
│     └─ 确认当前代码状态（git status、相关文件）              │
│                                                             │
│  ② 规划方案                                                │
│     ├─ 列出需要修改/新增的文件                              │
│     ├─ 确认技术选型与现有模式一致                            │
│     └─ 如有多种方案，先与用户讨论再动手                      │
│                                                             │
│  ③ 实现代码                                                │
│     ├─ 遵循项目编码规范（见下方第三节）                      │
│     ├─ 后端：模型 → Schema → API → 迁移                    │
│     ├─ 前端：组件 → Store → API 调用 → 路由                │
│     └─ 每完成一个文件，检查语法和类型                        │
│                                                             │
│  ④ 验证                                                    │
│     ├─ 后端：启动服务 + curl/浏览器测试端点                  │
│     ├─ 前端：启动 dev server + 浏览器检查页面                │
│     ├─ 数据库：运行迁移 + 确认表结构                        │
│     └─ 报告验证结果（通过/失败 + 原因）                      │
│                                                             │
│  ⑤ 收尾                                                    │
│     ├─ 更新相关文档（如有变更）                              │
│     ├─ 简要说明做了什么、怎么验证                            │
│     └─ 标注遗留问题或下一步建议                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、编码规范速查

### 3.1 后端（Python 3.14 / FastAPI / SQLAlchemy 2.0+ async）

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
        .where(Item.owner_id == current_user.id)
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
```

### 3.2 前端（React 19 + Compiler / TanStack Router / TanStack Query 5 / Tailwind CSS 4）

```typescript
// 组件基本结构（React Compiler 自动优化，无需手动 memo）
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';

interface Props {
  guestbookId: number;
}

export function CollectPage({ guestbookId }: Props) {
  const [amount, setAmount] = useState<string>('');

  // TanStack Query：服务端状态（自动缓存/失效重取/乐观更新）
  const { data: records, isLoading } = useQuery({
    queryKey: queryKeys.gbRecords.list(guestbookId),
    queryFn: () => apiClient.getRecords(guestbookId),
  });

  // 渲染
  return (
    <div className="p-spacing-md max-w-lg mx-auto">
      {/* Tailwind CSS 4：使用 @theme 中定义的 Token 类名 */}
      {/* 容器查询：@container + @md: 前缀 */}
    </div>
  );
}

// 规则：
// - TypeScript strict，禁止 any
// - 服务端状态用 TanStack Query 5（queryKey 工厂函数模式）
// - 客户端状态用 Zustand 5（终端设置/UI/锁定）
// - API 调用通过 api-client + TanStack Query 的 queryFn
// - 日期用 dayjs
// - 样式用 Tailwind CSS 4（@theme Token，不引入额外 CSS）
// - 路由用 TanStack Router（编译时类型安全，beforeLoad 权限守卫）
```

### 3.3 数据库

```bash
# 修改模型后
cd server
alembic revision --autogenerate -m "add xxx"
alembic upgrade head

# 回退
alembic downgrade -1
```

---

## 四、任务类型与处理方式

### 4.1 新增功能

```
输入示例："实现礼簿合并向导的第一步"

流程：
1. 读取需求分析文档中合并向导的定义
2. 读取 backend-api 和 frontend-page 技能文件
3. 检查现有代码中相关模块的结构
4. 按 后端模型→Schema→API → 前端组件→页面→路由 顺序实现
5. 运行验证
6. 报告结果
```

### 4.2 修复 Bug

```
输入示例："收礼记录列表金额显示不正确"

流程：
1. 定位问题文件（grep/搜索相关代码）
2. 理解当前逻辑，找到 bug 根因
3. 最小化修复，不改动无关代码
4. 验证修复 + 确认无副作用
5. 报告修复内容和验证方式
```

### 4.3 重构/优化

```
输入示例："给所有列表端点加分页"

流程：
1. 盘点当前状态（哪些已实现、哪些未实现）
2. 制定分批计划
3. 逐个文件修改，每个文件修改后验证
4. 全量回归测试
5. 更新技能文件中的规范描述
```

### 4.4 文档维护

```
输入示例："更新后端智能体文档"

流程：
1. 读取当前技能文件
2. 对照实际代码逐项检查
3. 修正不一致的地方
4. 不添加代码中不存在的内容（保持文档反映现实）
```

---

## 五、禁止事项

| 禁止行为 | 原因 |
|----------|------|
| 使用 `text()` 写原生 SQL | 项目要求纯 ORM 操作（SQLAlchemy 2.0+ async） |
| 使用 `any` 类型（前端） | TypeScript strict 模式 |
| 跳过分页直接返回全量列表 | 3000+ 记录时性能崩溃 |
| Python 层循环做聚合 | 必须用 `func.sum()` / `func.count()` |
| 手动修改数据库表结构 | 必须走 Alembic 迁移 |
| 跳过 owner_id 过滤（添加后） | 数据隔离安全要求 |
| 在 API 层硬编码用户 ID | 必须从 JWT 获取（PyJWT） |
| 修改 operation_logs 表数据 | 审计日志不可变 |
| 引入新的 CSS 文件（前端） | 统一使用 Tailwind CSS 4（@theme） |
| 使用 npm / pip | 包管理器固定为 pnpm / uv |
| 使用 react-router-dom | 路由已迁移至 TanStack Router |
| 使用 python-jose / bcrypt | 已替换为 PyJWT / Argon2 |
| 使用同步 Session | 后端全异步（AsyncSession + asyncpg/aiosqlite） |
| 手动 memo/useCallback/useMemo | React Compiler 自动优化 |

---

## 六、验证清单

每次任务完成后，按以下清单自查：

### 后端

- [ ] 服务能正常启动（`uvicorn app.main:app --reload`）
- [ ] 新端点返回正确格式（curl 测试）
- [ ] 数据库迁移成功（`alembic upgrade head`）
- [ ] 现有端点未被破坏（关键路径回归）
- [ ] 错误响应格式统一（HTTPException + 中文 detail）

### 前端

- [ ] Dev server 正常启动（`pnpm dev`）
- [ ] 新页面可访问且无白屏
- [ ] 响应式布局正常（mobile/tablet/desktop）
- [ ] API 调用成功（Network 面板无报错）
- [ ] TypeScript 编译无错误（`pnpm build` 通过）

### 通用

- [ ] 无 console.error / Python traceback
- [ ] 相关文档已更新
- [ ] 无无关文件被修改

---

## 七、沟通规范

### 7.1 任务开始时

- 确认理解了需求（如有歧义，先问再做）
- 简要说明计划（改哪些文件、大致思路）
- 如有多种方案，列出选项供用户选择

### 7.2 任务进行中

- 遇到意外情况立即说明（如发现需求与代码冲突）
- 不静默跳过错误
- 长任务中途简要汇报进度

### 7.3 任务完成时

- 说明做了什么（简洁，不重复代码 diff）
- 说明如何验证（具体命令或操作步骤）
- 标注遗留问题或下一步建议
- 如有文档变更，列出更新的文件

---

## 八、智能体使用指南

本项目配置了两个专用智能体技能：

| 智能体 | 触发场景 | 覆盖范围 |
|--------|----------|----------|
| `backend-api` | 编写 FastAPI 端点、ORM 模型、Pydantic Schema、Alembic 迁移 | `server/app/` 下所有文件 |
| `frontend-page` | 构建 React 页面、组件、Zustand Store、API 调用 | `web/src/` 下所有文件 |

**使用原则：**
- 涉及后端代码时，先加载 `backend-api` 技能
- 涉及前端代码时，先加载 `frontend-page` 技能
- 跨前后端的功能，两个技能都加载
- 技能文件中的 checklist 是交付前的必查项

---

## 九、文档体系

```
项目根目录/
├── 随礼记账本-需求分析.md        ← 功能需求（v3.1，权威源）
├── 用户管理需求规划.md            ← 用户/权限需求（v2.0）
├── ui-design-spec.md              ← UI 设计规格（v2.0）
├── 项目基本开发要求.md            ← 整合性基本要求（v2.0，本文档的上游）
├── AI开发基本流程.md              ← 本文件（AI 工作规范 v2.0）
│
├── .qoder/skills/
│   ├── backend-api/               ← 后端开发智能体技能
│   │   ├── SKILL.md
│   │   └── references/
│   │       ├── conventions.md     ← 编码规范
│   │       ├── data-models.md     ← 数据模型参考
│   │       └── project-structure.md ← 项目结构
│   └── frontend-page/             ← 前端开发智能体技能
│       ├── SKILL.md
│       └── references/
│           ├── design-system.md   ← 设计令牌
│           └── project-structure.md ← 前端结构
```

**文档优先级：** 需求文档 > 项目基本开发要求 > 智能体技能文件 > 代码注释

当文档之间出现矛盾时，以需求文档为准，并更新下游文档。

---

*本文档定义 AI 辅助开发的基本流程与规范（v2.0）。技术栈已全面现代化：异步全栈（AsyncSession + async def）、TanStack Router/Query、Tailwind CSS 4、Argon2 + PyJWT。所有 AI 开发任务应遵循此流程执行。*
