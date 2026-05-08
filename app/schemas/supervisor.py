from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class WorkOrderCreate(BaseModel):
    client_id: int
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    priority: str = Field("normal", pattern="^(critical|high|normal|low)$")
    zone: Optional[str] = None
    assigned_to: Optional[str] = None
    due_at: Optional[datetime] = None
    next_action_at: Optional[datetime] = None


class WorkOrderUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(open|in_progress|completed|cancelled)$")
    priority: Optional[str] = Field(None, pattern="^(critical|high|normal|low)$")
    zone: Optional[str] = None
    due_at: Optional[datetime] = None
    next_action_at: Optional[datetime] = None


class WorkOrderAssign(BaseModel):
    user_id: str


class WorkOrderResponse(BaseModel):
    id: int
    client_id: int
    title: str
    description: Optional[str]
    status: str
    priority: str
    zone: Optional[str]
    assigned_to: Optional[str]
    due_at: Optional[datetime]
    next_action_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

class StatsResponse(BaseModel):
    total_open: int
    overdue: int
    high_priority: int
    completed_today: int
    active_workers: int


class StatsTrendPoint(BaseModel):
    date: str
    open: int
    completed: int
    breached: int


class StatsTrendsResponse(BaseModel):
    days: int
    data: List[StatsTrendPoint]


class QueueItem(BaseModel):
    id: int
    title: str
    status: str
    priority: str
    zone: Optional[str]
    due_at: Optional[datetime]
    assigned_to: Optional[str]
    property_address: Optional[str]


class QueueResponse(BaseModel):
    items: List[QueueItem]
    total: int


class PlanningItem(BaseModel):
    id: int
    title: str
    status: str
    priority: str
    zone: Optional[str]
    next_action_at: Optional[datetime]
    assigned_to: Optional[str]


class PlanningResponse(BaseModel):
    items: List[PlanningItem]


class ActiveWorker(BaseModel):
    user_id: str
    full_name: str
    active_orders: int
    zone: Optional[str]


class ActiveResponse(BaseModel):
    workers: List[ActiveWorker]


class ExceptionItem(BaseModel):
    id: int
    title: str
    reason: str
    priority: str
    zone: Optional[str]
    due_at: Optional[datetime]


class ExceptionsResponse(BaseModel):
    items: List[ExceptionItem]


class ReportResponse(BaseModel):
    days: int
    total_completed: int
    total_breached: int
    completion_rate: float
    avg_resolution_hours: Optional[float]
    by_zone: Dict[str, Any]


class PropertyDetail(BaseModel):
    id: str
    address: str
    zone: Optional[str]
    client_name: Optional[str]
    open_orders: int
    last_service: Optional[datetime]
