from datetime import date as date_type, datetime, timezone
from app.core.time import utcnow
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, update

from app.core.dependencies import CurrentUser, DbSession, require_role
from app.core.helpers import paginate_query
from app.models.gb_record import GbRecord
from app.models.guestbook import Guestbook
from app.models.payment_account import PaymentAccount
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.payment_account import PaymentAccountCreate, PaymentAccountResponse, PaymentAccountUpdate

# 收款账户管理 API 路由
# 支持两种账户类型：cash（收银员/现金）和 wechat（微信账户）
# 每种类型只能有一个 is_active=True 的账户作为"系统默认"
router = APIRouter(prefix="/payment-accounts", tags=["payment-accounts"])

# 角色权限定义：
# EditorUser: 可创建/编辑账户（super_admin, admin, user, collaborator）
# OwnerUser: 可删除账户（super_admin, admin, user，不包括 collaborator）
EditorUser = Annotated[User, Depends(require_role("super_admin", "admin", "user", "collaborator"))]
OwnerUser = Annotated[User, Depends(require_role("super_admin", "admin", "user"))]


# 列出当前用户的所有收款账户（分页）
# 支持按类型筛选（type=cash/wechat）和仅显示激活账户（active_only=true）
# 所有查询必须过滤 owner_id == current_user.id（数据隔离）和 is_deleted == False（软删除）
@router.get("/", response_model=PaginatedResponse[PaymentAccountResponse])
async def list_accounts(
    current_user: CurrentUser,
    db: DbSession,
    type: str | None = None,  # 可选筛选：cash 或 wechat
    active_only: bool = Query(False),  # 是否仅返回 is_active=True 的账户
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    # 基础查询：当前用户的未删除账户，按创建顺序排列
    stmt = (
        select(PaymentAccount)
        .where(PaymentAccount.owner_id == current_user.id, PaymentAccount.is_deleted == False)
        .order_by(PaymentAccount.id)
    )
    # 按类型筛选
    if type:
        stmt = stmt.where(PaymentAccount.type == type)
    # 仅显示激活账户
    if active_only:
        stmt = stmt.where(PaymentAccount.is_active == True)
    # 执行分页查询
    items, pagination = await paginate_query(db, stmt, page, page_size)
    return PaginatedResponse(items=items, pagination=pagination)


# 各收款账户在指定状态礼簿中的收款汇总（账户统计用）
# 必须定义在 /{account_id} 之前，否则会被路径参数路由拦截
@router.get("/received-summary")
async def received_summary(
    current_user: CurrentUser,
    db: DbSession,
    guestbook_status: str = Query("active", description="按礼簿状态筛选：active/closing/archived"),
):
    """各收款账户在指定状态礼簿中的收款汇总（账户统计用）。

    返回每个账户的笔数、金额，以及今日已收金额（跨全部礼簿，用于微信每日限额）。
    """
    # 今日时间范围（本地日期换算为 UTC，与 received-today 口径一致）
    today = datetime.now(timezone.utc).astimezone()
    start = datetime.combine(today.date(), datetime.min.time()).astimezone(timezone.utc).replace(tzinfo=None)
    end = datetime.combine(today.date(), datetime.max.time()).astimezone(timezone.utc).replace(tzinfo=None)

    # 按账户聚合：指定状态礼簿中的收款（记录需归属未删除礼簿）
    stmt = (
        select(
            GbRecord.account_id,
            func.count(GbRecord.id).label("record_count"),
            func.coalesce(func.sum(GbRecord.amount), 0).label("total_amount"),
        )
        .join(Guestbook, GbRecord.guestbook_id == Guestbook.id)
        .where(
            GbRecord.owner_id == current_user.id,
            GbRecord.is_deleted == False,
            GbRecord.account_id.isnot(None),
            Guestbook.is_deleted == False,
            Guestbook.status == guestbook_status,
        )
        .group_by(GbRecord.account_id)
    )
    rows = (await db.execute(stmt)).all()

    # 今日各账户已收（跨全部礼簿）
    today_stmt = (
        select(
            GbRecord.account_id,
            func.coalesce(func.sum(GbRecord.amount), 0).label("today_amount"),
        )
        .where(
            GbRecord.owner_id == current_user.id,
            GbRecord.is_deleted == False,
            GbRecord.account_id.isnot(None),
            GbRecord.record_time >= start,
            GbRecord.record_time <= end,
        )
        .group_by(GbRecord.account_id)
    )
    today_map = {r[0]: r[1] for r in (await db.execute(today_stmt)).all()}

    return [
        {
            "account_id": r[0],
            "record_count": r[1],
            "total_amount": r[2],
            "today_received": today_map.get(r[0], 0),
        }
        for r in rows
    ]


# 获取单个账户详情
# 必须验证 owner_id（数据隔离）和 is_deleted（软删除）
@router.get("/{account_id}", response_model=PaymentAccountResponse)
async def get_account(account_id: int, current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(PaymentAccount)
        .where(PaymentAccount.id == account_id, PaymentAccount.owner_id == current_user.id,
               PaymentAccount.is_deleted == False)
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="账户不存在")
    return account


# 创建新收款账户
# 关键逻辑：如果新账户设置为 is_active=True，则自动将同类型的其他激活账户设为 is_active=False
# 这确保每种类型（cash/wechat）只有一个激活账户作为"系统默认"
# 解决了之前多个账户同时 is_active=True 导致的歧义问题
@router.post("/", response_model=int)
async def create_account(
    body: PaymentAccountCreate,
    db: DbSession,
    current_user: EditorUser,
):
    dup = await db.execute(
        select(PaymentAccount.id).where(
            PaymentAccount.owner_id == current_user.id,
            PaymentAccount.name == body.name,
            PaymentAccount.is_deleted == False,
        )
    )
    if dup.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="账户名称不能重复")
    if body.is_active:
        # 批量更新：将同类型的所有激活账户设为 is_active=False
        # 条件：同一 owner、同一 type、当前 is_active=True、未删除、未停用
        await db.execute(
            update(PaymentAccount)
            .where(
                PaymentAccount.owner_id == current_user.id,
                PaymentAccount.type == body.type,
                PaymentAccount.is_active == True,
                PaymentAccount.is_deleted == False,
            )
            .values(is_active=False, updated_at=utcnow())
        )
    # 停用账户不能同时是默认账户：强制 is_active=False
    is_active = body.is_active and not body.is_disabled
    # 创建新账户实例
    account = PaymentAccount(owner_id=current_user.id, **{**body.model_dump(), "is_active": is_active})
    db.add(account)
    await db.flush()  #  flush 确保 ID 生成
    await db.commit()
    return account.id


# 更新收款账户
# 关键逻辑：如果将账户设为 is_active=True，则自动将同类型的其他激活账户设为 is_active=False
# 这确保每种类型只有一个激活账户，避免"系统默认"解析歧义
@router.put("/{account_id}")
async def update_account(
    account_id: int,
    body: PaymentAccountUpdate,
    db: DbSession,
    current_user: EditorUser,
):
    # 查询目标账户（验证 owner_id 和 is_deleted）
    result = await db.execute(
        select(PaymentAccount)
        .where(PaymentAccount.id == account_id, PaymentAccount.owner_id == current_user.id,
               PaymentAccount.is_deleted == False)
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="账户不存在")
    # 获取要更新的字段（exclude_unset=True 表示只更新请求中提供的字段）
    updates = body.model_dump(exclude_unset=True)
    new_name = updates.get("name")
    if new_name is not None and new_name != account.name:
        dup = await db.execute(
            select(PaymentAccount.id).where(
                PaymentAccount.owner_id == current_user.id,
                PaymentAccount.name == new_name,
                PaymentAccount.id != account_id,
                PaymentAccount.is_deleted == False,
            )
        )
        if dup.scalar_one_or_none() is not None:
            raise HTTPException(status_code=400, detail="账户名称不能重复")
    if updates.get("is_active") is True:
        # 已停用的账户不能设为默认账户
        if account.is_disabled or updates.get("is_disabled") is True:
            raise HTTPException(status_code=400, detail="账户已停用，不能设为默认账户")
        # 批量更新：排除当前账户自身（id != account_id）
        await db.execute(
            update(PaymentAccount)
            .where(
                PaymentAccount.owner_id == current_user.id,
                PaymentAccount.type == account.type,  # 同类型
                PaymentAccount.id != account_id,  # 排除自身
                PaymentAccount.is_active == True,
                PaymentAccount.is_deleted == False,
            )
            .values(is_active=False, updated_at=utcnow())
        )
    # 应用更新到账户对象
    for k, v in updates.items():
        setattr(account, k, v)
    # 停用账户同时取消其默认身份，避免"已停用但仍为系统默认"的歧义
    if account.is_disabled:
        account.is_active = False
    account.updated_at = utcnow()
    await db.commit()
    return {"message": "已更新"}


# 删除收款账户（软删除）
# 仅标记 is_deleted=True 和 deleted_at，不物理删除记录
# 只有 OwnerUser（super_admin, admin, user）可删除，collaborator 无权限
@router.delete("/{account_id}")
async def delete_account(
    account_id: int,
    db: DbSession,
    current_user: OwnerUser,
):
    # 查询目标账户
    result = await db.execute(
        select(PaymentAccount)
        .where(PaymentAccount.id == account_id, PaymentAccount.owner_id == current_user.id,
               PaymentAccount.is_deleted == False)
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="账户不存在")
    # 软删除：标记 is_deleted 和 deleted_at
    account.is_deleted = True
    account.deleted_at = utcnow()
    await db.commit()
    return {"message": "已删除"}


# 查询指定账户在某一天的收款总额
# 用于显示微信账户的每日限额使用情况
# 可选按礼簿筛选（guestbook_id）
@router.get("/{account_id}/received-today")
async def received_today(
    account_id: int,
    current_user: CurrentUser,
    db: DbSession,
    date: str = Query(..., description="YYYY-MM-DD"),  # 查询日期
    guestbook_id: int | None = None,  # 可选：按礼簿筛选
):
    # 解析日期字符串为 date 对象
    query_date = datetime.strptime(date, "%Y-%m-%d").date()
    # record_time 以无时区 UTC 存储，查询的"某天"按本地日期理解，
    # 需把本地日期的起止换算成 UTC 时间范围，避免时区错位导致漏数
    start = datetime.combine(query_date, datetime.min.time()).astimezone(timezone.utc).replace(tzinfo=None)
    end = datetime.combine(query_date, datetime.max.time()).astimezone(timezone.utc).replace(tzinfo=None)
    # 构建查询条件
    conditions = [
        GbRecord.account_id == account_id,  # 指定账户
        GbRecord.owner_id == current_user.id,  # 数据隔离
        GbRecord.record_time >= start,  # 时间范围起始
        GbRecord.record_time <= end,  # 时间范围结束
        GbRecord.is_deleted == False,  # 软删除过滤
    ]
    # 如果指定了礼簿 ID，增加礼簿筛选条件
    if guestbook_id is not None:
        conditions.append(GbRecord.guestbook_id == guestbook_id)
    # 聚合查询：计算金额总和（单位：分）
    # 使用 func.coalesce 确保即使没有记录也返回 0 而不是 NULL
    total = (await db.execute(
        select(func.coalesce(func.sum(GbRecord.amount), 0)).select_from(GbRecord).where(*conditions)
    )).scalar_one()
    return {"received": total}
