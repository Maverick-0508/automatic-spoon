from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_notification(self, user_id: str, message: str, channel: str = "email"):
    """Deliver a notification asynchronously."""
    try:
        logger.info("Sending notification to user %s via %s", user_id, channel)
        # TODO: integrate with email/SMS provider
    except Exception as exc:
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=2, default_retry_delay=120)
def generate_report(self, report_type: str, params: dict):
    """Generate a heavy report off the request path."""
    try:
        logger.info("Generating report type=%s params=%s", report_type, params)
        # TODO: build PDF/CSV and store in S3 or local
    except Exception as exc:
        raise self.retry(exc=exc)


@celery_app.task
def run_sla_check():
    """Find work orders nearing SLA breach and escalate."""
    asyncio.run(_async_sla_check())


async def _async_sla_check():
    from app.db.session import AsyncSessionLocal
    from app.models.work_order import SlaTimer, WorkOrder, AuditLog, WorkOrderEvent
    from sqlalchemy import select, update

    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        # Mark breached timers
        result = await db.execute(
            select(SlaTimer).where(
                SlaTimer.deadline_at <= now,
                SlaTimer.breached.is_(False),
            )
        )
        timers = result.scalars().all()

        for timer in timers:
            timer.breached = True

            # Escalate work order priority
            wo_res = await db.execute(select(WorkOrder).where(WorkOrder.id == timer.work_order_id))
            wo = wo_res.scalar_one_or_none()
            if wo and wo.priority != "critical":
                wo.priority = "critical"

            # Write audit event
            event = WorkOrderEvent(
                work_order_id=timer.work_order_id,
                event_type="sla_breach",
                payload=f'{{"sla_type": "{timer.sla_type}"}}',
            )
            db.add(event)

        await db.commit()
        logger.info("SLA check complete: %d timers breached", len(timers))


@celery_app.task
def nightly_reconciliation():
    """Reconcile open orders and fix inconsistencies."""
    asyncio.run(_async_reconciliation())


async def _async_reconciliation():
    from app.db.session import AsyncSessionLocal
    from app.models.work_order import WorkOrder
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(WorkOrder).where(WorkOrder.status == "open")
        )
        orders = result.scalars().all()
        logger.info("Nightly reconciliation: %d open orders reviewed", len(orders))
        # TODO: add domain-specific reconciliation logic


@celery_app.task(bind=True, max_retries=2)
def bulk_import(self, import_type: str, records: list):
    """Process bulk import of clients/properties/work-orders."""
    try:
        logger.info("Bulk import type=%s count=%d", import_type, len(records))
        asyncio.run(_async_bulk_import(import_type, records))
    except Exception as exc:
        raise self.retry(exc=exc)


async def _async_bulk_import(import_type: str, records: list):
    # TODO: implement domain-specific bulk import logic
    pass
