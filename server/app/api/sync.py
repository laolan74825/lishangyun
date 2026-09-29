"""同步 API — 增量拉取 + 批量推送

实现 IndexedDB ↔ PostgreSQL 的本地优先同步框架。
"""
from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy import Date, DateTime

from app.core.dependencies import CurrentUser, DbSession
from app.core.helpers import write_audit_log
from app.models.daily_record import DailyRecord
from app.models.gb_record import GbRecord
from app.models.person import Person

router = APIRouter(prefix="/sync", tags=["sync"])


# ==================== Schemas ====================

class SyncPullTableRequest(BaseModel):
    """单表拉取请求"""
    since_version: int = Field(..., ge=0, description="自此版本号之后的变更")
    limit: int = Field(1000, ge=1, le=5000, description="单次最大返回记录数")


class SyncPullRequest(BaseModel):
    """增量拉取请求"""
    client_id: str = Field(..., description="客户端唯一标识")
    tables: dict[str, SyncPullTableRequest] = Field(
        ...,
        description="各表拉取请求",
        examples=[{
            "daily_records": {"since_version": 42},
            "persons": {"since_version": 18},
            "gb_records": {"since_version": 105},
        }],
    )


class SyncDelta(BaseModel):
    """单表变更增量"""
    created: list[dict[str, Any]]
    updated: list[dict[str, Any]]
    deleted: list[dict[str, Any]]


class SyncPullResponse(BaseModel):
    """增量拉取响应"""
    changes: dict[str, SyncDelta]
    server_version: int = Field(..., description="服务端当前最高版本号")


class SyncPushRequest(BaseModel):
    """批量推送请求"""
    client_id: str = Field(..., description="客户端唯一标识")
    changes: dict[str, list[dict[str, Any]]] = Field(
        ...,
        description="各表待推送记录",
    )


class Conflict(BaseModel):
    """冲突记录"""
    table: str
    local: dict[str, Any]
    remote: dict[str, Any]
    conflict_type: str = Field(..., description="update_update | update_delete | create_create")


class SyncPushResponse(BaseModel):
    """批量推送响应"""
    accepted: list[dict[str, Any]] = Field(..., description="已接受的记录")
    conflicts: list[Conflict] = Field(..., description="冲突记录")


# ==================== Helpers ====================

MODEL_MAP = {
    "daily_records": DailyRecord,
    "gb_records": GbRecord,
    "persons": Person,
}


def model_to_dict(record: DailyRecord | GbRecord | Person) -> dict[str, Any]:
    """ORM 模型转字典"""
    result = {}
    for column in record.__table__.columns:
        value = getattr(record, column.name)
        if isinstance(value, datetime):
            value = value.isoformat()
        elif isinstance(value, date):
            value = value.isoformat()
        result[column.name] = value
    return result


def _convert_date_fields(record_data: dict[str, Any], model: type) -> dict[str, Any]:
    """将日期字符串转换为 date/datetime 对象"""
    converted = record_data.copy()
    for column in model.__table__.columns:
        col_name = column.name
        if col_name not in converted:
            continue
        value = converted[col_name]
        if not isinstance(value, str):
            continue
        if isinstance(column.type, DateTime):
            try:
                converted[col_name] = datetime.fromisoformat(value)
            except (ValueError, TypeError):
                pass
        elif isinstance(column.type, Date):
            try:
                converted[col_name] = date.fromisoformat(value)
            except (ValueError, TypeError):
                pass
    return converted


# ==================== API Endpoints ====================

@router.post("/pull", response_model=SyncPullResponse)
async def sync_pull(
    request: SyncPullRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> SyncPullResponse:
    """增量拉取

    客户端传递各表的 since_version，服务端返回自此版本以来的变更。
    """
    changes = {}
    max_version = 0

    for table_name, table_req in request.tables.items():
        if table_name not in MODEL_MAP:
            raise HTTPException(400, f"不支持的表：{table_name}")

        model = MODEL_MAP[table_name]
        since_version = table_req.since_version
        limit = table_req.limit

        # 查询变更：sync_version > since_version OR is_deleted = true
        stmt = select(model).where(
            model.owner_id == current_user.id,
            or_(
                model.sync_version > since_version,
                model.is_deleted == True,
            ),
        ).order_by(model.sync_version.asc()).limit(limit)

        result = await db.execute(stmt)
        records = result.scalars().all()

        # 分离 created/updated/deleted
        created = []
        updated = []
        deleted = []

        for record in records:
            record_dict = model_to_dict(record)

            if record.is_deleted:
                deleted.append({"id": record.id, "uuid": record.uuid})
            elif record.sync_version == 1:
                created.append(record_dict)
            else:
                updated.append(record_dict)

            # 更新 max_version
            if record.sync_version > max_version:
                max_version = record.sync_version

        changes[table_name] = SyncDelta(
            created=created,
            updated=updated,
            deleted=deleted,
        )

    return SyncPullResponse(
        changes=changes,
        server_version=max_version,
    )


@router.post("/push", response_model=SyncPushResponse)
async def sync_push(
    request: SyncPushRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> SyncPushResponse:
    """批量推送

    客户端将本地变更批量推送至服务端。
    服务端检测冲突并返回接受/冲突列表。
    """
    accepted = []
    conflicts = []

    for table_name, records in request.changes.items():
        if table_name not in MODEL_MAP:
            raise HTTPException(400, f"不支持的表：{table_name}")

        model = MODEL_MAP[table_name]

        for record_data in records:
            uuid = record_data.get("uuid")
            if not uuid:
                continue

            # 金额验证（如果存在）
            if "amount" in record_data:
                amount = record_data["amount"]
                if not isinstance(amount, int) or amount < 100 or amount > 10000000:
                    continue  # 跳过无效金额

            # 查找服务端记录（包括已删除的）
            stmt = select(model).where(
                model.owner_id == current_user.id,
                model.uuid == uuid,
            )
            result = await db.execute(stmt)
            existing = result.scalar_one_or_none()

            # 处理软删除
            if record_data.get("is_deleted") and not record_data.get("deleted_at"):
                record_data["deleted_at"] = datetime.utcnow()

            if not existing:
                # 检查 UUID 是否已被其他用户占用
                uuid_exists_stmt = select(model.id).where(model.uuid == uuid)
                uuid_exists_result = await db.execute(uuid_exists_stmt)
                if uuid_exists_result.scalar_one_or_none() is not None:
                    # UUID 已存在，跳过此记录
                    continue

                # 新建
                record_data["owner_id"] = current_user.id
                converted_data = _convert_date_fields(record_data, model)
                # 排除 id 字段，让数据库自动生成
                converted_data.pop("id", None)
                new_record = model(**converted_data)
                db.add(new_record)
                await db.flush()

                # 写入审计日志
                write_audit_log(
                    db,
                    owner_id=current_user.id,
                    target_table=table_name.rstrip("s"),  # daily_records -> daily_record
                    target_id=new_record.id,
                    action_type="CREATE",
                    after=new_record,
                    note=f"Sync from client {request.client_id}",
                )

                accepted.append({
                    "table": table_name,
                    "id": new_record.id,
                    "uuid": uuid,
                })

            elif existing.is_deleted and not record_data.get("is_deleted"):
                # 恢复已删除记录
                converted_data = _convert_date_fields(record_data, model)
                for key, value in converted_data.items():
                    if key not in ["id", "uuid", "owner_id"]:
                        setattr(existing, key, value)
                existing.sync_version += 1

                write_audit_log(
                    db,
                    owner_id=current_user.id,
                    target_table=table_name.rstrip("s"),
                    target_id=existing.id,
                    action_type="UPDATE",
                    before={"is_deleted": True},
                    after=existing,
                    note=f"Sync restore from client {request.client_id}",
                )

                accepted.append({
                    "table": table_name,
                    "id": existing.id,
                    "uuid": uuid,
                })

            elif existing.sync_version < record_data.get("sync_version", 0):
                # 更新（本地版本更新）
                old_data = {c.name: getattr(existing, c.name) for c in existing.__table__.columns}
                converted_data = _convert_date_fields(record_data, model)

                for key, value in converted_data.items():
                    if key not in ["id", "uuid", "owner_id"]:
                        setattr(existing, key, value)
                existing.sync_version += 1

                # 写入审计日志
                write_audit_log(
                    db,
                    owner_id=current_user.id,
                    target_table=table_name.rstrip("s"),
                    target_id=existing.id,
                    action_type="UPDATE",
                    before=old_data,
                    after=existing,
                    note=f"Sync from client {request.client_id}",
                )

                accepted.append({
                    "table": table_name,
                    "id": existing.id,
                    "uuid": uuid,
                })

            elif existing.sync_version > record_data.get("sync_version", 0):
                # 冲突：服务端版本更新
                conflicts.append(Conflict(
                    table=table_name,
                    local=record_data,
                    remote=model_to_dict(existing),
                    conflict_type="update_update",
                ))

            else:
                # 版本相同，比较 updated_at
                local_updated_at = record_data.get("updated_at")
                if local_updated_at:
                    if isinstance(local_updated_at, str):
                        local_updated_at = datetime.fromisoformat(local_updated_at)

                    if existing.updated_at < local_updated_at:
                        # 本地更新，接受
                        old_data = {c.name: getattr(existing, c.name) for c in existing.__table__.columns}
                        converted_data = _convert_date_fields(record_data, model)

                        for key, value in converted_data.items():
                            if key not in ["id", "uuid", "owner_id"]:
                                setattr(existing, key, value)
                        existing.sync_version += 1

                        write_audit_log(
                            db,
                            owner_id=current_user.id,
                            target_table=table_name.rstrip("s"),
                            target_id=existing.id,
                            action_type="UPDATE",
                            before=old_data,
                            after=existing,
                            note=f"Sync from client {request.client_id}",
                        )

                        accepted.append({
                            "table": table_name,
                            "id": existing.id,
                            "uuid": uuid,
                        })
                    else:
                        # 冲突
                        conflicts.append(Conflict(
                            table=table_name,
                            local=record_data,
                            remote=model_to_dict(existing),
                            conflict_type="update_update",
                        ))

    await db.commit()
    return SyncPushResponse(
        accepted=accepted,
        conflicts=conflicts,
    )


@router.get("/status")
async def sync_status(
    current_user: CurrentUser,
    db: DbSession,
) -> dict[str, int]:
    """获取各表最高版本号"""
    result = {}

    for table_name, model in MODEL_MAP.items():
        stmt = select(model.sync_version).where(
            model.owner_id == current_user.id,
        ).order_by(model.sync_version.desc())
        row = (await db.execute(stmt)).first()

        result[table_name] = row[0] if row else 0

    return result
