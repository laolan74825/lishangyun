import json
from datetime import datetime
from app.core.time import utcnow
from app.core.user_id import add_user_with_generated_id

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_role
from app.core.security import hash_password
from app.database import get_db
from app.models.daily_record import DailyRecord
from app.models.gb_record import GbRecord
from app.models.guestbook import Guestbook
from app.models.operation_log import OperationLog
from app.models.payment_account import PaymentAccount
from app.models.person import Person
from app.models.terminal_settings import TerminalSettings
from app.models.user import User
from app.schemas.migration import MigrationPayload, MigrationResult

router = APIRouter(prefix="/migration", tags=["migration"])


@router.post("/import", response_model=MigrationResult)
async def import_data(
    body: MigrationPayload,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("super_admin", "admin")),
):
    owner_id = body.owner_id if body.owner_id else 1

    for p in body.persons:
        person = Person(
            owner_id=p.get("owner_id", owner_id),
            name=p.get("name", ""),
            nickname=p.get("nickname"),
            phone=p.get("phone"),
            _aliases=json.dumps(p.get("aliases", []), ensure_ascii=False),
            relationship_tag=p.get("relationship_tag", p.get("relation_tag", "other")),
            note=p.get("note"),
            is_private=p.get("is_private", False),
            sync_version=p.get("sync_version", 0),
            created_at=datetime.fromisoformat(p["created_at"]) if p.get("created_at") else utcnow(),
            updated_at=datetime.fromisoformat(p["updated_at"]) if p.get("updated_at") else utcnow(),
        )
        if p.get("id"):
            person.id = p["id"]
        db.add(person)

    for a in body.payment_accounts:
        account = PaymentAccount(
            owner_id=a.get("owner_id", owner_id),
            name=a.get("name", ""),
            type=a.get("type", "cash"),
            identifier=a.get("identifier"),
            daily_limit=a.get("daily_limit", 20000000),
            qr_code=a.get("qr_code"),
            is_active=a.get("is_active", True),
            created_at=datetime.fromisoformat(a["created_at"]) if a.get("created_at") else utcnow(),
            updated_at=datetime.fromisoformat(a["updated_at"]) if a.get("updated_at") else utcnow(),
        )
        if a.get("id"):
            account.id = a["id"]
        db.add(account)

    for g in body.guestbooks:
        status = g.get("status", "active")
        if status == "已完成":
            status = "archived"
        elif status == "收礼中":
            status = "active"
        gb = Guestbook(
            owner_id=g.get("owner_id", owner_id),
            name=g.get("name", ""),
            event_type=g.get("event_type", "other"),
            event_date=g.get("event_date"),
            status=status,
            host_person_id=g.get("host_person_id"),
            operator_note=g.get("operator_note"),
            created_at=datetime.fromisoformat(g["created_at"]) if g.get("created_at") else utcnow(),
            updated_at=datetime.fromisoformat(g["updated_at"]) if g.get("updated_at") else utcnow(),
            closing_at=datetime.fromisoformat(g["closing_at"]) if g.get("closing_at") else None,
            archived_at=datetime.fromisoformat(g["archived_at"]) if g.get("archived_at") else (
                datetime.fromisoformat(g["completed_at"]) if g.get("completed_at") else None
            ),
        )
        if g.get("id"):
            gb.id = g["id"]
        db.add(gb)

    for r in body.gb_records:
        record = GbRecord(
            uuid=r.get("uuid", ""),
            owner_id=r.get("owner_id", owner_id),
            guestbook_id=r.get("guestbook_id"),
            person_id=r.get("person_id"),
            guest_name=r.get("guest_name", ""),
            phone=r.get("phone"),
            amount=r.get("amount", 0),
            payment_method=r.get("payment_method", "cash"),
            account_id=r.get("account_id"),
            note=r.get("note"),
            agent_name=r.get("agent_name"),
            check_status=r.get("check_status", "unchecked"),
            record_time=datetime.fromisoformat(r["record_time"]) if r.get("record_time") else utcnow(),
            client_id=r.get("client_id"),
            operator_name=r.get("operator_name"),
            is_private=r.get("is_private", False),
            sync_version=r.get("sync_version", 0),
            created_at=datetime.fromisoformat(r["created_at"]) if r.get("created_at") else utcnow(),
            updated_at=datetime.fromisoformat(r["updated_at"]) if r.get("updated_at") else utcnow(),
        )
        if r.get("id"):
            record.id = r["id"]
        db.add(record)

    for d in body.daily_records:
        dr = DailyRecord(
            uuid=d.get("uuid", ""),
            owner_id=d.get("owner_id", owner_id),
            type=d.get("type", "out"),
            person_id=d.get("person_id"),
            person_name=d.get("person_name", ""),
            phone=d.get("phone"),
            amount=d.get("amount", 0),
            event_type=d.get("event_type", "other"),
            payment_method=d.get("payment_method"),
            account_id=d.get("account_id"),
            event_date=d.get("event_date"),
            note=d.get("note"),
            source=d.get("source", "daily"),
            source_id=d.get("source_id"),
            created_by=d.get("created_by"),
            is_private=d.get("is_private", False),
            sync_version=d.get("sync_version", 0),
            created_at=datetime.fromisoformat(d["created_at"]) if d.get("created_at") else utcnow(),
            updated_at=datetime.fromisoformat(d["updated_at"]) if d.get("updated_at") else utcnow(),
        )
        if d.get("id"):
            dr.id = d["id"]
        db.add(dr)

    for o in body.operation_logs:
        log = OperationLog(
            owner_id=o.get("owner_id", owner_id),
            target_table=o.get("target_table", "gb_records"),
            target_id=o.get("target_id", o.get("gb_record_id", 0)),
            guestbook_id=o.get("guestbook_id"),
            action_type=o.get("action_type", "CREATE"),
            operator_name=o.get("operator_name"),
            client_id=o.get("client_id"),
            before_data=o.get("before_data"),
            after_data=o.get("after_data"),
            note=o.get("note"),
            created_at=datetime.fromisoformat(o["created_at"]) if o.get("created_at") else utcnow(),
        )
        if o.get("id"):
            log.id = o["id"]
        db.add(log)

    for t in body.terminal_settings:
        ts = TerminalSettings(
            guestbook_id=t.get("guestbook_id"),
            client_id=t.get("client_id", ""),
            operator_name=t.get("operator_name", ""),
            default_cash_account=t.get("default_cash_account"),
            default_wechat_account=t.get("default_wechat_account"),
            updated_at=datetime.fromisoformat(t["updated_at"]) if t.get("updated_at") else utcnow(),
        )
        if t.get("id"):
            ts.id = t["id"]
        db.add(ts)

    if body.admin:
        admin = body.admin
        result = await db.execute(select(User).where(User.username == admin.get("username", "admin")))
        existing = result.scalar_one_or_none()
        if not existing:
            user = User(
                username=admin.get("username", "admin"),
                password_hash=hash_password(admin.get("password", "123456")),
                role=admin.get("role", "super_admin"),
                email=admin.get("email"),
            )
            await add_user_with_generated_id(db, user)

    await db.commit()

    return MigrationResult(
        persons=len(body.persons),
        payment_accounts=len(body.payment_accounts),
        guestbooks=len(body.guestbooks),
        gb_records=len(body.gb_records),
        daily_records=len(body.daily_records),
        operation_logs=len(body.operation_logs),
        terminal_settings=len(body.terminal_settings),
    )
