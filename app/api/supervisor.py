from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import case, func, select

from app.api.deps import require_roles
from app.db.session import get_db
from app.models.user import User
from app.models.work_order import WorkOrder, SlaTimer
from app.models.property import Property, Client
from app.schemas.supervisor import (
    ActiveResponse,
    ActiveWorker,
    ExceptionItem,
    ExceptionsResponse,
    PlanningItem,
    PlanningResponse,
    PropertyDetail,
    QueueItem,
    QueueResponse,
    ReportResponse,
    StatsTrendPoint,
    StatsTrendsResponse,
    StatsResponse,
)

router = APIRouter(prefix="/api/supervisor", tags=["supervisor"])
_auth = Depends(require_roles("admin", "supervisor"))


@router.get("/stats", response_model=StatsResponse)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    _: User = _auth,
):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    total_open = (await db.execute(
        select(func.count()).select_from(WorkOrder).where(WorkOrder.status == "open")
    )).scalar_one()

    overdue = (await db.execute(
        select(func.count()).select_from(WorkOrder).where(
            WorkOrder.status == "open",
            WorkOrder.due_at < now,
        )
    )).scalar_one()

    high_priority = (await db.execute(
        select(func.count()).select_from(WorkOrder).where(
            WorkOrder.status == "open",
            WorkOrder.priority == "high",
        )
    )).scalar_one()

    completed_today = (await db.execute(
        select(func.count()).select_from(WorkOrder).where(
            WorkOrder.status == "completed",
            WorkOrder.updated_at >= today_start,
        )
    )).scalar_one()

    active_workers = (await db.execute(
        select(func.count(func.distinct(WorkOrder.assigned_to))).select_from(WorkOrder).where(
            WorkOrder.status == "in_progress",
        )
    )).scalar_one()

    return StatsResponse(
        total_open=total_open,
        overdue=overdue,
        high_priority=high_priority,
        completed_today=completed_today,
        active_workers=active_workers,
    )


@router.get("/stats-trends", response_model=StatsTrendsResponse)
async def get_stats_trends(
    days: int = Query(7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    _: User = _auth,
):
    now = datetime.now(timezone.utc)
    data = []
    for i in range(days - 1, -1, -1):
        day_start = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)

        open_count = (await db.execute(
            select(func.count()).select_from(WorkOrder).where(
                WorkOrder.created_at < day_end,
                WorkOrder.status != "completed",
            )
        )).scalar_one()

        completed_count = (await db.execute(
            select(func.count()).select_from(WorkOrder).where(
                WorkOrder.status == "completed",
                WorkOrder.updated_at >= day_start,
                WorkOrder.updated_at < day_end,
            )
        )).scalar_one()

        breached_count = (await db.execute(
            select(func.count()).select_from(SlaTimer).where(
                SlaTimer.breached == True,
                SlaTimer.deadline_at >= day_start,
                SlaTimer.deadline_at < day_end,
            )
        )).scalar_one()

        data.append(StatsTrendPoint(
            date=day_start.date().isoformat(),
            open=open_count,
            completed=completed_count,
            breached=breached_count,
        ))

    return StatsTrendsResponse(days=days, data=data)


@router.get("/queue", response_model=QueueResponse)
async def get_queue(
    limit: int = Query(12, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: User = _auth,
):
    result = await db.execute(
        select(WorkOrder, Property)
        .join(Property, WorkOrder.property_id == Property.id)
        .where(WorkOrder.status.in_(["open", "in_progress"]))
        .order_by(
            WorkOrder.due_at.asc().nullsfirst(),
            # Map priority strings to numeric severity for correct ordering
            case(
                (WorkOrder.priority == "critical", 1),
                (WorkOrder.priority == "high", 2),
                (WorkOrder.priority == "normal", 3),
                (WorkOrder.priority == "low", 4),
                else_=5,
            ).asc(),
        )
        .limit(limit)
    )
    rows = result.all()

    total = (await db.execute(
        select(func.count()).select_from(WorkOrder).where(WorkOrder.status.in_(["open", "in_progress"]))
    )).scalar_one()

    items = [
        QueueItem(
            id=wo.id,
            title=wo.title,
            status=wo.status,
            priority=wo.priority,
            zone=wo.zone,
            due_at=wo.due_at,
            assigned_to=wo.assigned_to,
            property_address=prop.address,
        )
        for wo, prop in rows
    ]
    return QueueResponse(items=items, total=total)


@router.get("/planning", response_model=PlanningResponse)
async def get_planning(
    limit: int = Query(12, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: User = _auth,
):
    result = await db.execute(
        select(WorkOrder)
        .where(WorkOrder.status.in_(["open", "in_progress"]))
        .order_by(WorkOrder.next_action_at.asc().nullslast())
        .limit(limit)
    )
    orders = result.scalars().all()

    items = [
        PlanningItem(
            id=wo.id,
            title=wo.title,
            status=wo.status,
            priority=wo.priority,
            zone=wo.zone,
            next_action_at=wo.next_action_at,
            assigned_to=wo.assigned_to,
        )
        for wo in orders
    ]
    return PlanningResponse(items=items)


@router.get("/active", response_model=ActiveResponse)
async def get_active(
    db: AsyncSession = Depends(get_db),
    _: User = _auth,
):
    result = await db.execute(
        select(
            WorkOrder.assigned_to,
            func.count(WorkOrder.id).label("cnt"),
            func.max(WorkOrder.zone).label("zone"),
        )
        .where(WorkOrder.status == "in_progress", WorkOrder.assigned_to.isnot(None))
        .group_by(WorkOrder.assigned_to)
    )
    rows = result.all()

    workers = []
    for row in rows:
        user_res = await db.execute(select(User).where(User.id == row.assigned_to))
        user = user_res.scalar_one_or_none()
        if user:
            workers.append(ActiveWorker(
                user_id=user.id,
                full_name=user.full_name,
                active_orders=row.cnt,
                zone=row.zone,
            ))

    return ActiveResponse(workers=workers)


@router.get("/exceptions", response_model=ExceptionsResponse)
async def get_exceptions(
    db: AsyncSession = Depends(get_db),
    _: User = _auth,
):
    now = datetime.now(timezone.utc)

    # Overdue open orders
    result = await db.execute(
        select(WorkOrder).where(
            WorkOrder.status.in_(["open", "in_progress"]),
            WorkOrder.due_at < now,
        ).order_by(WorkOrder.due_at.asc()).limit(50)
    )
    overdue = result.scalars().all()

    # SLA breached
    sla_result = await db.execute(
        select(SlaTimer).where(SlaTimer.breached == True, SlaTimer.notified == False).limit(50)
    )
    sla_timers = sla_result.scalars().all()
    breached_ids = {st.work_order_id for st in sla_timers}

    items = []
    seen_ids = set()
    for wo in overdue:
        items.append(ExceptionItem(
            id=wo.id,
            title=wo.title,
            reason="overdue",
            priority=wo.priority,
            zone=wo.zone,
            due_at=wo.due_at,
        ))
        seen_ids.add(wo.id)

    if breached_ids:
        breach_result = await db.execute(
            select(WorkOrder).where(WorkOrder.id.in_(breached_ids - seen_ids))
        )
        for wo in breach_result.scalars().all():
            items.append(ExceptionItem(
                id=wo.id,
                title=wo.title,
                reason="sla_breach",
                priority=wo.priority,
                zone=wo.zone,
                due_at=wo.due_at,
            ))

    return ExceptionsResponse(items=items)


@router.get("/report", response_model=ReportResponse)
async def get_report(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    _: User = _auth,
):
    since = datetime.now(timezone.utc) - timedelta(days=days)

    total_completed = (await db.execute(
        select(func.count()).select_from(WorkOrder).where(
            WorkOrder.status == "completed",
            WorkOrder.updated_at >= since,
        )
    )).scalar_one()

    total_breached = (await db.execute(
        select(func.count()).select_from(SlaTimer).where(
            SlaTimer.breached == True,
            SlaTimer.deadline_at >= since,
        )
    )).scalar_one()

    total = (await db.execute(
        select(func.count()).select_from(WorkOrder).where(WorkOrder.created_at >= since)
    )).scalar_one()

    completion_rate = round(total_completed / total, 4) if total > 0 else 0.0

    # by_zone breakdown
    zone_result = await db.execute(
        select(WorkOrder.zone, func.count(WorkOrder.id).label("cnt"))
        .where(WorkOrder.created_at >= since)
        .group_by(WorkOrder.zone)
    )
    by_zone = {row.zone or "unknown": row.cnt for row in zone_result.all()}

    return ReportResponse(
        days=days,
        total_completed=total_completed,
        total_breached=total_breached,
        completion_rate=completion_rate,
        avg_resolution_hours=None,
        by_zone=by_zone,
    )


@router.get("/property", response_model=PropertyDetail)
async def get_property(
    address: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
    _: User = _auth,
):
    result = await db.execute(
        select(Property, Client)
        .join(Client, Property.client_id == Client.id)
        .where(Property.address.ilike(f"%{address}%"))
        .limit(1)
    )
    row = result.first()
    if row is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Property not found")

    prop, client = row

    open_orders = (await db.execute(
        select(func.count()).select_from(WorkOrder).where(
            WorkOrder.property_id == prop.id,
            WorkOrder.status.in_(["open", "in_progress"]),
        )
    )).scalar_one()

    last_svc_result = await db.execute(
        select(func.max(WorkOrder.updated_at)).where(
            WorkOrder.property_id == prop.id,
            WorkOrder.status == "completed",
        )
    )
    last_service = last_svc_result.scalar_one_or_none()

    return PropertyDetail(
        id=prop.id,
        address=prop.address,
        zone=prop.zone,
        client_name=client.full_name,
        open_orders=open_orders,
        last_service=last_service,
    )
