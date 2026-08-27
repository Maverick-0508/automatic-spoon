import { Router, Request, Response } from 'express';
import { db } from '../db.js';
import { requireRoles } from './auth.js';
import { WorkOrder, WorkOrderPriority, WorkOrderStatus, User, Client } from '../types.js';
import { isQuoteRequest } from '../quoteService.js';
import { jobQueue } from '../jobQueue.js';

export const supervisorRouter = Router();

// All supervisor routes require admin or supervisor role
supervisorRouter.use(requireRoles('admin', 'supervisor'));

function formatWorkOrder(wo: WorkOrder) {
  const client = db.clients.find(c => c.id === wo.clientId);
  const property = db.properties.find(p => p.id === wo.propertyId || p.clientId === wo.clientId);
  const assignedUser = wo.assignedTo ? db.users.find(u => u.id === wo.assignedTo) : null;

  return {
    id: wo.id,
    client_id: wo.clientId,
    client_name: client?.fullName ?? null,
    client_email: client?.email ?? null,
    client_phone: client?.phone ?? null,
    title: wo.title,
    description: wo.description ?? null,
    status: wo.status,
    priority: wo.priority,
    zone: wo.zone ?? property?.zone ?? null,
    property_address: property?.address ?? null,
    assigned_to: wo.assignedTo ?? null,
    assigned_name: assignedUser?.fullName ?? null,
    due_at: wo.dueAt ?? null,
    next_action_at: wo.nextActionAt ?? null,
    is_quote: Boolean(wo.isQuote),
    created_at: wo.createdAt,
    updated_at: wo.updatedAt,
  };
}

const PRIORITY_ORDER: Record<string, number> = {
  critical: 1,
  high: 2,
  normal: 3,
  low: 4,
};

// GET /api/supervisor/stats (Optimized single-pass metrics)
supervisorRouter.get('/stats', (req: Request, res: Response): void => {
  const now = Date.now();
  const todayStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())).getTime();

  let total_open = 0;
  let overdue = 0;
  let high_priority = 0;
  let completed_today = 0;
  const inProgressWorkers = new Set<string>();

  for (const w of db.workOrders) {
    const isTodayCompleted = w.status === 'completed' && new Date(w.updatedAt).getTime() >= todayStart;
    if (isTodayCompleted) {
      completed_today++;
    }

    if (w.status === 'open' || w.status === 'in_progress') {
      if (w.status === 'open') total_open++;
      if (w.priority === 'high' || w.priority === 'critical') high_priority++;
      if (w.dueAt && new Date(w.dueAt).getTime() < now) overdue++;
      if (w.status === 'in_progress' && w.assignedTo) {
        inProgressWorkers.add(w.assignedTo);
      }
    }
  }

  res.json({
    total_open,
    overdue,
    high_priority,
    completed_today,
    active_workers: inProgressWorkers.size,
    total_clients: db.clients.length,
    total_work_orders: db.workOrders.length,
  });
});

// GET /api/supervisor/stats-trends (Optimized single-pass aggregation across time buckets)
supervisorRouter.get('/stats-trends', (req: Request, res: Response): void => {
  const days = Math.min(90, Math.max(1, parseInt((req.query.days as string) || '7', 10)));
  const now = new Date();
  const dayBuckets: { [key: string]: { date: string; open: number; completed: number; breached: number; start: number; end: number } } = {};
  const dateKeys: string[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const dStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i, 0, 0, 0));
    const dEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i + 1, 0, 0, 0));
    const key = dStart.toISOString().split('T')[0];
    dateKeys.push(key);
    dayBuckets[key] = {
      date: key,
      open: 0,
      completed: 0,
      breached: 0,
      start: dStart.getTime(),
      end: dEnd.getTime(),
    };
  }

  // Single pass through work orders
  for (const w of db.workOrders) {
    const cTime = new Date(w.createdAt).getTime();
    const uTime = new Date(w.updatedAt).getTime();

    for (const key of dateKeys) {
      const b = dayBuckets[key];
      if (cTime < b.end && w.status !== 'completed') {
        b.open++;
      }
      if (w.status === 'completed' && uTime >= b.start && uTime < b.end) {
        b.completed++;
      }
    }
  }

  // Single pass through SLA timers
  for (const s of db.slaTimers) {
    if (s.breached) {
      const dTime = new Date(s.deadlineAt).getTime();
      for (const key of dateKeys) {
        const b = dayBuckets[key];
        if (dTime < b.end) {
          b.breached++;
        }
      }
    }
  }

  const data = dateKeys.map(k => ({
    date: dayBuckets[k].date,
    open: dayBuckets[k].open,
    completed: dayBuckets[k].completed,
    breached: dayBuckets[k].breached,
  }));

  res.json({ days, data });
});

// GET /api/supervisor/queue
supervisorRouter.get('/queue', (req: Request, res: Response): void => {
  const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '12', 10)));
  const queueOrders = db.workOrders.filter(w => w.status === 'open' || w.status === 'in_progress');

  queueOrders.sort((a, b) => {
    if (!a.dueAt && b.dueAt) return -1;
    if (a.dueAt && !b.dueAt) return 1;
    if (a.dueAt && b.dueAt) {
      const diff = new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      if (diff !== 0) return diff;
    }
    const prioA = PRIORITY_ORDER[a.priority] || 5;
    const prioB = PRIORITY_ORDER[b.priority] || 5;
    return prioA - prioB;
  });

  const sliced = queueOrders.slice(0, limit);
  const items = sliced.map(wo => {
    const prop = db.properties.find(p => p.id === wo.propertyId || p.clientId === wo.clientId);
    const client = db.clients.find(c => c.id === wo.clientId);
    return {
      id: wo.id,
      title: wo.title,
      client_name: client?.fullName ?? null,
      status: wo.status,
      priority: wo.priority,
      zone: wo.zone ?? prop?.zone ?? null,
      due_at: wo.dueAt ?? null,
      assigned_to: wo.assignedTo ?? null,
      property_address: prop?.address ?? null,
      is_quote: Boolean(wo.isQuote),
    };
  });

  res.json({
    items,
    total: queueOrders.length,
  });
});

// GET /api/supervisor/planning
supervisorRouter.get('/planning', (req: Request, res: Response): void => {
  const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '12', 10)));
  const orders = db.workOrders.filter(w => w.status === 'open' || w.status === 'in_progress');

  orders.sort((a, b) => {
    if (!a.nextActionAt && b.nextActionAt) return 1;
    if (a.nextActionAt && !b.nextActionAt) return -1;
    if (a.nextActionAt && b.nextActionAt) {
      return new Date(a.nextActionAt).getTime() - new Date(b.nextActionAt).getTime();
    }
    return 0;
  });

  const items = orders.slice(0, limit).map(wo => {
    const client = db.clients.find(c => c.id === wo.clientId);
    return {
      id: wo.id,
      title: wo.title,
      client_name: client?.fullName ?? null,
      status: wo.status,
      priority: wo.priority,
      zone: wo.zone ?? null,
      next_action_at: wo.nextActionAt ?? null,
      assigned_to: wo.assignedTo ?? null,
    };
  });

  res.json({ items });
});

// GET /api/supervisor/active
supervisorRouter.get('/active', (req: Request, res: Response): void => {
  const map = new Map<string, { count: number; zone: string | null; orders: Array<{ id: number; title: string }> }>();

  db.workOrders.forEach(w => {
    if (w.status === 'in_progress' && w.assignedTo) {
      const existing = map.get(w.assignedTo) || { count: 0, zone: w.zone || null, orders: [] };
      existing.count += 1;
      if (w.zone) existing.zone = w.zone;
      existing.orders.push({ id: w.id, title: w.title });
      map.set(w.assignedTo, existing);
    }
  });

  const workers = [];
  for (const [userId, info] of map.entries()) {
    const user = db.users.find(u => u.id === userId);
    if (user) {
      workers.push({
        user_id: user.id,
        full_name: user.fullName,
        role: user.role,
        phone: user.phone ?? null,
        active_orders: info.count,
        zone: info.zone,
        orders: info.orders,
      });
    }
  }

  res.json({ workers });
});

// GET /api/supervisor/workers and /api/supervisor/users (for dispatcher selection)
supervisorRouter.get(['/workers', '/users'], (req: Request, res: Response): void => {
  const activeWorkers = db.users
    .filter(u => u.isActive)
    .map(u => {
      const activeWorkOrders = db.workOrders.filter(w => w.assignedTo === u.id && w.status === 'in_progress');
      return {
        id: u.id,
        user_id: u.id,
        full_name: u.fullName,
        email: u.email,
        phone: u.phone ?? null,
        role: u.role,
        active_orders_count: activeWorkOrders.length,
        current_work_orders: activeWorkOrders.map(w => ({ id: w.id, title: w.title, zone: w.zone })),
      };
    });

  res.json({ workers: activeWorkers, total: activeWorkers.length });
});

// GET /api/supervisor/exceptions
supervisorRouter.get('/exceptions', (req: Request, res: Response): void => {
  const now = Date.now();
  const items: any[] = [];
  const seenIds = new Set<number>();

  const overdue = db.workOrders
    .filter(w => (w.status === 'open' || w.status === 'in_progress') && w.dueAt && new Date(w.dueAt).getTime() < now)
    .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime())
    .slice(0, 50);

  for (const wo of overdue) {
    const client = db.clients.find(c => c.id === wo.clientId);
    items.push({
      id: wo.id,
      title: wo.title,
      client_name: client?.fullName ?? null,
      reason: 'overdue',
      priority: wo.priority,
      zone: wo.zone ?? null,
      due_at: wo.dueAt ?? null,
    });
    seenIds.add(wo.id);
  }

  const breachedTimers = db.slaTimers.filter(st => st.breached && !st.notified).slice(0, 50);
  for (const st of breachedTimers) {
    if (!seenIds.has(st.workOrderId)) {
      const wo = db.workOrders.find(w => w.id === st.workOrderId);
      if (wo) {
        const client = db.clients.find(c => c.id === wo.clientId);
        items.push({
          id: wo.id,
          title: wo.title,
          client_name: client?.fullName ?? null,
          reason: 'sla_breach',
          priority: wo.priority,
          zone: wo.zone ?? null,
          due_at: wo.dueAt ?? null,
        });
        seenIds.add(wo.id);
      }
    }
  }

  res.json({ items });
});

// GET /api/supervisor/report
supervisorRouter.get('/report', (req: Request, res: Response): void => {
  const days = Math.min(365, Math.max(1, parseInt((req.query.days as string) || '30', 10)));
  const since = Date.now() - days * 86400000;

  const total_completed = db.workOrders.filter(w => w.status === 'completed' && new Date(w.updatedAt).getTime() >= since).length;
  const total_breached = db.slaTimers.filter(s => s.breached && new Date(s.deadlineAt).getTime() >= since).length;
  const total = db.workOrders.filter(w => new Date(w.createdAt).getTime() >= since).length;
  const completion_rate = total > 0 ? Math.round((total_completed / total) * 10000) / 10000 : 0.0;

  const completedOrders = db.workOrders.filter(w => w.status === 'completed' && new Date(w.updatedAt).getTime() >= since);
  let avg_resolution_hours: number | null = null;
  if (completedOrders.length > 0) {
    const totalHours = completedOrders.reduce((sum, w) => {
      const diffMs = new Date(w.updatedAt).getTime() - new Date(w.createdAt).getTime();
      return sum + diffMs / 3600000;
    }, 0);
    avg_resolution_hours = Math.round((totalHours / completedOrders.length) * 100) / 100;
  }

  const by_zone: Record<string, number> = {};
  db.workOrders.forEach(w => {
    if (new Date(w.createdAt).getTime() >= since) {
      const z = w.zone || 'unknown';
      by_zone[z] = (by_zone[z] || 0) + 1;
    }
  });

  res.json({
    days,
    total_completed,
    total_breached,
    completion_rate,
    avg_resolution_hours,
    by_zone,
  });
});

// GET /api/supervisor/property
supervisorRouter.get('/property', (req: Request, res: Response): void => {
  const addressQuery = (req.query.address as string) || '';
  if (!addressQuery.trim()) {
    res.status(400).json({ detail: 'address query parameter is required' });
    return;
  }

  const q = addressQuery.trim().toLowerCase();
  const prop = db.properties.find(p => p.address.toLowerCase().includes(q));
  if (!prop) {
    res.status(404).json({ detail: 'Property not found' });
    return;
  }

  const client = db.clients.find(c => c.id === prop.clientId);
  const open_orders = db.workOrders.filter(w => w.clientId === prop.clientId && (w.status === 'open' || w.status === 'in_progress')).length;

  const completedList = db.workOrders.filter(w => w.clientId === prop.clientId && w.status === 'completed');
  let last_service: string | null = null;
  if (completedList.length > 0) {
    completedList.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    last_service = completedList[0].updatedAt;
  }

  res.json({
    id: prop.id,
    address: prop.address,
    zone: prop.zone ?? null,
    client_name: client?.fullName ?? null,
    open_orders,
    last_service,
  });
});

// ==========================================
// CLIENTS ENDPOINTS (GET with pagination/search & POST)
// ==========================================

// GET /api/supervisor/clients (Paging & search)
supervisorRouter.get('/clients', (req: Request, res: Response): void => {
  const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '20', 10)));
  const offset = Math.max(0, parseInt((req.query.offset as string) || '0', 10));
  const query = (req.query.q as string || req.query.search as string || '').trim().toLowerCase();

  let filtered = db.clients;
  if (query) {
    filtered = db.clients.filter(c =>
      c.fullName.toLowerCase().includes(query) ||
      (c.email && c.email.toLowerCase().includes(query)) ||
      (c.phone && c.phone.includes(query))
    );
  }

  const total = filtered.length;
  const paged = filtered.slice(offset, offset + limit);

  const items = paged.map(c => {
    const props = db.properties.filter(p => p.clientId === c.id);
    const wos = db.workOrders.filter(w => w.clientId === c.id);
    const openOrders = wos.filter(w => w.status === 'open' || w.status === 'in_progress').length;
    return {
      id: c.id,
      full_name: c.fullName,
      email: c.email ?? null,
      phone: c.phone ?? null,
      notes: c.notes ?? null,
      properties_count: props.length,
      properties: props.map(p => ({ id: p.id, address: p.address, zone: p.zone })),
      total_work_orders: wos.length,
      open_work_orders: openOrders,
      created_at: c.createdAt,
    };
  });

  res.json({
    items,
    total,
    limit,
    offset,
  });
});

// POST /api/supervisor/clients
supervisorRouter.post('/clients', (req: Request, res: Response): void => {
  const user = (req as any).user as User;
  const { name, fullName, full_name, email, phone, notes, address, zone } = req.body || {};

  const clientName = (name || fullName || full_name || '').trim();
  if (!clientName) {
    res.status(422).json({ detail: 'Client name is required' });
    return;
  }

  const client = db.findOrCreateClient({
    fullName: clientName,
    email: email?.trim() || null,
    phone: phone?.trim() || null,
    notes: notes?.trim() || null,
  });

  let property = null;
  if (address && address.trim()) {
    property = db.findOrCreateProperty({
      clientId: client.id,
      address: address.trim(),
      zone: zone || null,
    });
  }

  db.auditLogs.push({
    id: db.getNextAuditLogId(),
    actorId: user.id,
    action: 'client.created',
    resourceType: 'client',
    resourceId: String(client.id),
    detail: `Client ${client.fullName} created by supervisor`,
    createdAt: new Date().toISOString(),
  });

  res.status(201).json({
    id: client.id,
    full_name: client.fullName,
    email: client.email,
    phone: client.phone,
    notes: client.notes,
    property: property ? { id: property.id, address: property.address, zone: property.zone } : null,
    created_at: client.createdAt,
  });
});

// ==========================================
// WORK ORDERS (Full CRUD, Filtering, Assignment)
// ==========================================

// GET /api/supervisor/work-orders (Full list with filters)
supervisorRouter.get('/work-orders', (req: Request, res: Response): void => {
  const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '50', 10)));
  const offset = Math.max(0, parseInt((req.query.offset as string) || '0', 10));
  const status = req.query.status as string;
  const priority = req.query.priority as string;
  const zone = req.query.zone as string;
  const assigned_to = req.query.assigned_to as string;
  const search = (req.query.q as string || req.query.search as string || '').trim().toLowerCase();

  let orders = db.workOrders;

  if (status) {
    orders = orders.filter(w => w.status === status);
  }
  if (priority) {
    orders = orders.filter(w => w.priority === priority);
  }
  if (zone) {
    orders = orders.filter(w => w.zone === zone);
  }
  if (assigned_to) {
    orders = orders.filter(w => w.assignedTo === assigned_to);
  }
  if (search) {
    orders = orders.filter(w => {
      const client = db.clients.find(c => c.id === w.clientId);
      return w.title.toLowerCase().includes(search) ||
        (w.description && w.description.toLowerCase().includes(search)) ||
        (client && client.fullName.toLowerCase().includes(search));
    });
  }

  const total = orders.length;
  const paged = orders.slice(offset, offset + limit).map(formatWorkOrder);

  res.json({
    items: paged,
    total,
    limit,
    offset,
  });
});

// GET /api/supervisor/work-orders/:id (Detail with events & SLA)
supervisorRouter.get('/work-orders/:id', (req: Request, res: Response): void => {
  const woId = parseInt(req.params.id, 10);
  const wo = db.workOrders.find(w => w.id === woId);
  if (!wo) {
    res.status(404).json({ detail: 'Work order not found' });
    return;
  }

  const client = db.clients.find(c => c.id === wo.clientId);
  const property = db.properties.find(p => p.id === wo.propertyId || p.clientId === wo.clientId);
  const events = db.events.filter(e => e.workOrderId === wo.id);
  const assignments = db.assignments.filter(a => a.workOrderId === wo.id);
  const slaTimers = db.slaTimers.filter(s => s.workOrderId === wo.id);

  res.json({
    ...formatWorkOrder(wo),
    client: client ? { id: client.id, full_name: client.fullName, email: client.email, phone: client.phone } : null,
    property: property ? { id: property.id, address: property.address, zone: property.zone, notes: property.notes } : null,
    events,
    assignments,
    sla_timers: slaTimers,
  });
});

// POST /api/supervisor/work-orders
supervisorRouter.post('/work-orders', async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user as User;
  const { client_id, title, description, priority = 'normal', zone, assigned_to, quote, due_at, next_action_at, property_id } = req.body || {};

  if (!title || !title.trim()) {
    res.status(422).json({ detail: 'Title is required' });
    return;
  }

  const clientIdNum = Number(client_id);
  const client = db.clients.find(c => c.id === clientIdNum);
  if (!client) {
    res.status(404).json({ detail: 'Client not found' });
    return;
  }

  if (assigned_to) {
    const assignee = db.users.find(u => u.id === assigned_to);
    if (!assignee) {
      res.status(404).json({ detail: 'Assigned user not found' });
      return;
    }
  }

  const quoteRequested = quote !== undefined && quote !== null ? Boolean(quote) : isQuoteRequest(title, description);

  if (quoteRequested && !client.email) {
    res.status(400).json({ detail: 'Client email is required to send a quote' });
    return;
  }

  const nowIso = new Date().toISOString();
  const newWo: WorkOrder = {
    id: db.getNextWorkOrderId(),
    clientId: client.id,
    title: title.trim(),
    description: description || null,
    status: assigned_to ? 'in_progress' : 'open',
    priority: (priority as WorkOrderPriority) || 'normal',
    zone: zone || null,
    propertyId: property_id || null,
    assignedTo: assigned_to || null,
    dueAt: due_at || null,
    nextActionAt: next_action_at || null,
    isQuote: quoteRequested,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  db.workOrders.push(newWo);

  if (assigned_to) {
    db.assignments.push({
      id: db.getNextAssignmentId(),
      workOrderId: newWo.id,
      userId: assigned_to,
      assignedAt: nowIso,
      unassignedAt: null,
    });
  }

  db.events.push({
    id: db.getNextEventId(),
    workOrderId: newWo.id,
    actorId: user.id,
    eventType: 'created',
    payload: null,
    createdAt: nowIso,
  });

  db.auditLogs.push({
    id: db.getNextAuditLogId(),
    actorId: user.id,
    action: 'work_order.created',
    resourceType: 'work_order',
    resourceId: String(newWo.id),
    detail: null,
    createdAt: nowIso,
  });

  // Asynchronously dispatch quote email if requested
  if (quoteRequested && client.email) {
    jobQueue.enqueue('send_quote_email', {
      workOrderId: newWo.id,
      clientId: client.id,
    });
  }

  res.status(201).json(formatWorkOrder(newWo));
});

// PATCH /api/supervisor/work-orders/:id
supervisorRouter.patch('/work-orders/:id', (req: Request, res: Response): void => {
  const user = (req as any).user as User;
  const woId = parseInt(req.params.id, 10);
  const wo = db.workOrders.find(w => w.id === woId);
  if (!wo) {
    res.status(404).json({ detail: 'Work order not found' });
    return;
  }

  const updates = req.body || {};
  if (updates.title !== undefined) wo.title = updates.title;
  if (updates.description !== undefined) wo.description = updates.description;
  if (updates.status !== undefined) wo.status = updates.status;
  if (updates.priority !== undefined) wo.priority = updates.priority;
  if (updates.zone !== undefined) wo.zone = updates.zone;
  if (updates.due_at !== undefined) wo.dueAt = updates.due_at;
  if (updates.next_action_at !== undefined) wo.nextActionAt = updates.next_action_at;

  const nowIso = new Date().toISOString();
  wo.updatedAt = nowIso;

  db.events.push({
    id: db.getNextEventId(),
    workOrderId: wo.id,
    actorId: user.id,
    eventType: 'updated',
    payload: JSON.stringify(updates),
    createdAt: nowIso,
  });

  db.auditLogs.push({
    id: db.getNextAuditLogId(),
    actorId: user.id,
    action: 'work_order.updated',
    resourceType: 'work_order',
    resourceId: String(wo.id),
    detail: JSON.stringify(updates),
    createdAt: nowIso,
  });

  res.json(formatWorkOrder(wo));
});

// POST /api/supervisor/work-orders/:id/assign
supervisorRouter.post('/work-orders/:id/assign', (req: Request, res: Response): void => {
  const user = (req as any).user as User;
  const woId = parseInt(req.params.id, 10);
  const wo = db.workOrders.find(w => w.id === woId);
  if (!wo) {
    res.status(404).json({ detail: 'Work order not found' });
    return;
  }

  const { user_id } = req.body || {};
  const targetUser = db.users.find(u => u.id === user_id);
  if (!targetUser) {
    res.status(404).json({ detail: 'User not found' });
    return;
  }

  const nowIso = new Date().toISOString();

  // Close open assignments
  db.assignments.forEach(a => {
    if (a.workOrderId === wo.id && !a.unassignedAt) {
      a.unassignedAt = nowIso;
    }
  });

  wo.assignedTo = targetUser.id;
  if (wo.status === 'open') {
    wo.status = 'in_progress';
  }
  wo.updatedAt = nowIso;

  db.assignments.push({
    id: db.getNextAssignmentId(),
    workOrderId: wo.id,
    userId: targetUser.id,
    assignedAt: nowIso,
    unassignedAt: null,
  });

  db.events.push({
    id: db.getNextEventId(),
    workOrderId: wo.id,
    actorId: user.id,
    eventType: 'assigned',
    payload: JSON.stringify({ user_id: targetUser.id, name: targetUser.fullName }),
    createdAt: nowIso,
  });

  db.auditLogs.push({
    id: db.getNextAuditLogId(),
    actorId: user.id,
    action: 'work_order.assigned',
    resourceType: 'work_order',
    resourceId: String(wo.id),
    detail: `assigned to ${targetUser.fullName} (${targetUser.id})`,
    createdAt: nowIso,
  });

  res.json(formatWorkOrder(wo));
});

// POST /api/supervisor/work-orders/:id/complete
supervisorRouter.post('/work-orders/:id/complete', (req: Request, res: Response): void => {
  const user = (req as any).user as User;
  const woId = parseInt(req.params.id, 10);
  const wo = db.workOrders.find(w => w.id === woId);
  if (!wo) {
    res.status(404).json({ detail: 'Work order not found' });
    return;
  }

  if (wo.status === 'completed') {
    res.status(409).json({ detail: 'Work order is already completed' });
    return;
  }

  const nowIso = new Date().toISOString();
  wo.status = 'completed';
  wo.updatedAt = nowIso;

  db.assignments.forEach(a => {
    if (a.workOrderId === wo.id && !a.unassignedAt) {
      a.unassignedAt = nowIso;
    }
  });

  db.events.push({
    id: db.getNextEventId(),
    workOrderId: wo.id,
    actorId: user.id,
    eventType: 'completed',
    payload: null,
    createdAt: nowIso,
  });

  db.auditLogs.push({
    id: db.getNextAuditLogId(),
    actorId: user.id,
    action: 'work_order.completed',
    resourceType: 'work_order',
    resourceId: String(wo.id),
    detail: null,
    createdAt: nowIso,
  });

  res.json(formatWorkOrder(wo));
});

// ==========================================
// SLA & BACKGROUND JOB CONTROLS
// ==========================================

// POST /api/supervisor/sla/check (Trigger SLA check)
supervisorRouter.post('/sla/check', async (req: Request, res: Response): Promise<void> => {
  const now = Date.now();
  let breachesDetected = 0;

  for (const timer of db.slaTimers) {
    if (!timer.breached && new Date(timer.deadlineAt).getTime() < now) {
      const wo = db.workOrders.find(w => w.id === timer.workOrderId);
      if (wo && (wo.status === 'open' || wo.status === 'in_progress')) {
        timer.breached = true;
        breachesDetected++;
        db.events.push({
          id: db.getNextEventId(),
          workOrderId: wo.id,
          actorId: 'system-sla',
          eventType: 'sla_breached',
          payload: JSON.stringify({ sla_type: timer.slaType, deadline: timer.deadlineAt }),
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  res.json({
    success: true,
    message: `SLA check completed. ${breachesDetected} new breaches flagged.`,
    breaches_detected: breachesDetected,
    total_breached: db.slaTimers.filter(s => s.breached).length,
  });
});

// GET /api/supervisor/jobs (Inspect background queue)
supervisorRouter.get('/jobs', (req: Request, res: Response): void => {
  const jobs = jobQueue.getAllJobs();
  res.json({
    jobs,
    total: jobs.length,
    pending: jobs.filter(j => j.status === 'pending').length,
    processing: jobs.filter(j => j.status === 'processing').length,
    completed: jobs.filter(j => j.status === 'completed').length,
    failed: jobs.filter(j => j.status === 'failed').length,
  });
});
