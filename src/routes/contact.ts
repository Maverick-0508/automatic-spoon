import { Router, Request, Response } from 'express';
import { db } from '../db.js';
import { WorkOrder, WorkOrderPriority } from '../types.js';
import { isQuoteRequest } from '../quoteService.js';
import { jobQueue } from '../jobQueue.js';

export const contactRouter = Router();

// POST /api/contact and POST /contact
// Companion site (friendly-telegram) sends { name, email, phone, message, address?, service?, services? }
contactRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name,
      fullName,
      full_name,
      email,
      phone,
      message,
      notes,
      address,
      service,
      services,
      zone,
      preferred_date,
    } = req.body || {};

    const clientName = (name || fullName || full_name || 'Website Inquiry').trim();
    const clientEmail = email ? String(email).trim() : null;
    const clientPhone = phone ? String(phone).trim() : null;
    const userMessage = (message || notes || service || 'General inquiry from LawnCraft website').trim();

    if (!clientEmail && !clientPhone) {
      res.status(400).json({
        success: false,
        detail: 'Please provide an email address or phone number so we can get back to you.',
      });
      return;
    }

    // 1. Find or create Client
    const client = db.findOrCreateClient({
      fullName: clientName,
      email: clientEmail,
      phone: clientPhone,
      notes: `Contact submission on ${new Date().toLocaleDateString()}`,
    });

    // 2. Find or create Property if address provided
    let propertyId: string | null = null;
    if (address && address.trim()) {
      const prop = db.findOrCreateProperty({
        clientId: client.id,
        address: address.trim(),
        zone: zone || null,
      });
      propertyId = prop.id;
    }

    // Determine services summary
    let servicesList: string[] = [];
    if (Array.isArray(services)) {
      servicesList = services.filter(Boolean);
    } else if (service) {
      servicesList = [service];
    }

    const titlePrefix = isQuoteRequest(userMessage) || servicesList.length > 0 ? 'Quote Request' : 'Customer Inquiry';
    const title = servicesList.length > 0
      ? `${titlePrefix}: ${servicesList.join(', ')}`
      : `${titlePrefix} from ${clientName}`;

    // Build rich description
    const descParts = [userMessage];
    if (servicesList.length > 0) {
      descParts.push('\nRequested Services:\n' + servicesList.map(s => `- ${s}`).join('\n'));
    }
    if (address) {
      descParts.push(`\nService Location: ${address}`);
    }
    if (preferred_date) {
      descParts.push(`Preferred Date: ${preferred_date}`);
    }

    const nowIso = new Date().toISOString();
    const dueAt = preferred_date ? new Date(preferred_date).toISOString() : new Date(Date.now() + 86400000 * 2).toISOString();

    // 3. Create Work Order
    const newWo: WorkOrder = {
      id: db.getNextWorkOrderId(),
      clientId: client.id,
      title,
      description: descParts.join('\n'),
      status: 'open',
      priority: 'high' as WorkOrderPriority,
      zone: zone || null,
      propertyId,
      assignedTo: null,
      dueAt,
      nextActionAt: dueAt,
      isQuote: isQuoteRequest(title, userMessage),
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    db.workOrders.push(newWo);

    // Add initial response SLA timer (24h response time)
    const slaDeadline = new Date(Date.now() + 86400000).toISOString();
    db.slaTimers.push({
      id: db.getNextSlaTimerId(),
      workOrderId: newWo.id,
      slaType: 'contact_response_sla',
      deadlineAt: slaDeadline,
      breached: false,
      notified: false,
      createdAt: nowIso,
    });

    db.events.push({
      id: db.getNextEventId(),
      workOrderId: newWo.id,
      actorId: 'public-api',
      eventType: 'contact_form_submitted',
      payload: JSON.stringify({ name: clientName, email: clientEmail, phone: clientPhone }),
      createdAt: nowIso,
    });

    db.auditLogs.push({
      id: db.getNextAuditLogId(),
      actorId: 'public-api',
      action: 'contact.received',
      resourceType: 'work_order',
      resourceId: String(newWo.id),
      detail: `New inquiry from ${clientName} (${clientEmail || clientPhone})`,
      createdAt: nowIso,
    });

    // 4. Asynchronously enqueue quote email if client provided email
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
      message: 'Thank you for contacting LawnCraft. Our team will review your request and be in touch shortly.',
      work_order_id: newWo.id,
      client_id: client.id,
      quote_queued: quoteQueued,
    });
  } catch (err: any) {
    console.error('Error handling contact submission:', err);
    res.status(500).json({ success: false, detail: 'Internal server error while processing request' });
  }
});
