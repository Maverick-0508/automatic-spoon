import { Router, Request, Response } from 'express';
import { db } from '../db.js';
import { WorkOrder, WorkOrderPriority } from '../types.js';
import { buildQuotePackage, buildQuotePdfDocument } from '../quoteService.js';
import { jobQueue } from '../jobQueue.js';

export const quotesRouter = Router();

// POST /api/quotes and POST /quotes (matches companion frontend submitQuoteRequest)
quotesRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name,
      fullName,
      full_name,
      email,
      phone,
      address,
      property_address,
      services,
      service,
      notes,
      description,
      preferred_date,
      frequency,
      lot_size,
      zone,
    } = req.body || {};

    const clientName = (name || fullName || full_name || 'Valued Customer').trim();
    const clientEmail = email ? String(email).trim() : null;
    const clientPhone = phone ? String(phone).trim() : null;
    const propAddress = (address || property_address || '').trim();

    if (!clientName) {
      res.status(400).json({ success: false, detail: 'Name is required' });
      return;
    }

    if (!clientEmail && !clientPhone) {
      res.status(400).json({ success: false, detail: 'Email or phone number is required' });
      return;
    }

    // 1. Client
    const client = db.findOrCreateClient({
      fullName: clientName,
      email: clientEmail,
      phone: clientPhone,
      notes: `Quote requested on ${new Date().toLocaleDateString()}`,
    });

    // 2. Property
    let propertyId: string | null = null;
    if (propAddress) {
      const prop = db.findOrCreateProperty({
        clientId: client.id,
        address: propAddress,
        zone: zone || null,
        notes: lot_size ? `Lot size: ${lot_size}` : null,
      });
      propertyId = prop.id;
    }

    // Parse services
    let servicesList: string[] = [];
    if (Array.isArray(services)) {
      servicesList = services.filter(Boolean);
    } else if (typeof services === 'string') {
      servicesList = services.split(',').map(s => s.trim()).filter(Boolean);
    } else if (service) {
      servicesList = [service];
    }

    const title = servicesList.length > 0
      ? `Quote: ${servicesList.join(', ')}`
      : `Quote Request from ${clientName}`;

    // Build task breakdown description
    const descLines: string[] = [];
    if (servicesList.length > 0) {
      servicesList.forEach(s => descLines.push(`- ${s}`));
    }
    if (frequency) {
      descLines.push(`Service frequency: ${frequency}`);
    }
    if (lot_size) {
      descLines.push(`Property lot size: ${lot_size}`);
    }
    if (notes || description) {
      descLines.push(`Client notes: ${notes || description}`);
    }

    const nowIso = new Date().toISOString();
    const dueAt = preferred_date ? new Date(preferred_date).toISOString() : new Date(Date.now() + 86400000 * 2).toISOString();

    const newWo: WorkOrder = {
      id: db.getNextWorkOrderId(),
      clientId: client.id,
      title,
      description: descLines.join('\n'),
      status: 'open',
      priority: 'high' as WorkOrderPriority,
      zone: zone || null,
      propertyId,
      assignedTo: null,
      dueAt,
      nextActionAt: dueAt,
      isQuote: true,
      metadata: {
        frequency,
        lot_size,
        services: servicesList,
      },
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    db.workOrders.push(newWo);

    // Initial SLA
    db.slaTimers.push({
      id: db.getNextSlaTimerId(),
      workOrderId: newWo.id,
      slaType: 'quote_delivery_sla',
      deadlineAt: new Date(Date.now() + 86400000).toISOString(),
      breached: false,
      notified: false,
      createdAt: nowIso,
    });

    db.events.push({
      id: db.getNextEventId(),
      workOrderId: newWo.id,
      actorId: 'public-quote-api',
      eventType: 'quote_requested',
      payload: JSON.stringify({ services: servicesList, email: clientEmail, property: propAddress }),
      createdAt: nowIso,
    });

    db.auditLogs.push({
      id: db.getNextAuditLogId(),
      actorId: 'public-quote-api',
      action: 'quote.requested',
      resourceType: 'work_order',
      resourceId: String(newWo.id),
      detail: `Quote #${newWo.id} created for ${clientName}`,
      createdAt: nowIso,
    });

    // Enqueue async quote generation & email
    let quoteQueued = false;
    if (clientEmail) {
      jobQueue.enqueue('send_quote_email', {
        workOrderId: newWo.id,
        clientId: client.id,
      });
      quoteQueued = true;
    }

    res.status(201).json({
      success: true,
      quote_id: newWo.id,
      work_order_id: newWo.id,
      client_id: client.id,
      status: 'submitted',
      message: 'Your quote request has been received. A detailed quote PDF is being prepared for you.',
      quote_queued: quoteQueued,
    });
  } catch (err: any) {
    console.error('Error handling quote creation:', err);
    res.status(500).json({ success: false, detail: 'Internal server error while creating quote' });
  }
});

// GET /api/quotes/:id/pdf - Preview or download generated quote PDF
quotesRouter.get('/:id/pdf', (req: Request, res: Response): void => {
  const quoteId = parseInt(req.params.id, 10);
  const workOrder = db.workOrders.find(w => w.id === quoteId);
  if (!workOrder) {
    res.status(404).json({ detail: 'Quote / Work Order not found' });
    return;
  }

  const client = db.clients.find(c => c.id === workOrder.clientId);
  if (!client) {
    res.status(404).json({ detail: 'Client not found' });
    return;
  }

  const prop = db.properties.find(p => p.clientId === client.id);
  const pdfBytes = buildQuotePdfDocument({ client, property: prop, workOrder });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="quote-wo-${String(workOrder.id).padStart(6, '0')}.pdf"`);
  res.send(pdfBytes);
});
