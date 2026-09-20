from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database import get_db
from app.models.daily_record import DailyRecord
from app.models.gb_record import GbRecord
from app.models.person import Person
from app.models.user import User
from app.schemas.stats import PersonRankingItem, TransactionSummaryByName

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/person-ranking", response_model=list[PersonRankingItem])
def person_ranking(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    persons = db.query(Person).all()
    ranking = []
    for p in persons:
        daily_out = sum(r.amount for r in db.query(DailyRecord).filter(DailyRecord.person_id == p.id, DailyRecord.type == "out").all())
        daily_in = sum(r.amount for r in db.query(DailyRecord).filter(DailyRecord.person_id == p.id, DailyRecord.type == "in").all())
        gb_total = sum(r.amount for r in db.query(GbRecord).filter(GbRecord.person_id == p.id).all())
        total_in = daily_in + gb_total
        ranking.append(PersonRankingItem(
            person_id=p.id,
            person_name=p.name,
            total_out=daily_out,
            total_in=total_in,
            net=total_in - daily_out,
        ))
    ranking.sort(key=lambda x: abs(x.net), reverse=True)
    return ranking[:limit]


@router.get("/transaction-by-name", response_model=TransactionSummaryByName)
def transaction_by_name(
    name: str = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    daily_out = sum(r.amount for r in db.query(DailyRecord).filter(DailyRecord.person_name == name, DailyRecord.type == "out").all())
    daily_in = sum(r.amount for r in db.query(DailyRecord).filter(DailyRecord.person_name == name, DailyRecord.type == "in").all())
    gb_total = sum(r.amount for r in db.query(GbRecord).filter(GbRecord.guest_name == name).all())
    total_in = daily_in + gb_total
    return TransactionSummaryByName(total_out=daily_out, total_in=total_in, net=total_in - daily_out)
