import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { authRouter } from './src/routes/auth.js';
import { supervisorRouter } from './src/routes/supervisor.js';
import { contactRouter } from './src/routes/contact.js';
import { quotesRouter } from './src/routes/quotes.js';
import { db } from './src/db.js';
import { getFirebaseConfig } from './src/firebase.js';

dotenv.config();

const app = express();
const PORT = 3000;
const APP_ENV = process.env.APP_ENV || 'development';

// Dynamic CORS Middleware supporting any origin with credentials
app.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-CSRFToken, x-access-token');
  res.header('Access-Control-Expose-Headers', 'Content-Length, Content-Type, Authorization, Set-Cookie');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(cors({
  origin: true,
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
app.use(['/api/contact', '/contact', '/api/v1/contact', '/v1/contact'], contactRouter);
app.use(['/api/quotes', '/quotes', '/api/v1/quotes', '/v1/quotes'], quotesRouter);

// Supervisor & Auth Routers (all path combinations)
app.use([
  '/api/auth',
  '/auth',
  '/api/v1/auth',
  '/v1/auth',
  '/api/login',
  '/login',
  '/api/v1/login',
  '/v1/login',
  '/api/token',
  '/token',
  '/api/v1/token',
  '/v1/token',
  '/api/jwt',
  '/jwt',
  '/api/v1/jwt',
  '/v1/jwt',
  '/api/users',
  '/users',
  '/api/user',
  '/user',
  '/api/me',
  '/me',
  '/api/supervisor/login',
  '/supervisor/login'
], authRouter);

app.use(['/api/supervisor', '/supervisor', '/api/v1/supervisor', '/v1/supervisor'], supervisorRouter);

// Public Firebase config
app.get(['/api/firebase-config', '/firebase-config'], (req: Request, res: Response): void => {
  res.json(getFirebaseConfig());
});

// Render the interactive Supervisor & Dispatch Portal
function renderPortalHtml(req: Request, res: Response) {
  const fbConfig = getFirebaseConfig();
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LawnCraft Supervisor & Dispatch Hub</title>
  <script type="module">
    import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
    import { getAuth, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

    const firebaseConfig = ${JSON.stringify(fbConfig)};
    window.fbApp = initializeApp(firebaseConfig);
    window.fbAuth = getAuth(window.fbApp);
    window.GoogleAuthProvider = GoogleAuthProvider;
    window.signInWithPopup = signInWithPopup;
    window.signInWithEmailAndPassword = signInWithEmailAndPassword;
    console.log("Firebase initialized for project:", firebaseConfig.projectId);
  </script>
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
    .container { max-width: 1140px; margin: 0 auto; }
    .header { margin-bottom: 1.5rem; border-bottom: 1px solid var(--border); padding-bottom: 1.25rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; }
    .title { font-size: 1.6rem; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 0.5rem; }
    .badge { background: rgba(16, 185, 129, 0.2); color: #34d399; padding: 0.25rem 0.65rem; border-radius: 9999px; font-size: 0.8rem; font-weight: 600; }
    
    .auth-banner { background: #111d30; border: 1px solid var(--border); border-radius: 0.6rem; padding: 0.75rem 1rem; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; }
    .auth-user-info { display: flex; align-items: center; gap: 0.75rem; font-size: 0.9rem; }
    .auth-badge { padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; background: rgba(56, 189, 248, 0.2); color: var(--accent); }

    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .kpi-card { background: var(--card); border: 1px solid var(--border); border-radius: 0.6rem; padding: 1rem; text-align: center; }
    .kpi-val { font-size: 1.8rem; font-weight: 800; color: var(--accent); margin-top: 0.2rem; }
    .kpi-label { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
    
    .tabs { display: flex; gap: 0.5rem; border-bottom: 1px solid var(--border); margin-bottom: 1.5rem; overflow-x: auto; }
    .tab-btn { background: transparent; border: none; color: var(--text-muted); padding: 0.6rem 1.1rem; font-size: 0.95rem; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent; white-space: nowrap; }
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
    
    .btn { background: var(--primary); color: #fff; border: none; padding: 0.55rem 1rem; border-radius: 0.4rem; font-weight: 600; font-size: 0.88rem; cursor: pointer; transition: background 0.2s; display: inline-flex; align-items: center; gap: 0.4rem; }
    .btn:hover { background: var(--primary-hover); }
    .btn-secondary { background: var(--card-alt); border: 1px solid var(--border); color: #cbd5e1; }
    .btn-secondary:hover { background: #25395a; }
    .btn-warning { background: var(--warning); color: #111; }
    .btn-danger { background: var(--danger); color: #fff; }
    .btn-firebase { background: #ea580c; color: #fff; }
    .btn-firebase:hover { background: #c2410c; }
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
    
    /* Login Modal */
    .modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 9999; align-items: center; justify-content: center; padding: 1rem; }
    .modal.active { display: flex; }
    .modal-content { background: var(--card); border: 1px solid var(--border); border-radius: 0.75rem; max-width: 440px; width: 100%; padding: 1.5rem; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <div class="title">🌱 LawnCraft Supervisor Hub <span class="badge">Canonical Node API</span></div>
        <p style="color: var(--text-muted); font-size: 0.88rem; margin-top: 0.2rem;">Unified backend with Firebase Auth, consumer <code>/api/contact</code> & <code>/api/quotes</code>, async quote PDF generator, worker dispatch & SLA tracking</p>
      </div>
      <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
        <button id="openAuthModalBtn" class="btn btn-secondary btn-sm" onclick="openLoginModal()">🔑 Sign In / Switch Account</button>
        <button class="btn btn-secondary btn-sm" onclick="triggerSlaCheck()">⏱ Run SLA Check</button>
      </div>
    </div>

    <!-- Active Authentication Status Banner -->
    <div class="auth-banner" id="authBanner">
      <div class="auth-user-info">
        <span>👤 Signed in as: <strong id="currentUserName">LawnCraft Service Desk</strong></span>
        <span class="auth-badge" id="currentUserRole">SUPERVISOR</span>
        <span style="color: var(--text-muted); font-size: 0.8rem;" id="currentUserEmail">(service@lawncraft.com)</span>
      </div>
      <div style="display: flex; gap: 0.5rem;">
        <button class="btn btn-sm btn-secondary" onclick="quickLogin('service@lawncraft.com', 'Supervisor@12345!')">⚡ Service Desk</button>
        <button class="btn btn-sm btn-secondary" onclick="quickLogin('admin@lawncraft.com', 'Admin@12345!')">⚡ Admin</button>
        <button class="btn btn-sm btn-secondary" onclick="quickLogin('stunningwaddle@gmail.com', 'Supervisor@12345!')">⚡ Owner Account</button>
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
      <button class="tab-btn" onclick="switchTab('firebaseTab', this)">🔥 Firebase Auth & Sync</button>
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
          <span>Client Roster & Properties</span>
          <div style="display: flex; gap: 0.5rem;">
            <input type="text" id="clientSearch" placeholder="Search name, email, phone..." style="background:#090e17; border:1px solid var(--border); border-radius:4px; padding:0.3rem 0.6rem; color:#fff; font-size:0.8rem; width:220px;" oninput="loadClients()" />
            <button class="btn btn-sm" onclick="loadClients()">Search</button>
          </div>
        </h3>
        <div style="overflow-x: auto;">
          <table class="table" id="clientsTable">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
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
          <span>Async Job Queue & Worker Status</span>
          <button class="btn btn-sm" onclick="loadJobs()">↻ Refresh Jobs</button>
        </h3>
        <div style="overflow-x: auto;">
          <table class="table" id="jobsTable">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Task Type</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Enqueued At</th>
                <th>Payload Summary</th>
              </tr>
            </thead>
            <tbody id="jobsTbody">
              <tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Loading job queue...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Tab 5: Firebase Auth & Sync -->
    <div id="firebaseTab" class="tab-pane">
      <div class="grid-2">
        <div class="card">
          <h3>🔥 Firebase Configuration</h3>
          <p style="color: var(--text-muted); font-size: 0.82rem; margin-bottom: 0.85rem;">Connected Firebase instance details for Firestore & Auth:</p>
          <div style="font-size: 0.85rem; line-height: 1.8;">
            <div><strong>Project ID:</strong> <code>${fbConfig.projectId}</code></div>
            <div><strong>Auth Domain:</strong> <code>${fbConfig.authDomain}</code></div>
            <div><strong>App ID:</strong> <code>${fbConfig.appId}</code></div>
            <div><strong>Database ID:</strong> <code>${fbConfig.firestoreDatabaseId || '(default)'}</code></div>
          </div>
          <div style="margin-top: 1.25rem;">
            <button class="btn btn-firebase" onclick="loginWithGoogleFirebase()">🔥 Sign in with Google (Firebase)</button>
          </div>
        </div>

        <div class="card">
          <h3>Token & Session Inspector</h3>
          <div class="form-group">
            <label>Current Bearer Access Token</label>
            <textarea id="tokenDisplay" rows="3" readonly style="font-family: monospace; font-size: 0.75rem;"></textarea>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="verifyTokenLive()">Verify Token with /api/auth/me</button>
          <pre class="log-box" id="tokenVerifyLog" style="margin-top: 0.75rem;">Click verify to test token validity...</pre>
        </div>
      </div>
    </div>

    <!-- Tab 6: API Spec -->
    <div id="apiTab" class="tab-pane">
      <div class="card">
        <h3>LawnCraft Supervisor & Consumer API Endpoints</h3>
        <table class="table">
          <thead>
            <tr>
              <th>Method</th>
              <th>Endpoint</th>
              <th>Description</th>
              <th>Consumer</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><span class="method post">POST</span></td>
              <td><code>/api/contact</code> or <code>/contact</code></td>
              <td>Accept contact submissions from website and dispatch quote tasks</td>
              <td>Consumer Site</td>
            </tr>
            <tr>
              <td><span class="method post">POST</span></td>
              <td><code>/api/quotes</code> or <code>/quotes</code></td>
              <td>Accept detailed quote requests with task breakdown and generate async PDF</td>
              <td>Consumer Site</td>
            </tr>
            <tr>
              <td><span class="method get">GET</span></td>
              <td><code>/api/quotes/:id/pdf</code></td>
              <td>Preview or download generated LawnCraft Quote PDF package</td>
              <td>Customer / Supervisor</td>
            </tr>
            <tr>
              <td><span class="method post">POST</span></td>
              <td><code>/api/auth/login</code> or <code>/api/auth/firebase</code></td>
              <td>Authenticate supervisor or administrator and issue JWT / Bearer tokens</td>
              <td>Supervisor Portal</td>
            </tr>
            <tr>
              <td><span class="method get">GET</span></td>
              <td><code>/api/supervisor/stats</code></td>
              <td>Get single-pass aggregated metrics (open, high priority, overdue, technicians)</td>
              <td>Supervisor Portal</td>
            </tr>
            <tr>
              <td><span class="method get">GET</span></td>
              <td><code>/api/supervisor/work-orders</code></td>
              <td>List and filter work orders with SLA deadlines and assigned technician</td>
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

  <!-- Sign In / Switch Account Modal -->
  <div class="modal" id="loginModal">
    <div class="modal-content">
      <h3 style="color: var(--accent); margin-bottom: 0.5rem;">Supervisor & Admin Sign In</h3>
      <p style="color: var(--text-muted); font-size: 0.82rem; margin-bottom: 1rem;">Choose a default supervisor account or sign in with your credentials.</p>
      
      <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.25rem;">
        <button class="btn btn-secondary" onclick="quickLogin('service@lawncraft.com', 'Supervisor@12345!')">
          🌱 Sign in as Service Desk (service@lawncraft.com)
        </button>
        <button class="btn btn-secondary" onclick="quickLogin('admin@lawncraft.com', 'Admin@12345!')">
          🛡️ Sign in as Admin (admin@lawncraft.com)
        </button>
        <button class="btn btn-secondary" onclick="quickLogin('stunningwaddle@gmail.com', 'Supervisor@12345!')">
          ⭐ Sign in as Primary Owner (stunningwaddle@gmail.com)
        </button>
        <button class="btn btn-firebase" onclick="loginWithGoogleFirebase()">
          🔥 Sign in with Google (Firebase Auth)
        </button>
      </div>

      <div style="border-top: 1px solid var(--border); padding-top: 1rem; margin-top: 0.5rem;">
        <form onsubmit="handleManualLogin(event)">
          <div class="form-group">
            <label>Email Address</label>
            <input type="text" id="mEmail" placeholder="e.g. service@lawncraft.com" required />
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" id="mPassword" placeholder="••••••••••••" required />
          </div>
          <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem;">
            <button type="button" class="btn btn-secondary" onclick="closeLoginModal()">Cancel</button>
            <button type="submit" class="btn">Sign In</button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <script>
    let authToken = localStorage.getItem('lc_auth_token') || '';
    let currentUser = null;

    function openLoginModal() {
      document.getElementById('loginModal').classList.add('active');
    }

    function closeLoginModal() {
      document.getElementById('loginModal').classList.remove('active');
    }

    function switchTab(tabId, el) {
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.getElementById(tabId).classList.add('active');
      if (el) el.classList.add('active');
      if (tabId === 'queueTab') loadWorkOrders();
      if (tabId === 'clientsTab') loadClients();
      if (tabId === 'jobsTab') loadJobs();
      if (tabId === 'firebaseTab') updateTokenDisplay();
    }

    function updateAuthUI(user, token) {
      currentUser = user;
      authToken = token;
      localStorage.setItem('lc_auth_token', token);
      if (user) {
        document.getElementById('currentUserName').innerText = user.full_name || user.fullName || user.email;
        document.getElementById('currentUserRole').innerText = (user.role || 'supervisor').toUpperCase();
        document.getElementById('currentUserEmail').innerText = '(' + user.email + ')';
      }
      updateTokenDisplay();
      refreshDashboard();
    }

    function updateTokenDisplay() {
      const el = document.getElementById('tokenDisplay');
      if (el) el.value = authToken || 'No active token';
    }

    async function quickLogin(email, password) {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (data.access_token || data.token) {
          const tok = data.access_token || data.token;
          updateAuthUI(data.user, tok);
          closeLoginModal();
        } else {
          alert('Login failed: ' + (data.detail || data.message || 'Invalid credentials'));
        }
      } catch (err) {
        alert('Login error: ' + err.message);
      }
    }

    async function handleManualLogin(e) {
      e.preventDefault();
      const email = document.getElementById('mEmail').value;
      const password = document.getElementById('mPassword').value;
      await quickLogin(email, password);
    }

    async function loginWithGoogleFirebase() {
      try {
        if (!window.fbAuth) {
          alert('Firebase Auth is initializing, please wait a second and retry.');
          return;
        }
        const provider = new window.GoogleAuthProvider();
        const result = await window.signInWithPopup(window.fbAuth, provider);
        const idToken = await result.user.getIdToken();
        
        // Exchange with backend
        const res = await fetch('/api/auth/firebase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idToken,
            email: result.user.email,
            displayName: result.user.displayName,
          })
        });
        const data = await res.json();
        if (data.access_token || data.token) {
          updateAuthUI(data.user, data.access_token || data.token);
          closeLoginModal();
          alert('Signed in with Firebase as ' + result.user.email);
        }
      } catch (err) {
        console.error('Firebase Auth Error:', err);
        alert('Firebase Google Sign-In note: ' + err.message);
      }
    }

    async function ensureAuth() {
      if (!authToken) {
        await quickLogin('service@lawncraft.com', 'Supervisor@12345!');
      }
    }

    async function refreshDashboard() {
      if (!authToken) return;
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
      await ensureAuth();
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
      await ensureAuth();
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
      await ensureAuth();
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
      await ensureAuth();
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
      await ensureAuth();
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

    async function verifyTokenLive() {
      const log = document.getElementById('tokenVerifyLog');
      log.innerText = 'Calling GET /api/auth/me ...';
      try {
        const res = await fetch('/api/auth/me', {
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const data = await res.json();
        log.innerText = JSON.stringify(data, null, 2);
      } catch (err) {
        log.innerText = 'Verification Error: ' + err.message;
      }
    }

    async function triggerSlaCheck() {
      await ensureAuth();
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

    // Default initialization
    if (!authToken) {
      quickLogin('service@lawncraft.com', 'Supervisor@12345!');
    } else {
      refreshDashboard();
    }
  </script>
</body>
</html>`);
}

// Routes serving the HTML UI
app.get(['/', '/supervisor', '/portal', '/dashboard'], (req: Request, res: Response): void => {
  if (req.accepts('html') && !req.accepts('json')) {
    renderPortalHtml(req, res);
    return;
  }

  // Default JSON response for API consumers
  res.json({
    service: 'LawnCraft Supervisor & Dispatch API',
    status: 'ok',
    env: APP_ENV,
    endpoints: {
      consumer_contact: '/api/contact',
      consumer_quotes: '/api/quotes',
      supervisor_api: '/api/supervisor/*',
      auth_api: '/api/auth/*',
      firebase_config: '/api/firebase-config',
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
