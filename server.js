
  //Jossy Sagide — Full-Stack Server
  //Plain Node.js — zero npm packages required
 

require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || '';

// Admin authentication
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const adminSessions = new Map(); // sessionId -> { createdAt, expiresAt }

function generateSession() {
  const sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  const now = Date.now();
  adminSessions.set(sessionId, { createdAt: now, expiresAt: now + 24 * 60 * 60 * 1000 }); // 24h
  return sessionId;
}

function isValidSession(sessionId) {
  if (!sessionId) return false;
  const session = adminSessions.get(sessionId);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    adminSessions.delete(sessionId);
    return false;
  }
  return true;
}

let mongoClient;
let mongoDb;

async function connectMongo() {
  if (!MONGODB_URI) {
    console.warn('MONGODB_URI not set; skipping MongoDB connection');
    return;
  }
  mongoClient = new MongoClient(MONGODB_URI, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    }
  });
  try {
    await mongoClient.connect();
    mongoDb = mongoClient.db();
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection failed:', err);
  }
}

const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

const PORT         = process.env.PORT || 3000;
const DATA_DIR     = path.join(__dirname, 'data');
const PUBLIC_DIR   = path.join(__dirname, 'public');
const PRODUCTS_F   = path.join(DATA_DIR, 'products.json');
const ORDERS_F     = path.join(DATA_DIR, 'orders.json');

// ── helpers ──────────────────────────────────────────────────────────────────

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css' : 'text/css',
  '.js'  : 'application/javascript',
  '.json': 'application/json',
  '.png' : 'image/png',
  '.jpg' : 'image/jpeg',
  '.ico' : 'image/x-icon',
  '.svg' : 'image/svg+xml'
};

function staticFile(res, filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404); res.end('Not found'); return;
  }
  const ext  = path.extname(filePath);
  const type = MIME[ext] || 'text/plain';
  res.writeHead(200, { 'Content-Type': type });
  fs.createReadStream(filePath).pipe(res);
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function bodyJSON(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => (raw += c));
    req.on('end',  () => {
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(e); }
    });
  });
}

// ── router ───────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const { pathname, query } = url.parse(req.url, true);
  const method = req.method;

  // CORS (helpful for local dev)
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  // ── API ──────────────────────────────────────────────────────────────────

  // Helper: Check admin session from cookie or header
  const getAdminSessionId = (req, res) => {
    const cookie = req.headers.cookie || '';
    const match = cookie.match(/adminSession=([^;]+)/);
    return match ? match[1] : null;
  };

  const requireAdmin = (sessionId) => isValidSession(sessionId);

  // POST /api/login  (admin login)
  if (method === 'POST' && pathname === '/api/login') {
    try {
      const body = await bodyJSON(req);
      if (body.password === ADMIN_PASSWORD) {
        const sessionId = generateSession();
        res.setHeader('Set-Cookie', `adminSession=${sessionId}; Path=/; HttpOnly; Max-Age=${24 * 60 * 60}`);
        return json(res, 200, { success: true, sessionId });
      } else {
        return json(res, 401, { error: 'Invalid password' });
      }
    } catch (e) { return json(res, 400, { error: 'Bad JSON' }); }
  }

  // POST /api/logout  (admin logout)
  if (method === 'POST' && pathname === '/api/logout') {
    const sessionId = getAdminSessionId(req, res);
    if (sessionId) {
      adminSessions.delete(sessionId);
    }
    res.setHeader('Set-Cookie', 'adminSession=; Path=/; HttpOnly; Max-Age=0');
    return json(res, 200, { success: true });
  }

  // GET /api/products  [?category=Men|Women|Kids]
  if (method === 'GET' && pathname === '/api/products') {
    let products = readJSON(PRODUCTS_F);
    if (query.category) {
      products = products.filter(p => p.category.toLowerCase() === query.category.toLowerCase());
    }
    if (query.search) {
      const q = query.search.toLowerCase();
      products = products.filter(p => p.name.toLowerCase().includes(q));
    }
    return json(res, 200, products);
  }

  // GET /api/products/:id
  if (method === 'GET' && /^\/api\/products\/\d+$/.test(pathname)) {
    const id  = parseInt(pathname.split('/').pop(), 10);
    const all = readJSON(PRODUCTS_F);
    const p   = all.find(x => x.id === id);
    if (!p) return json(res, 404, { error: 'Not found' });
    return json(res, 200, p);
  }

  // POST /api/products  (admin: add product)
  if (method === 'POST' && pathname === '/api/products') {
    const sessionId = getAdminSessionId(req, res);
    if (!requireAdmin(sessionId)) {
      return json(res, 401, { error: 'Unauthorized. Admin login required.' });
    }
    try {
      const body = await bodyJSON(req);
      const all  = readJSON(PRODUCTS_F);
      const newP = {
        id      : Date.now(),
        name    : body.name    || 'Unnamed',
        price   : Number(body.price)  || 0,
        category: body.category || 'Men',
        badge   : body.badge   || null,
        sizes   : body.sizes   || ['S','M','L','XL'],
        img     : body.img     || '',
        stock   : Number(body.stock)  || 0
      };
      all.push(newP);
      writeJSON(PRODUCTS_F, all);
      return json(res, 201, newP);
    } catch (e) { return json(res, 400, { error: 'Bad JSON' }); }
  }

  // PUT /api/products/:id  (admin: update product)
  if (method === 'PUT' && /^\/api\/products\/\d+$/.test(pathname)) {
    const sessionId = getAdminSessionId(req, res);
    if (!requireAdmin(sessionId)) {
      return json(res, 401, { error: 'Unauthorized. Admin login required.' });
    }
    try {
      const id   = parseInt(pathname.split('/').pop(), 10);
      const body = await bodyJSON(req);
      const all  = readJSON(PRODUCTS_F);
      const idx  = all.findIndex(x => x.id === id);
      if (idx === -1) return json(res, 404, { error: 'Not found' });
      all[idx] = { ...all[idx], ...body, id };
      writeJSON(PRODUCTS_F, all);
      return json(res, 200, all[idx]);
    } catch (e) { return json(res, 400, { error: 'Bad JSON' }); }
  }

  // DELETE /api/products/:id  (admin)
  if (method === 'DELETE' && /^\/api\/products\/\d+$/.test(pathname)) {
    const sessionId = getAdminSessionId(req, res);
    if (!requireAdmin(sessionId)) {
      return json(res, 401, { error: 'Unauthorized. Admin login required.' });
    }
    const id  = parseInt(pathname.split('/').pop(), 10);
    const all = readJSON(PRODUCTS_F);
    const filtered = all.filter(x => x.id !== id);
    if (filtered.length === all.length) return json(res, 404, { error: 'Not found' });
    writeJSON(PRODUCTS_F, filtered);
    return json(res, 200, { message: 'Deleted' });
  }

  // POST /api/orders  (customer checkout)
  if (method === 'POST' && pathname === '/api/orders') {
    try {
      const body   = await bodyJSON(req);
      if (!body.name || !body.phone || !body.address || !body.items?.length) {
        return json(res, 400, { error: 'Missing required fields: name, phone, address, items' });
      }
      const orders = readJSON(ORDERS_F);
      const total  = body.items.reduce((s, i) => s + i.price * i.qty, 0);
      const order  = {
        id       : 'JS-' + Date.now(),
        name     : body.name,
        phone    : body.phone,
        address  : body.address,
        county   : body.county   || '',
        items    : body.items,
        total,
        status   : 'Pending',
        notes    : body.notes    || '',
        createdAt: new Date().toISOString()
      };
      orders.push(order);
      writeJSON(ORDERS_F, orders);
      return json(res, 201, { message: 'Order placed!', order });
    } catch (e) { return json(res, 400, { error: 'Bad JSON' }); }
  }

  // GET /api/orders  (admin)
  if (method === 'GET' && pathname === '/api/orders') {
    const sessionId = getAdminSessionId(req, res);
    if (!requireAdmin(sessionId)) {
      return json(res, 401, { error: 'Unauthorized. Admin login required.' });
    }
    const orders = readJSON(ORDERS_F);
    // Filter by status
    const status = query.status;
    const result = status ? orders.filter(o => o.status === status) : orders;
    return json(res, 200, result.slice().reverse());
  }

  // PATCH /api/orders/:id  (admin: update status)
  if (method === 'PATCH' && /^\/api\/orders\/[^/]+$/.test(pathname)) {
    const sessionId = getAdminSessionId(req, res);
    if (!requireAdmin(sessionId)) {
      return json(res, 401, { error: 'Unauthorized. Admin login required.' });
    }
    try {
      const id     = decodeURIComponent(pathname.split('/').pop());
      const body   = await bodyJSON(req);
      const orders = readJSON(ORDERS_F);
      const idx    = orders.findIndex(o => o.id === id);
      if (idx === -1) return json(res, 404, { error: 'Order not found' });
      orders[idx].status = body.status || orders[idx].status;
      writeJSON(ORDERS_F, orders);
      return json(res, 200, orders[idx]);
    } catch (e) { return json(res, 400, { error: 'Bad JSON' }); }
  }

  // GET /api/stats  (admin dashboard numbers)
  if (method === 'GET' && pathname === '/api/stats') {
    const sessionId = getAdminSessionId(req, res);
    if (!requireAdmin(sessionId)) {
      return json(res, 401, { error: 'Unauthorized. Admin login required.' });
    }
    const orders   = readJSON(ORDERS_F);
    const products = readJSON(PRODUCTS_F);
    const revenue  = orders.reduce((s, o) => s + o.total, 0);
    const pending  = orders.filter(o => o.status === 'Pending').length;
    const shipped  = orders.filter(o => o.status === 'Shipped').length;
    const delivered= orders.filter(o => o.status === 'Delivered').length;
    return json(res, 200, {
      totalOrders  : orders.length,
      totalRevenue : revenue,
      totalProducts: products.length,
      pending, shipped, delivered
    });
  }

  //  PAGES

  if (pathname === '/' || pathname === '/index.html') {
    return staticFile(res, path.join(PUBLIC_DIR, 'index.html'));
  }
  if (pathname === '/admin' || pathname === '/admin.html') {
    return staticFile(res, path.join(PUBLIC_DIR, 'admin.html'));
  }

  // Other static files
  const filePath = path.join(PUBLIC_DIR, pathname);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return staticFile(res, filePath);
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

connectMongo().finally(() => {
  server.listen(PORT, () => {
    console.log(`\n Jossy Sagide server running!`);
    console.log(`   Shop  → http://localhost:${PORT}`);
    console.log(`   Admin → http://localhost:${PORT}/admin\n`);
  });
});

