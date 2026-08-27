import bcrypt from 'bcryptjs';
import { User, Role, RefreshToken, Client, Property, WorkOrder, WorkOrderEvent, Assignment, SlaTimer, AuditLog, BackgroundJob } from './types.js';

export class InMemoryDatabase {
  roles: Role[] = [
    { id: 1, name: 'admin', description: 'Full administrator access' },
    { id: 2, name: 'supervisor', description: 'Field supervisor & dispatcher access' },
    { id: 3, name: 'technician', description: 'Field crew & maintenance technician' },
  ];

  users: User[] = [];
  refreshTokens: RefreshToken[] = [];
  clients: Client[] = [];
  properties: Property[] = [];
  workOrders: WorkOrder[] = [];
  events: WorkOrderEvent[] = [];
  assignments: Assignment[] = [];
  slaTimers: SlaTimer[] = [];
  auditLogs: AuditLog[] = [];
  backgroundJobs: BackgroundJob[] = [];

  private nextClientId = 1;
  private nextWorkOrderId = 1;
  private nextEventId = 1;
  private nextAssignmentId = 1;
  private nextRefreshTokenId = 1;
  private nextSlaTimerId = 1;
  private nextAuditLogId = 1;
  private nextPropertyId = 1;

  constructor() {
    this.seedInitialData();
  }

  private seedInitialData() {
    const now = new Date();
    const isoNow = now.toISOString();
    const hashSync = (pw: string) => bcrypt.hashSync(pw, 10);

    // Users (Admins, Supervisors, Technicians)
    this.users = [
      {
        id: 'u-svc-1',
        email: 'service@lawncraft.com',
        fullName: 'LawnCraft Service Desk',
        hashedPassword: hashSync('Supervisor@12345!'),
        role: 'supervisor',
        isActive: true,
        phone: '+1 (555) 123-4567',
        createdAt: isoNow,
        updatedAt: isoNow,
      },
      {
        id: 'u-admin-1',
        email: 'admin@lawncraft.com',
        fullName: 'Admin User',
        hashedPassword: hashSync('Admin@12345!'),
        role: 'admin',
        isActive: true,
        phone: '+1 (555) 234-5678',
        createdAt: isoNow,
        updatedAt: isoNow,
      },
      {
        id: 'u-sup-1',
        email: 'supervisor@lawncraft.com',
        fullName: 'Supervisor User',
        hashedPassword: hashSync('Supervisor@12345!'),
        role: 'supervisor',
        isActive: true,
        phone: '+1 (555) 345-6789',
        createdAt: isoNow,
        updatedAt: isoNow,
      },
      {
        id: 'u-tech-1',
        email: 'dave.crew@lawncraft.com',
        fullName: 'Dave Kowalski (Crew Lead)',
        hashedPassword: hashSync('Tech@1234!'),
        role: 'technician',
        isActive: true,
        phone: '+1 (555) 456-7890',
        createdAt: isoNow,
        updatedAt: isoNow,
      },
      {
        id: 'u-tech-2',
        email: 'maria.turf@lawncraft.com',
        fullName: 'Maria Rodriguez (Turf Specialist)',
        hashedPassword: hashSync('Tech@1234!'),
        role: 'technician',
        isActive: true,
        phone: '+1 (555) 567-8901',
        createdAt: isoNow,
        updatedAt: isoNow,
      },
      {
        id: 'u-admin-test',
        email: 'admin@test.com',
        fullName: 'Test Admin',
        hashedPassword: hashSync('Test@1234!'),
        role: 'admin',
        isActive: true,
        phone: '+1 (555) 111-2222',
        createdAt: isoNow,
        updatedAt: isoNow,
      },
      {
        id: 'u-sup-test',
        email: 'supervisor@test.com',
        fullName: 'Test Supervisor',
        hashedPassword: hashSync('Test@1234!'),
        role: 'supervisor',
        isActive: true,
        phone: '+1 (555) 333-4444',
        createdAt: isoNow,
        updatedAt: isoNow,
      },
    ];

    // Seed Clients
    this.clients = [
      {
        id: 1,
        fullName: 'Test Client',
        email: 'testclient@test.com',
        phone: '+1 555-0100',
        notes: 'Priority VIP client',
        createdAt: isoNow,
      },
      {
        id: 2,
        fullName: 'Sarah Jenkins',
        email: 'sarah.jenkins@example.com',
        phone: '+1 555-0142',
        notes: 'Weekly maintenance plan subscriber',
        createdAt: isoNow,
      },
      {
        id: 3,
        fullName: 'Marcus Vance',
        email: 'm.vance@residentialcraft.com',
        phone: '+1 555-0188',
        notes: 'Commercial property management group',
        createdAt: isoNow,
      },
      {
        id: 4,
        fullName: 'Elena Rostova',
        email: 'elena.rostova@gmail.com',
        phone: '+1 555-0299',
        notes: 'Requested bi-weekly organic aeration',
        createdAt: isoNow,
      },
    ];
    this.nextClientId = 5;

    // Seed Properties
    this.properties = [
      {
        id: 'prop-1',
        clientId: 1,
        address: '123 Test Street, Austin, TX 78701',
        zone: 'north',
        lat: 30.2672,
        lng: -97.7431,
        notes: 'Front lawn gate unlocked on Thursdays',
        createdAt: isoNow,
      },
      {
        id: 'prop-2',
        clientId: 2,
        address: '742 Evergreen Terrace, Austin, TX 78704',
        zone: 'south',
        lat: 30.2450,
        lng: -97.7600,
        notes: 'Dog on premises (friendly golden retriever)',
        createdAt: isoNow,
      },
      {
        id: 'prop-3',
        clientId: 3,
        address: '890 Oakridge Meadow Way, Austin, TX 78759',
        zone: 'east',
        lat: 30.3950,
        lng: -97.7400,
        notes: 'Commercial property: hedge trimming along perimeter',
        createdAt: isoNow,
      },
      {
        id: 'prop-4',
        clientId: 4,
        address: '412 Westlake Ridge Trail, Austin, TX 78746',
        zone: 'west',
        lat: 30.2800,
        lng: -97.8000,
        notes: 'Sloped backyard lawn, requires mulching mower',
        createdAt: isoNow,
      },
    ];
    this.nextPropertyId = 5;

    // Seed Work Orders
    const pastHour = new Date(now.getTime() - 3600000 * 4).toISOString();
    const tomorrow = new Date(now.getTime() + 86400000).toISOString();
    const yesterday = new Date(now.getTime() - 86400000).toISOString();
    const pastDue = new Date(now.getTime() - 3600000 * 14).toISOString();

    this.workOrders = [
      {
        id: 1,
        clientId: 2,
        title: 'Mow front and back lawns with perimeter edging',
        description: '- Mow front lawn\n- Edge driveway and sidewalks\n- Blow hard surfaces clear',
        status: 'open',
        priority: 'high',
        zone: 'south',
        propertyId: 'prop-2',
        assignedTo: null,
        dueAt: tomorrow,
        nextActionAt: tomorrow,
        isQuote: false,
        createdAt: pastHour,
        updatedAt: pastHour,
      },
      {
        id: 2,
        clientId: 3,
        title: 'Seasonal core aeration and slow-release fertilization',
        description: 'Core aerate 15,000 sq ft perimeter and apply slow-release nitrogen blend',
        status: 'in_progress',
        priority: 'critical',
        zone: 'east',
        propertyId: 'prop-3',
        assignedTo: 'u-tech-1',
        dueAt: pastDue,
        nextActionAt: pastDue,
        isQuote: false,
        createdAt: yesterday,
        updatedAt: pastHour,
      },
      {
        id: 3,
        clientId: 1,
        title: 'Completed hedge trimming & debris clearance',
        description: 'Trim back overgrown bushes along side driveway and bag waste',
        status: 'completed',
        priority: 'normal',
        zone: 'north',
        propertyId: 'prop-1',
        assignedTo: 'u-tech-2',
        dueAt: yesterday,
        nextActionAt: null,
        isQuote: false,
        createdAt: yesterday,
        updatedAt: pastHour,
      },
      {
        id: 4,
        clientId: 4,
        title: 'Quote request: Organic fertilization & weed control program',
        description: '1. Soil pH test\n2. Liquid organic fertilization application\n3. Pre-emergent weed treatment',
        status: 'open',
        priority: 'normal',
        zone: 'west',
        propertyId: 'prop-4',
        assignedTo: null,
        dueAt: tomorrow,
        nextActionAt: tomorrow,
        isQuote: true,
        createdAt: pastHour,
        updatedAt: pastHour,
      },
    ];
    this.nextWorkOrderId = 5;

    // SLA Timers
    this.slaTimers = [
      {
        id: 1,
        workOrderId: 2,
        slaType: 'response_sla',
        deadlineAt: pastDue,
        breached: true,
        notified: false,
        createdAt: yesterday,
      },
      {
        id: 2,
        workOrderId: 1,
        slaType: 'dispatch_sla',
        deadlineAt: tomorrow,
        breached: false,
        notified: false,
        createdAt: pastHour,
      },
    ];
    this.nextSlaTimerId = 3;
  }

  findOrCreateClient(params: { fullName: string; email?: string | null; phone?: string | null; notes?: string | null }): Client {
    const emailNorm = params.email?.trim().toLowerCase();
    const phoneNorm = params.phone?.trim();

    let client = this.clients.find(c => {
      if (emailNorm && c.email?.toLowerCase() === emailNorm) return true;
      if (phoneNorm && c.phone && c.phone.replace(/\D/g, '') === phoneNorm.replace(/\D/g, '')) return true;
      return false;
    });

    if (!client) {
      client = {
        id: this.getNextClientId(),
        fullName: params.fullName.trim(),
        email: params.email?.trim() || null,
        phone: params.phone?.trim() || null,
        notes: params.notes?.trim() || null,
        createdAt: new Date().toISOString(),
      };
      this.clients.push(client);
    } else {
      // Update contact details if newly supplied
      if (params.phone && !client.phone) client.phone = params.phone.trim();
      if (params.email && !client.email) client.email = params.email.trim();
    }

    return client;
  }

  findOrCreateProperty(params: { clientId: number; address: string; zone?: string | null; notes?: string | null }): Property {
    const addressNorm = params.address.trim().toLowerCase();
    let prop = this.properties.find(p => p.clientId === params.clientId && p.address.toLowerCase() === addressNorm);
    if (!prop) {
      prop = {
        id: `prop-${this.nextPropertyId++}`,
        clientId: params.clientId,
        address: params.address.trim(),
        zone: params.zone?.trim() || null,
        lat: null,
        lng: null,
        notes: params.notes?.trim() || null,
        createdAt: new Date().toISOString(),
      };
      this.properties.push(prop);
    }
    return prop;
  }

  purgeExpiredTokens() {
    const now = new Date();
    this.refreshTokens = this.refreshTokens.filter(t => !t.revoked && new Date(t.expiresAt) > now);
  }

  getNextClientId(): number {
    return this.nextClientId++;
  }

  getNextWorkOrderId(): number {
    return this.nextWorkOrderId++;
  }

  getNextEventId(): number {
    return this.nextEventId++;
  }

  getNextAssignmentId(): number {
    return this.nextAssignmentId++;
  }

  getNextRefreshTokenId(): number {
    return this.nextRefreshTokenId++;
  }

  getNextSlaTimerId(): number {
    return this.nextSlaTimerId++;
  }

  getNextAuditLogId(): number {
    return this.nextAuditLogId++;
  }
}

export const db = new InMemoryDatabase();
