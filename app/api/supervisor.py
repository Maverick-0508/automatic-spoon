from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import case, func, select

from app.api.deps import require_roles
from app.db.session import get_db
from app.models.user import User
from app.models.work_order import WorkOrder, SlaTimer, WorkOrderEvent, Assignment, AuditLog
from app.models.property import Property, Client
from app.services.email_service import send_quote_email
from app.services.quote_service import build_quote_package, is_quote_request
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
    WorkOrderCreate,
    WorkOrderUpdate,
    WorkOrderAssign,
    WorkOrderResponse,
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
                SlaTimer.breached.is_(True),
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
        .join(Client, WorkOrder.client_id == Client.id)
        .join(Property, Property.client_id == Client.id)
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
        select(SlaTimer).where(SlaTimer.breached.is_(True), SlaTimer.notified.is_(False)).limit(50)
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
            SlaTimer.breached.is_(True),
            SlaTimer.deadline_at >= since,
        )
    )).scalar_one()

    total = (await db.execute(
        select(func.count()).select_from(WorkOrder).where(WorkOrder.created_at >= since)
    )).scalar_one()

    completion_rate = round(total_completed / total, 4) if total > 0 else 0.0

    # avg_resolution_hours: average time from created_at to updated_at for completed orders
    avg_hours_result = await db.execute(
        select(
            func.avg(
                func.julianday(WorkOrder.updated_at) - func.julianday(WorkOrder.created_at)
            ) * 24
        ).where(
            WorkOrder.status == "completed",
            WorkOrder.updated_at >= since,
        )
    )
    avg_raw = avg_hours_result.scalar_one_or_none()
    avg_resolution_hours = round(float(avg_raw), 2) if avg_raw is not None else None

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
        avg_resolution_hours=avg_resolution_hours,
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
            WorkOrder.client_id == prop.client_id,
            WorkOrder.status.in_(["open", "in_progress"]),
        )
    )).scalar_one()

    last_svc_result = await db.execute(
        select(func.max(WorkOrder.updated_at)).where(
            WorkOrder.client_id == prop.client_id,
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


@router.post("/work-orders", response_model=WorkOrderResponse, status_code=201)
async def create_work_order(
    payload: WorkOrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = _auth,
):
    # Validate client exists
    client_res = await db.execute(select(Client).where(Client.id == payload.client_id))
    client = client_res.scalar_one_or_none()
    if client is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Client not found")

    # Validate assignee exists if provided
    if payload.assigned_to:
        user_res = await db.execute(select(User).where(User.id == payload.assigned_to))
        if user_res.scalar_one_or_none() is None:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Assigned user not found")

    # Prefer explicit request flag; fallback to keyword detection when not provided
    quote_requested = payload.quote if getattr(payload, "quote", None) is not None else is_quote_request(payload.title, payload.description)
    if quote_requested and not client.email:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Client email is required to send a quote")

    wo = WorkOrder(
        client_id=payload.client_id,
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        zone=payload.zone,
        assigned_to=payload.assigned_to,
        due_at=payload.due_at,
        next_action_at=payload.next_action_at,
    )
    db.add(wo)
    await db.flush()  # assign wo.id before referencing it in related records

    event = WorkOrderEvent(
        work_order_id=wo.id,
        actor_id=current_user.id,
        event_type="created",
        payload=None,
    )
    db.add(event)

    audit = AuditLog(
        actor_id=current_user.id,
        action="work_order.created",
        resource_type="work_order",
        resource_id=wo.id,
    )
    db.add(audit)

    await db.commit()
    await db.refresh(wo)

    if quote_requested:
        property_res = await db.execute(
            select(Property)
            .where(Property.client_id == client.id)
            .order_by(Property.created_at.asc())
            .limit(1)
        )
        quote_property = property_res.scalar_one_or_none()
        quote_package = build_quote_package(client=client, property=quote_property, work_order=wo)

        try:
            send_quote_email(
                to_email=client.email,
                subject=f"Detailed quote for {wo.title}",
                text_body=quote_package.text_body,
                html_body=quote_package.html_body,
                attachment_filename=quote_package.pdf_filename,
                attachment_bytes=quote_package.pdf_bytes,
            )
        except Exception as exc:
            from fastapi import HTTPException
            raise HTTPException(status_code=502, detail=f"Quote email delivery failed: {exc}")

        quote_event = WorkOrderEvent(
            work_order_id=wo.id,
            actor_id=current_user.id,
            event_type="quote_sent",
            payload=f'{{"recipient": "{client.email}", "attachment": "{quote_package.pdf_filename}"}}',
        )
        db.add(quote_event)

        quote_audit = AuditLog(
            actor_id=current_user.id,
            action="quote.sent",
            resource_type="work_order",
            resource_id=wo.id,
            detail=f"sent to {client.email} with {quote_package.pdf_filename}",
        )
        db.add(quote_audit)
        await db.commit()

    return WorkOrderResponse(
        id=wo.id,
        client_id=wo.client_id,
        title=wo.title,
        description=wo.description,
        status=wo.status,
        priority=wo.priority,
        zone=wo.zone,
        assigned_to=wo.assigned_to,
        due_at=wo.due_at,
        next_action_at=wo.next_action_at,
        created_at=wo.created_at,
        updated_at=wo.updated_at,
    )


@router.patch("/work-orders/{work_order_id}", response_model=WorkOrderResponse)
async def update_work_order(
    work_order_id: int,
    payload: WorkOrderUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = _auth,
):
    res = await db.execute(select(WorkOrder).where(WorkOrder.id == work_order_id))
    wo = res.scalar_one_or_none()
    if wo is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Work order not found")

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(wo, field, value)

    event = WorkOrderEvent(
        work_order_id=wo.id,
        actor_id=current_user.id,
        event_type="updated",
        payload=str(updates),
    )
    db.add(event)

    audit = AuditLog(
        actor_id=current_user.id,
        action="work_order.updated",
        resource_type="work_order",
        resource_id=wo.id,
        detail=str(updates),
    )
    db.add(audit)

    await db.commit()
    await db.refresh(wo)
    return WorkOrderResponse(
        id=wo.id,
        client_id=wo.client_id,
        title=wo.title,
        description=wo.description,
        status=wo.status,
        priority=wo.priority,
        zone=wo.zone,
        assigned_to=wo.assigned_to,
        due_at=wo.due_at,
        next_action_at=wo.next_action_at,
        created_at=wo.created_at,
        updated_at=wo.updated_at,
    )


@router.post("/work-orders/{work_order_id}/assign", response_model=WorkOrderResponse)
async def assign_work_order(
    work_order_id: int,
    payload: WorkOrderAssign,
    db: AsyncSession = Depends(get_db),
    current_user: User = _auth,
):
    res = await db.execute(select(WorkOrder).where(WorkOrder.id == work_order_id))
    wo = res.scalar_one_or_none()
    if wo is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Work order not found")

    user_res = await db.execute(select(User).where(User.id == payload.user_id))
    if user_res.scalar_one_or_none() is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="User not found")

    # Close any open assignment records
    open_assign_res = await db.execute(
        select(Assignment).where(
            Assignment.work_order_id == work_order_id,
            Assignment.unassigned_at.is_(None),
        )
    )
    for old in open_assign_res.scalars().all():
        old.unassigned_at = datetime.now(timezone.utc)

    wo.assigned_to = payload.user_id
    if wo.status == "open":
        wo.status = "in_progress"

    new_assignment = Assignment(work_order_id=wo.id, user_id=payload.user_id)
    db.add(new_assignment)

    event = WorkOrderEvent(
        work_order_id=wo.id,
        actor_id=current_user.id,
        event_type="assigned",
        payload=f'{{"user_id": "{payload.user_id}"}}',
    )
    db.add(event)

    audit = AuditLog(
        actor_id=current_user.id,
        action="work_order.assigned",
        resource_type="work_order",
        resource_id=wo.id,
        detail=f"assigned to {payload.user_id}",
    )
    db.add(audit)

    await db.commit()
    await db.refresh(wo)
    return WorkOrderResponse(
        id=wo.id,
        client_id=wo.client_id,
        title=wo.title,
        description=wo.description,
        status=wo.status,
        priority=wo.priority,
        zone=wo.zone,
        assigned_to=wo.assigned_to,
        due_at=wo.due_at,
        next_action_at=wo.next_action_at,
        created_at=wo.created_at,
        updated_at=wo.updated_at,
    )


@router.post("/work-orders/{work_order_id}/complete", response_model=WorkOrderResponse)
async def complete_work_order(
    work_order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = _auth,
):
    res = await db.execute(select(WorkOrder).where(WorkOrder.id == work_order_id))
    wo = res.scalar_one_or_none()
    if wo is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Work order not found")

    if wo.status == "completed":
        from fastapi import HTTPException
        raise HTTPException(status_code=409, detail="Work order is already completed")

    wo.status = "completed"

    # Close open assignment records
    open_assign_res = await db.execute(
        select(Assignment).where(
            Assignment.work_order_id == work_order_id,
            Assignment.unassigned_at.is_(None),
        )
    )
    for old in open_assign_res.scalars().all():
        old.unassigned_at = datetime.now(timezone.utc)

    event = WorkOrderEvent(
        work_order_id=wo.id,
        actor_id=current_user.id,
        event_type="completed",
        payload=None,
    )
    db.add(event)

    audit = AuditLog(
        actor_id=current_user.id,
        action="work_order.completed",
        resource_type="work_order",
        resource_id=wo.id,
    )
    db.add(audit)

    await db.commit()
    await db.refresh(wo)
    return WorkOrderResponse(
        id=wo.id,
        client_id=wo.client_id,
        title=wo.title,
        description=wo.description,
        status=wo.status,
        priority=wo.priority,
        zone=wo.zone,
        assigned_to=wo.assigned_to,
        due_at=wo.due_at,
        next_action_at=wo.next_action_at,
        created_at=wo.created_at,
        updated_at=wo.updated_at,
    )
