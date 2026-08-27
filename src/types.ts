export interface Role {
  id: number;
  name: string;
  description?: string;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  hashedPassword: string;
  role: 'admin' | 'supervisor' | 'technician' | string;
  isActive: boolean;
  phone?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RefreshToken {
  id: number;
  userId: string;
  tokenHash: string;
  revoked: boolean;
  createdAt: string;
  expiresAt: string;
}

export interface Client {
  id: number;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface Property {
  id: string;
  clientId: number;
  address: string;
  zone?: string | null;
  lat?: number | null;
  lng?: number | null;
  notes?: string | null;
  createdAt: string;
}

export type WorkOrderStatus = 'open' | 'in_progress' | 'completed' | 'cancelled';
export type WorkOrderPriority = 'critical' | 'high' | 'normal' | 'low';

export interface WorkOrder {
  id: number;
  clientId: number;
  title: string;
  description?: string | null;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  zone?: string | null;
  assignedTo?: string | null;
  dueAt?: string | null;
  nextActionAt?: string | null;
  propertyId?: string | null;
  isQuote?: boolean;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrderEvent {
  id: number;
  workOrderId: number;
  actorId?: string | null;
  eventType: string;
  payload?: string | null;
  createdAt: string;
}

export interface Assignment {
  id: number;
  workOrderId: number;
  userId: string;
  assignedAt: string;
  unassignedAt?: string | null;
}

export interface SlaTimer {
  id: number;
  workOrderId: number;
  slaType: string;
  deadlineAt: string;
  breached: boolean;
  notified: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: number;
  actorId?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  detail?: string | null;
  createdAt: string;
}

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface BackgroundJob {
  id: string;
  type: 'send_quote_email' | 'sla_check' | 'generate_report' | 'bulk_import' | 'nightly_reconciliation';
  payload: any;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}
