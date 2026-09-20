import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_role
from app.database import get_db
from app.models.operation_log import OperationLog
from app.models.person import Person
from app.models.daily_record import DailyRecord
from app.models.gb_record import GbRecord
from app.models.user import User
from app.schemas.person import PersonCreate, PersonResponse, PersonTransactionSummary, PersonUpdate

router = APIRouter(prefix="/persons", tags=["persons"])


@router.get("/", response_model=list[PersonResponse])
def list_persons(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(Person).order_by(Person.name).all()


@router.get("/search", response_model=list[PersonResponse])
def search_persons(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    keyword = f"%{q}%"
    return (
        db.query(Person)
        .filter(
            (Person.name.ilike(keyword))
            | (Person.nickname.ilike(keyword))
            | (Person.phone.ilike(keyword))
        )
        .all()
    )


@router.get("/{person_id}", response_model=PersonResponse)
def get_person(person_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="人员不存在")
    return person


@router.post("/", response_model=int)
def create_person(
    body: PersonCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "editor")),
):
    person = Person(**body.model_dump())
    person._aliases = json.dumps(body.aliases, ensure_ascii=False)
    db.add(person)
    db.commit()
    db.refresh(person)
    return person.id


@router.put("/{person_id}")
def update_person(
    person_id: int,
    body: PersonUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "editor")),
):
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="人员不存在")
    data = body.model_dump(exclude_unset=True)
    if "aliases" in data:
        person._aliases = json.dumps(data.pop("aliases"), ensure_ascii=False)
    for k, v in data.items():
        setattr(person, k, v)
    db.commit()
    return {"message": "已更新"}


@router.delete("/{person_id}")
def delete_person(
    person_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("admin", "editor")),
):
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="人员不存在")
    db.delete(person)
    db.commit()
    return {"message": "已删除"}


@router.get("/{person_id}/summary", response_model=PersonTransactionSummary)
def person_summary(person_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    daily_out = (
        db.query(DailyRecord)
        .filter(DailyRecord.person_id == person_id, DailyRecord.type == "out")
        .all()
    )
    daily_in = (
        db.query(DailyRecord)
        .filter(DailyRecord.person_id == person_id, DailyRecord.type == "in")
        .all()
    )
    gb_records = db.query(GbRecord).filter(GbRecord.person_id == person_id).all()

    total_out = sum(r.amount for r in daily_out)
    total_in = sum(r.amount for r in daily_in) + sum(r.amount for r in gb_records)
    return PersonTransactionSummary(total_out=total_out, total_in=total_in, net=total_in - total_out)
