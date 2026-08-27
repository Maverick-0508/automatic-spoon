import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { authRouter } from './src/routes/auth.js';
import { supervisorRouter } from './src/routes/supervisor.js';
import { contactRouter } from './src/routes/contact.js';
import { quotesRouter } from './src/routes/quotes.js';
import { db } from './src/db.js';

dotenv.config();

const app = express();
const PORT = 3000;
const APP_ENV = process.env.APP_ENV || 'development';

// Middleware
app.use(cors({
  origin: '*',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Token purge timer (hourly)
setInterval(() => {
  db.purgeExpiredTokens();
}, 3600000);

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${req.method}] ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Consumer-facing endpoints (companion site / friendly-telegram compatibility)
app.use('/api/contact', contactRouter);
app.use('/contact', contactRouter);
app.use('/api/quotes', quotesRouter);
app.use('/quotes', quotesRouter);

// Supervisor & Auth Routers
app.use('/api/auth', authRouter);
app.use('/auth', authRouter);
app.use('/api/login', authRouter);
app.use('/login', authRouter);
app.use('/api/token', authRouter);
app.use('/token', authRouter);
app.use('/api/supervisor', supervisorRouter);

// Root route
app.get('/', (req: Request, res: Response): void => {
  if (req.accepts('html') && !req.accepts('json')) {
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LawnCraft Supervisor & Dispatch API Hub</title>
  <style>
    :root {
      --bg: #0b1320;
      --card: #152238;
      --card-alt: #1c2e4a;
      --border: #2a3e5c;
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --primary: #10b981;
      --primary-hover: #059669;
      --accent: #38bdf8;
      --warning: #f59e0b;
      --danger: #ef4444;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 1.5rem; line-height: 1.5; }
    .container { max-width: 1100px; margin: 0 auto; }
    .header { margin-bottom: 1.5rem; border-bottom: 1px solid var(--border); padding-bottom: 1.25rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; }
    .title { font-size: 1.6rem; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 0.5rem; }
    .badge { background: rgba(16, 185, 129, 0.2); color: #34d399; padding: 0.25rem 0.65rem; border-radius: 9999px; font-size: 0.8rem; font-weight: 600; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .kpi-card { background: var(--card); border: 1px solid var(--border); border-radius: 0.6rem; padding: 1rem; text-align: center; }
    .kpi-val { font-size: 1.8rem; font-weight: 800; color: var(--accent); margin-top: 0.2rem; }
    .kpi-label { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
    .tabs { display: flex; gap: 0.5rem; border-bottom: 1px solid var(--border); margin-bottom: 1.5rem; overflow-x: auto; }
    .tab-btn { background: transparent; border: none; color: var(--text-muted); padding: 0.6rem 1.1rem; font-size: 0.95rem; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent; }
    .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
    .tab-pane { display: none; }
    .tab-pane.active { display: block; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
    @media (max-width: 768px) { .grid-2 { grid-template-columns: 1fr; } }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 0.75rem; padding: 1.25rem; margin-bottom: 1.25rem; }
    .card h3 { font-size: 1.1rem; margin-bottom: 0.75rem; color: var(--accent); display: flex; align-items: center; justify-content: space-between; }
    .form-group { margin-bottom: 0.85rem; }
    .form-group label { display: block; font-size: 0.82rem; color: var(--text-muted); margin-bottom: 0.3rem; font-weight: 500; }
    .form-group input, .form-group textarea, .form-group select { width: 100%; background: #090e17; border: 1px solid var(--border); border-radius: 0.4rem; padding: 0.55rem 0.75rem; color: #fff; font-size: 0.88rem; outline: none; }
    .form-group input:focus, .form-group textarea:focus { border-color: var(--accent); }
    .btn { background: var(--primary); color: #fff; border: none; padding: 0.55rem 1rem; border-radius: 0.4rem; font-weight: 600; font-size: 0.88rem; cursor: pointer; transition: background 0.2s; }
    .btn:hover { background: var(--primary-hover); }
    .btn-secondary { background: var(--card-alt); border: 1px solid var(--border); color: #cbd5e1; }
    .btn-secondary:hover { background: #25395a; }
    .btn-warning { background: var(--warning); color: #111; }
    .btn-sm { padding: 0.35rem 0.65rem; font-size: 0.78rem; }
    .table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; font-size: 0.85rem; }
    .table th, .table td { text-align: left; padding: 0.65rem; border-bottom: 1px solid var(--border); }
    .table th { color: var(--text-muted); font-weight: 600; }
    .method { font-weight: 700; font-size: 0.7rem; padding: 0.15rem 0.4rem; border-radius: 0.2rem; display: inline-block; }
    .get { background: rgba(56, 189, 248, 0.2); color: #38bdf8; }
    .post { background: rgba(16, 185, 129, 0.2); color: #34d399; }
    .patch { background: rgba(251, 191, 36, 0.2); color: #fbbf24; }
    .prio-critical { color: var(--danger); font-weight: 700; }
    .prio-high { color: var(--warning); font-weight: 700; }
    .prio-normal { color: #38bdf8; }
    .prio-low { color: #94a3b8; }
    .tag { font-size: 0.75rem; padding: 0.15rem 0.5rem; border-radius: 999px; background: var(--card-alt); border: 1px solid var(--border); }
    .log-box { background: #070b12; border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.85rem; font-family: monospace; font-size: 0.8rem; max-height: 220px; overflow-y: auto; color: #a5f3fc; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <div class="title">🌱 LawnCraft Supervisor Hub <span class="badge">Canonical Node API</span></div>
        <p style="color: var(--text-muted); font-size: 0.88rem; margin-top: 0.2rem;">Unified backend with consumer <code>/api/contact</code> & <code>/api/quotes</code>, async quote PDF generator, worker dispatch & SLA tracking</p>
      </div>
      <div style="display: flex; gap: 0.5rem; align-items: center;">
        <button id="quickLoginBtn" class="btn btn-secondary btn-sm" onclick="loginSupervisor()">⚡ Auth as Admin</button>
        <button class="btn btn-secondary btn-sm" onclick="triggerSlaCheck()">⏱ Run SLA Check</button>
      </div>
    </div>

    <!-- KPI Summary Row -->
    <div class="kpi-grid" id="kpiGrid">
      <div class="kpi-card">
        <div class="kpi-label">Open Orders</div>
        <div class="kpi-val" id="kpiOpen">-</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">High/Critical</div>
        <div class="kpi-val" id="kpiHigh" style="color: var(--warning);">-</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Overdue / Breach</div>
        <div class="kpi-val" id="kpiOverdue" style="color: var(--danger);">-</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Active Technicians</div>
        <div class="kpi-val" id="kpiWorkers">-</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Clients</div>
        <div class="kpi-val" id="kpiClients">-</div>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div class="tabs">
      <button class="tab-btn active" onclick="switchTab('queueTab', this)">📋 Work Orders & Dispatch</button>
      <button class="tab-btn" onclick="switchTab('consumerTab', this)">📬 Consumer Forms (Contact & Quotes)</button>
      <button class="tab-btn" onclick="switchTab('clientsTab', this)">👥 Clients & Properties</button>
      <button class="tab-btn" onclick="switchTab('jobsTab', this)">⚡ Async Background Queue</button>
      <button class="tab-btn" onclick="switchTab('apiTab', this)">📚 API Specification</button>
    </div>

    <!-- Tab 1: Work Orders & Dispatch -->
    <div id="queueTab" class="tab-pane active">
      <div class="card">
        <h3>
          <span>Active Work Orders Queue</span>
          <button class="btn btn-sm" onclick="loadWorkOrders()">↻ Refresh Queue</button>
        </h3>
        <div style="overflow-x: auto;">
          <table class="table" id="ordersTable">
            <thead>
              <tr>
                <th>ID</th>
                <th>Client</th>
                <th>Title / Scope</th>
                <th>Priority</th>
                <th>Zone</th>
                <th>Assigned Crew</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="ordersTbody">
              <tr><td colspan="8" style="text-align: center; color: var(--text-muted);">Loading active work orders...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Tab 2: Consumer Forms Test (Contact & Quotes) -->
    <div id="consumerTab" class="tab-pane">
      <div class="grid-2">
        <!-- Contact Form (friendly-telegram payload) -->
        <div class="card">
          <h3>📬 Submit /api/contact (Website Form)</h3>
          <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 0.85rem;">Payload matches friendly-telegram <code>script.js</code>: { name, email, phone, message, address, service }</p>
          <form id="contactForm" onsubmit="submitContactForm(event)">
            <div class="form-group">
              <label>Full Name</label>
              <input type="text" id="cName" value="James Caldwell" required />
            </div>
            <div class="form-group">
              <label>Email Address (For Quote PDF)</label>
              <input type="email" id="cEmail" value="j.caldwell@example.com" required />
            </div>
            <div class="form-group">
              <label>Phone Number</label>
              <input type="text" id="cPhone" value="+1 (555) 890-1234" />
            </div>
            <div class="form-group">
              <label>Service Address</label>
              <input type="text" id="cAddress" value="512 Barton Springs Rd, Austin, TX 78704" />
            </div>
            <div class="form-group">
              <label>Inquiry Message / Requested Tasks</label>
              <textarea id="cMessage" rows="3">Interested in seasonal aerating, lawn fertilization, and weekly mowing.</textarea>
            </div>
            <button type="submit" class="btn" style="width: 100%;">Submit Contact Inquiry</button>
          </form>
        </div>

        <!-- Quote Form (submitQuoteRequest payload) -->
        <div class="card">
          <h3>📄 Submit /api/quotes (Quote Generator)</h3>
          <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 0.85rem;">Payload matches <code>submitQuoteRequest()</code> schema with task breakdown & async PDF.</p>
          <form id="quoteForm" onsubmit="submitQuoteForm(event)">
            <div class="form-group">
              <label>Customer Name</label>
              <input type="text" id="qName" value="Elena Rostova" required />
            </div>
            <div class="form-group">
              <label>Customer Email</label>
              <input type="email" id="qEmail" value="elena.rostova@gmail.com" required />
            </div>
            <div class="form-group">
              <label>Service Address & Zone</label>
              <input type="text" id="qAddress" value="412 Westlake Ridge Trail, Austin, TX 78746" />
            </div>
            <div class="form-group">
              <label>Services (Comma separated)</label>
              <input type="text" id="qServices" value="Lawn Mowing, Perimeter Edging, Organic Fertilizer" />
            </div>
            <div class="form-group">
              <label>Special Instructions / Notes</label>
              <textarea id="qNotes" rows="3">Backyard has gentle slope. Please avoid sprinkler heads near gazebo.</textarea>
            </div>
            <button type="submit" class="btn" style="width: 100%;">Generate Quote & Enqueue Email</button>
          </form>
        </div>
      </div>

      <div class="card">
        <h3>Live API Response Output</h3>
        <pre class="log-box" id="responseLog">Awaiting form submission...</pre>
      </div>
    </div>

    <!-- Tab 3: Clients & Properties -->
    <div id="clientsTab" class="tab-pane">
      <div class="card">
        <h3>
          <span>Client Database (<code>/api/supervisor/clients</code>)</span>
          <button class="btn btn-sm" onclick="loadClients()">↻ Refresh</button>
        </h3>
        <div style="margin-bottom: 1rem; display: flex; gap: 0.5rem;">
          <input type="text" id="clientSearch" placeholder="Search by name, email, or phone..." oninput="loadClients()" style="background:#090e17; border: 1px solid var(--border); border-radius: 0.4rem; padding: 0.5rem 0.75rem; color:#fff; flex: 1;" />
        </div>
        <div style="overflow-x: auto;">
          <table class="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Client Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Properties</th>
                <th>Open Orders</th>
              </tr>
            </thead>
            <tbody id="clientsTbody">
              <tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Loading clients...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Tab 4: Async Background Queue -->
    <div id="jobsTab" class="tab-pane">
      <div class="card">
        <h3>
          <span>Background Job Queue (<code>/api/supervisor/jobs</code>)</span>
          <button class="btn btn-sm" onclick="loadJobs()">↻ Refresh Jobs</button>
        </h3>
        <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1rem;">Resolves SMTP blocking latency by offloading quote PDF creation & email delivery to async worker queue with exponential retries.</p>
        <div style="overflow-x: auto;">
          <table class="table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Type</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Created At</th>
                <th>Payload Summary</th>
              </tr>
            </thead>
            <tbody id="jobsTbody">
              <tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Loading jobs...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Tab 5: API Specification -->
    <div id="apiTab" class="tab-pane">
      <div class="card">
        <h3>Canonical Endpoints Overview</h3>
        <table class="table">
          <thead>
            <tr>
              <th>Method</th>
              <th>Endpoint</th>
              <th>Description</th>
              <th>Target / Consumers</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><span class="method post">POST</span></td>
              <td><code>/api/contact</code> & <code>/contact</code></td>
              <td>Submit consumer contact inquiry & auto-link client/work order</td>
              <td>Website (friendly-telegram script.js)</td>
            </tr>
            <tr>
              <td><span class="method post">POST</span></td>
              <td><code>/api/quotes</code> & <code>/quotes</code></td>
              <td>Create quote request with async PDF & email generation</td>
              <td>Website (submitQuoteRequest)</td>
            </tr>
            <tr>
              <td><span class="method get">GET</span></td>
              <td><code>/api/quotes/:id/pdf</code></td>
              <td>Download or inline preview generated quote PDF</td>
              <td>Public / Client</td>
            </tr>
            <tr>
              <td><span class="method post">POST</span></td>
              <td><code>/api/auth/login/json</code></td>
              <td>Issue supervisor / admin JWT access & refresh tokens</td>
              <td>Supervisor Portal</td>
            </tr>
            <tr>
              <td><span class="method get">GET</span></td>
              <td><code>/api/supervisor/stats</code></td>
              <td>Single-pass aggregated operational dashboard metrics</td>
              <td>Supervisor Portal</td>
            </tr>
            <tr>
              <td><span class="method get">GET</span></td>
              <td><code>/api/supervisor/queue</code></td>
              <td>Prioritized work order queue with client and address context</td>
              <td>Supervisor Portal</td>
            </tr>
            <tr>
              <td><span class="method get">GET</span></td>
              <td><code>/api/supervisor/clients</code></td>
              <td>Paginated client list with search query parameter</td>
              <td>Supervisor Portal</td>
            </tr>
            <tr>
              <td><span class="method get">GET</span></td>
              <td><code>/api/supervisor/workers</code></td>
              <td>List active technicians and assigned workload</td>
              <td>Supervisor Portal</td>
            </tr>
            <tr>
              <td><span class="method post">POST</span></td>
              <td><code>/api/supervisor/work-orders/:id/assign</code></td>
              <td>Assign technician crew lead to work order</td>
              <td>Supervisor Portal</td>
            </tr>
            <tr>
              <td><span class="method post">POST</span></td>
              <td><code>/api/supervisor/work-orders/:id/complete</code></td>
              <td>Mark work order completed and close active assignments</td>
              <td>Supervisor Portal</td>
            </tr>
            <tr>
              <td><span class="method post">POST</span></td>
              <td><code>/api/supervisor/sla/check</code></td>
              <td>Run SLA scan and flag overdue response/dispatch deadlines</td>
              <td>System / Supervisor</td>
            </tr>
            <tr>
              <td><span class="method get">GET</span></td>
              <td><code>/api/supervisor/jobs</code></td>
              <td>Inspect background async job queue and worker health</td>
              <td>Supervisor Portal</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

  </div>

  <script>
    let authToken = '';

    function switchTab(tabId, el) {
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.getElementById(tabId).classList.add('active');
      if (el) el.classList.add('active');
      if (tabId === 'queueTab') loadWorkOrders();
      if (tabId === 'clientsTab') loadClients();
      if (tabId === 'jobsTab') loadJobs();
    }

    async function loginSupervisor() {
      try {
        const res = await fetch('/api/auth/login/json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'admin@lawncraft.com', password: 'Admin@12345!' }),
        });
        const data = await res.json();
        if (data.access_token) {
          authToken = data.access_token;
          document.getElementById('quickLoginBtn').innerText = '✓ Authenticated (Admin)';
          document.getElementById('quickLoginBtn').style.background = 'rgba(16, 185, 129, 0.2)';
          document.getElementById('quickLoginBtn').style.color = '#34d399';
          refreshDashboard();
        }
      } catch (err) {
        console.error('Login error:', err);
      }
    }

    async function refreshDashboard() {
      if (!authToken) await loginSupervisor();
      try {
        const res = await fetch('/api/supervisor/stats', {
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const stats = await res.json();
        document.getElementById('kpiOpen').innerText = stats.total_open ?? 0;
        document.getElementById('kpiHigh').innerText = stats.high_priority ?? 0;
        document.getElementById('kpiOverdue').innerText = stats.overdue ?? 0;
        document.getElementById('kpiWorkers').innerText = stats.active_workers ?? 0;
        document.getElementById('kpiClients').innerText = stats.total_clients ?? 0;
      } catch (err) {
        console.error('Stats error:', err);
      }
      loadWorkOrders();
    }

    async function loadWorkOrders() {
      if (!authToken) await loginSupervisor();
      try {
        const [woRes, workersRes] = await Promise.all([
          fetch('/api/supervisor/work-orders?limit=50', { headers: { 'Authorization': 'Bearer ' + authToken } }),
          fetch('/api/supervisor/workers', { headers: { 'Authorization': 'Bearer ' + authToken } })
        ]);
        const woData = await woRes.json();
        const workersData = await workersRes.json();
        const workers = workersData.workers || [];

        const tbody = document.getElementById('ordersTbody');
        if (!woData.items || woData.items.length === 0) {
          tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">No work orders found.</td></tr>';
          return;
        }

        tbody.innerHTML = woData.items.map(wo => {
          const prioClass = 'prio-' + wo.priority;
          const isDone = wo.status === 'completed';
          
          let workerOptions = '<option value="">-- Assign Crew --</option>';
          workers.forEach(w => {
            const selected = wo.assigned_to === w.id ? 'selected' : '';
            workerOptions += \`<option value="\${w.id}" \${selected}>\${w.full_name} (\${w.active_orders_count} active)</option>\`;
          });

          let actionButtons = '';
          if (wo.is_quote) {
            actionButtons += \`<a href="/api/quotes/\${wo.id}/pdf" target="_blank" class="btn btn-secondary btn-sm" style="text-decoration:none; margin-right:4px;">PDF</a>\`;
          }
          if (!isDone) {
            actionButtons += \`<button class="btn btn-sm" onclick="completeOrder(\${wo.id})">Complete</button>\`;
          } else {
            actionButtons += \`<span class="tag" style="color:#34d399;">✓ Finished</span>\`;
          }

          return \`
            <tr>
              <td><strong>#\${wo.id}</strong></td>
              <td>
                <div><strong>\${wo.client_name || 'N/A'}</strong></div>
                <div style="font-size:0.75rem; color:var(--text-muted);">\${wo.property_address || ''}</div>
              </td>
              <td>\${wo.title}</td>
              <td><span class="\${prioClass}">\${wo.priority}</span></td>
              <td><span class="tag">\${wo.zone || 'unassigned'}</span></td>
              <td>
                <select onchange="assignWorker(\${wo.id}, this.value)" style="background:#090e17; border:1px solid var(--border); color:#fff; border-radius:0.3rem; padding:0.3rem;" \${isDone ? 'disabled' : ''}>
                  \${workerOptions}
                </select>
              </td>
              <td><span class="tag">\${wo.status}</span></td>
              <td>\${actionButtons}</td>
            </tr>
          \`;
        }).join('');
      } catch (err) {
        console.error('Failed to load orders:', err);
      }
    }

    async function assignWorker(woId, workerId) {
      if (!workerId) return;
      if (!authToken) await loginSupervisor();
      try {
        const res = await fetch(\`/api/supervisor/work-orders/\${woId}/assign\`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + authToken
          },
          body: JSON.stringify({ user_id: workerId })
        });
        const data = await res.json();
        refreshDashboard();
      } catch (err) {
        alert('Assignment failed: ' + err.message);
      }
    }

    async function completeOrder(woId) {
      if (!authToken) await loginSupervisor();
      try {
        const res = await fetch(\`/api/supervisor/work-orders/\${woId}/complete\`, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const data = await res.json();
        refreshDashboard();
      } catch (err) {
        alert('Complete failed: ' + err.message);
      }
    }

    async function submitContactForm(e) {
      e.preventDefault();
      const payload = {
        name: document.getElementById('cName').value,
        email: document.getElementById('cEmail').value,
        phone: document.getElementById('cPhone').value,
        address: document.getElementById('cAddress').value,
        message: document.getElementById('cMessage').value,
      };

      const log = document.getElementById('responseLog');
      log.innerText = 'Submitting POST /api/contact ...';

      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        log.innerText = JSON.stringify(data, null, 2);
        refreshDashboard();
      } catch (err) {
        log.innerText = 'Error: ' + err.message;
      }
    }

    async function submitQuoteForm(e) {
      e.preventDefault();
      const payload = {
        name: document.getElementById('qName').value,
        email: document.getElementById('qEmail').value,
        address: document.getElementById('qAddress').value,
        services: document.getElementById('qServices').value.split(',').map(s => s.trim()),
        notes: document.getElementById('qNotes').value,
      };

      const log = document.getElementById('responseLog');
      log.innerText = 'Submitting POST /api/quotes ...';

      try {
        const res = await fetch('/api/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        log.innerText = JSON.stringify(data, null, 2);
        refreshDashboard();
      } catch (err) {
        log.innerText = 'Error: ' + err.message;
      }
    }

    async function loadClients() {
      if (!authToken) await loginSupervisor();
      const query = document.getElementById('clientSearch')?.value || '';
      try {
        const res = await fetch(\`/api/supervisor/clients?q=\${encodeURIComponent(query)}\`, {
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const data = await res.json();
        const tbody = document.getElementById('clientsTbody');
        if (!data.items || data.items.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No clients found.</td></tr>';
          return;
        }
        tbody.innerHTML = data.items.map(c => \`
          <tr>
            <td><strong>#\${c.id}</strong></td>
            <td><strong>\${c.full_name}</strong></td>
            <td>\${c.email || 'N/A'}</td>
            <td>\${c.phone || 'N/A'}</td>
            <td>\${c.properties_count} property</td>
            <td><span class="tag">\${c.open_work_orders} open</span></td>
          </tr>
        \`).join('');
      } catch (err) {
        console.error('Failed to load clients:', err);
      }
    }

    async function loadJobs() {
      if (!authToken) await loginSupervisor();
      try {
        const res = await fetch('/api/supervisor/jobs', {
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const data = await res.json();
        const tbody = document.getElementById('jobsTbody');
        if (!data.jobs || data.jobs.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No jobs in queue.</td></tr>';
          return;
        }
        tbody.innerHTML = data.jobs.map(j => \`
          <tr>
            <td><code>\${j.id}</code></td>
            <td><strong>\${j.type}</strong></td>
            <td><span class="tag" style="color:\${j.status === 'completed' ? '#34d399' : (j.status === 'failed' ? '#ef4444' : '#38bdf8')}">\${j.status}</span></td>
            <td>\${j.attempts} / \${j.maxAttempts}</td>
            <td>\${new Date(j.createdAt).toLocaleTimeString()}</td>
            <td style="font-size:0.75rem; color:var(--text-muted);">\${JSON.stringify(j.payload).substring(0, 50)}...</td>
          </tr>
        \`).join('');
      } catch (err) {
        console.error('Failed to load jobs:', err);
      }
    }

    async function triggerSlaCheck() {
      if (!authToken) await loginSupervisor();
      try {
        const res = await fetch('/api/supervisor/sla/check', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const data = await res.json();
        alert(data.message || 'SLA Check complete');
        refreshDashboard();
      } catch (err) {
        alert('SLA Check error: ' + err.message);
      }
    }

    // Initialize on load
    loginSupervisor();
  </script>
</body>
</html>`);
    return;
  }

  // Default JSON response
  res.json({
    service: 'LawnCraft Supervisor & Dispatch API',
    status: 'ok',
    env: APP_ENV,
    endpoints: {
      consumer_contact: '/api/contact',
      consumer_quotes: '/api/quotes',
      supervisor_api: '/api/supervisor/*',
      auth_api: '/api/auth/*',
      health_live: '/health/live',
      health_ready: '/health/ready',
    },
  });
});

// Health checks
app.get('/health/live', (req: Request, res: Response): void => {
  res.json({ status: 'ok' });
});

app.get('/health/ready', (req: Request, res: Response): void => {
  res.json({ status: 'ready' });
});

// Global 404 handler
app.use((req: Request, res: Response): void => {
  res.status(404).json({ detail: 'Not Found' });
});

// Global error handler
app.use((err: any, req: Request, res: Response, next: any): void => {
  console.error('Unhandled error:', err);
  res.status(500).json({ detail: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`LawnCraft Supervisor API listening on http://0.0.0.0:${PORT}`);
});
