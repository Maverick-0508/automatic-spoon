import { db } from './db.js';
import { BackgroundJob } from './types.js';
import { buildQuotePackage } from './quoteService.js';
import { sendQuoteEmail } from './emailService.js';

export class BackgroundJobQueue {
  private processing = false;
  private timer: NodeJS.Timeout | null = null;

  constructor() {
    this.startWorker();
  }

  enqueue(type: BackgroundJob['type'], payload: any, maxAttempts = 3): BackgroundJob {
    const job: BackgroundJob = {
      id: `job-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      type,
      payload,
      status: 'pending',
      attempts: 0,
      maxAttempts,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.backgroundJobs.unshift(job);
    // Keep max 200 jobs in memory
    if (db.backgroundJobs.length > 200) {
      db.backgroundJobs = db.backgroundJobs.slice(0, 200);
    }

    setImmediate(() => this.processNext());
    return job;
  }

  private startWorker() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.processNext();
    }, 2000);
  }

  async processNext() {
    if (this.processing) return;

    const job = db.backgroundJobs.find(j => j.status === 'pending');
    if (!job) return;

    this.processing = true;
    job.status = 'processing';
    job.attempts += 1;
    job.updatedAt = new Date().toISOString();

    try {
      if (job.type === 'send_quote_email') {
        const { workOrderId, clientId } = job.payload;
        const workOrder = db.workOrders.find(w => w.id === workOrderId);
        const client = db.clients.find(c => c.id === clientId);

        if (!workOrder || !client || !client.email) {
          throw new Error(`Invalid work order or client email for job ${job.id}`);
        }

        const prop = db.properties.find(p => p.clientId === client.id);
        const quotePackage = buildQuotePackage({ client, property: prop, workOrder });

        await sendQuoteEmail({
          toEmail: client.email,
          subject: `Detailed Quote: ${workOrder.title} (Ref WO-${String(workOrder.id).padStart(6, '0')})`,
          textBody: quotePackage.textBody,
          htmlBody: quotePackage.htmlBody,
          attachmentFilename: quotePackage.pdfFilename,
          attachmentBytes: quotePackage.pdfBytes,
        });

        // Add event and audit log
        db.events.push({
          id: db.getNextEventId(),
          workOrderId: workOrder.id,
          actorId: 'system-queue',
          eventType: 'quote_sent',
          payload: JSON.stringify({ recipient: client.email, file: quotePackage.pdfFilename }),
          createdAt: new Date().toISOString(),
        });

        db.auditLogs.push({
          id: db.getNextAuditLogId(),
          actorId: 'system-queue',
          action: 'quote.dispatched',
          resourceType: 'work_order',
          resourceId: String(workOrder.id),
          detail: `Quote sent to ${client.email} asynchronously`,
          createdAt: new Date().toISOString(),
        });
      } else if (job.type === 'sla_check') {
        const now = Date.now();
        let breachesCount = 0;

        db.slaTimers.forEach(timer => {
          if (!timer.breached && new Date(timer.deadlineAt).getTime() < now) {
            const wo = db.workOrders.find(w => w.id === timer.workOrderId);
            if (wo && (wo.status === 'open' || wo.status === 'in_progress')) {
              timer.breached = true;
              breachesCount++;
              db.events.push({
                id: db.getNextEventId(),
                workOrderId: wo.id,
                actorId: 'system-sla',
                eventType: 'sla_breached',
                payload: JSON.stringify({ slaType: timer.slaType, deadline: timer.deadlineAt }),
                createdAt: new Date().toISOString(),
              });
            }
          }
        });

        job.payload.breachesCount = breachesCount;
      } else if (job.type === 'nightly_reconciliation') {
        db.purgeExpiredTokens();
      }

      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      job.updatedAt = new Date().toISOString();
    } catch (err: any) {
      console.error(`Background job ${job.id} failed (attempt ${job.attempts}/${job.maxAttempts}):`, err);
      job.lastError = err.message || 'Unknown error';
      job.updatedAt = new Date().toISOString();

      if (job.attempts >= job.maxAttempts) {
        job.status = 'failed';
      } else {
        job.status = 'pending'; // retry on next tick
      }
    } finally {
      this.processing = false;
    }
  }

  getAllJobs() {
    return db.backgroundJobs;
  }
}

export const jobQueue = new BackgroundJobQueue();
