
const crypto = require('crypto');
const { MongoClient, ServerApiVersion } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || '';

// Admin authentication - require ADMIN_PASSWORD to be set
const {ADMIN_PASSWORD} = process.env;
if (!ADMIN_PASSWORD) {
  console.error('ERROR: ADMIN_PASSWORD environment variable must be set. Exiting.');
  process.exit(1);
}

let sessionsCollection; // MongoDB sessions collection

async function generateSession() {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const csrfToken = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  const expiresAt = now + 24 * 60 * 60 * 1000; // 24h

  if (sessionsCollection) {
    await sessionsCollection.insertOne({ sessionId, csrfToken, createdAt: now, expiresAt });
  }
  return { sessionId, csrfToken };
}

async function isValidSession(sessionId) {
  if (!sessionId) return false;

  if (sessionsCollection) {
    const session = await sessionsCollection.findOne({ sessionId });
    if (!session) return false;
    if (Date.now() > session.expiresAt) {
      await sessionsCollection.deleteOne({ sessionId });
      return false;
    }
    return true;
  }
  return false;
}

async function validateCsrf(req, sessionId) {
  if (!sessionId || !sessionsCollection) return false;
  const token = req.headers['x-csrf-token'];
  if (!token) return false;
  const session = await sessionsCollection.findOne({ sessionId });
  if (!session || Date.now() > session.expiresAt) return false;
  return token === session.csrfToken;
}

async function deleteSession(sessionId) {
  if (sessionsCollection && sessionId) {
    await sessionsCollection.deleteOne({ sessionId });
  }
}

let mongoClient;
let mongoDb;

async function connectMongo() {
  if (!MONGODB_URI) {
    console.error('ERROR: MONGODB_URI environment variable must be set. Exiting.');
    process.exit(1);
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
    sessionsCollection = mongoDb.collection('admin_sessions');
    // Create TTL index for automatic session cleanup
    await sessionsCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection failed:', err);
    process.exit(1);
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

const MAX_BODY_SIZE = 1e6; // 1 MB
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOGIN_RATE_LIMIT_MAX = 5;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : ['http://localhost:3000'];
const loginAttempts = new Map();

function getRequestIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

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

function resolvePublicPath(requestPath) {
  if (!requestPath || typeof requestPath !== 'string') return null;
  if (path.isAbsolute(requestPath)) return null;
  if (requestPath.includes('\0') || requestPath.includes('\\')) return null;

  let decoded;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch (e) {
    return null;
  }

  if (decoded.includes('..') || decoded.includes('\0') || decoded.includes('\\')) return null;
  if (!/^[A-Za-z0-9._\/-]+$/.test(decoded)) return null;

  const trimmed = decoded.replace(/^\/+/, '');
  if (!trimmed || trimmed === '.' || trimmed === '..') return null;

  const resolved = path.resolve(PUBLIC_DIR, trimmed);
  if (resolved !== PUBLIC_DIR && !resolved.startsWith(PUBLIC_DIR + path.sep)) return null;
  return resolved;
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function bodyJSON(req, maxSize = MAX_BODY_SIZE) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > maxSize) {
        req.destroy();
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(e); }
    });
  });
}

// ── router ───────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const { pathname, query } = url.parse(req.url, true);
  const API = '';
const {method} = req;

  // CORS (restrict to allowed frontends)
  const {origin} = req.headers;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  // ── API ──────────────────────────────────────────────────────────────────

  // Helper: Check admin session from cookie
  const getAdminSessionId = (req) => {
    const cookie = req.headers.cookie || '';
    const match = cookie.match(/adminSession=([^;]+)/);
    return match ? match[1] : null;
  };

  const requireAdmin = isValidSession;

  // GET /api/me  (check current admin auth status)
  if (method === 'GET' && pathname === '/api/me') {
    const sessionId = getAdminSessionId(req);
    const valid = await requireAdmin(sessionId);
    return json(res, 200, { authenticated: valid });
  }

  // POST /api/login  (admin login)
  if (method === 'POST' && pathname === '/api/login') {
    const ip = getRequestIp(req);
    const now = Date.now();
    const attempt = loginAttempts.get(ip) || { count: 0, firstAt: now };
    if (now - attempt.firstAt > LOGIN_RATE_LIMIT_WINDOW_MS) {
      attempt.count = 0;
      attempt.firstAt = now;
    }
    if (attempt.count >= LOGIN_RATE_LIMIT_MAX) {
      return json(res, 429, { error: 'Too many login attempts. Try again later.' });
    }

    try {
      const body = await bodyJSON(req);
      if (body.password === ADMIN_PASSWORD) {
        loginAttempts.delete(ip);
        const { sessionId, csrfToken } = await generateSession();
        const isSecure = req.headers['x-forwarded-proto'] === 'https' || (req.socket && req.socket.encrypted);
        const cookieValue = `adminSession=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${24 * 60 * 60}`;
        res.setHeader('Set-Cookie', isSecure ? `${cookieValue}; Secure` : cookieValue);
        return json(res, 200, { success: true, csrfToken });
      } else {
        attempt.count += 1;
        loginAttempts.set(ip, attempt);
        return json(res, 401, { error: 'Invalid password' });
      }
    } catch (e) {
      return json(res, 400, { error: e.message === 'Body too large' ? 'Request body too large' : 'Bad JSON' });
    }
  }

  // POST /api/logout  (admin logout)
  if (method === 'POST' && pathname === '/api/logout') {
    const sessionId = getAdminSessionId(req);
    if (!await requireAdmin(sessionId)) {
      return json(res, 401, { error: 'Unauthorized. Admin login required.' });
    }
    if (!await validateCsrf(req, sessionId)) {
      return json(res, 403, { error: 'Invalid CSRF token' });
    }
    await deleteSession(sessionId);
    res.setHeader('Set-Cookie', 'adminSession=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
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
    const sessionId = getAdminSessionId(req);
    if (!await requireAdmin(sessionId)) {
      return json(res, 401, { error: 'Unauthorized. Admin login required.' });
    }
    if (!await validateCsrf(req, sessionId)) {
      return json(res, 403, { error: 'Invalid CSRF token' });
    }
    try {
      const body = await bodyJSON(req);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const category = typeof body.category === 'string' ? body.category.trim() : 'Men';
      const badge = body.badge == null ? null : String(body.badge).trim();
      const img = typeof body.img === 'string' ? body.img.trim() : '';
      const price = Number(body.price);
      const stock = Number(body.stock);
      const sizes = Array.isArray(body.sizes) ? body.sizes.filter(s => typeof s === 'string').slice(0, 8) : ['S','M','L','XL'];
      if (!name || name.length > 100 || category.length > 50 || badge?.length > 50 || img.length > 255) {
        return json(res, 400, { error: 'Invalid product data' });
      }
      if (!Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) {
        return json(res, 400, { error: 'Invalid price or stock' });
      }
      const all = readJSON(PRODUCTS_F);
      const newP = {
        id      : Date.now(),
        name,
        price,
        category,
        badge,
        sizes: sizes.length ? sizes : ['S','M','L','XL'],
        img,
        stock
      };
      all.push(newP);
      writeJSON(PRODUCTS_F, all);
      return json(res, 201, newP);
    } catch (e) {
      return json(res, 400, { error: e.message === 'Body too large' ? 'Request body too large' : 'Bad JSON' });
    }
  }

  // PUT /api/products/:id  (admin: update product)
  if (method === 'PUT' && /^\/api\/products\/\d+$/.test(pathname)) {
    const sessionId = getAdminSessionId(req);
    if (!await requireAdmin(sessionId)) {
      return json(res, 401, { error: 'Unauthorized. Admin login required.' });
    }
    if (!await validateCsrf(req, sessionId)) {
      return json(res, 403, { error: 'Invalid CSRF token' });
    }
    try {
      const id   = parseInt(pathname.split('/').pop(), 10);
      const body = await bodyJSON(req);
      const all  = readJSON(PRODUCTS_F);
      const idx  = all.findIndex(x => x.id === id);
      if (idx === -1) return json(res, 404, { error: 'Not found' });
      const name = typeof body.name === 'string' ? body.name.trim() : all[idx].name;
      const category = typeof body.category === 'string' ? body.category.trim() : all[idx].category;
      const badge = body.badge == null ? all[idx].badge : String(body.badge).trim();
      const img = typeof body.img === 'string' ? body.img.trim() : all[idx].img;
      const price = body.price == null ? all[idx].price : Number(body.price);
      const stock = body.stock == null ? all[idx].stock : Number(body.stock);
      const sizes = Array.isArray(body.sizes) ? body.sizes.filter(s => typeof s === 'string').slice(0, 8) : all[idx].sizes;
      if (!name || name.length > 100 || category.length > 50 || badge?.length > 50 || img.length > 255) {
        return json(res, 400, { error: 'Invalid product data' });
      }
      if (!Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) {
        return json(res, 400, { error: 'Invalid price or stock' });
      }
      all[idx] = {
        ...all[idx],
        id,
        name,
        category,
        badge,
        img,
        price,
        stock,
        sizes: sizes.length ? sizes : all[idx].sizes
      };
      writeJSON(PRODUCTS_F, all);
      return json(res, 200, all[idx]);
    } catch (e) {
      return json(res, 400, { error: e.message === 'Body too large' ? 'Request body too large' : 'Bad JSON' });
    }
  }

  // DELETE /api/products/:id  (admin)
  if (method === 'DELETE' && /^\/api\/products\/\d+$/.test(pathname)) {
    const sessionId = getAdminSessionId(req);
    if (!await requireAdmin(sessionId)) {
      return json(res, 401, { error: 'Unauthorized. Admin login required.' });
    }
    if (!await validateCsrf(req, sessionId)) {
      return json(res, 403, { error: 'Invalid CSRF token' });
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
    const sessionId = getAdminSessionId(req);
    if (!await requireAdmin(sessionId)) {
      return json(res, 401, { error: 'Unauthorized. Admin login required.' });
    }
    const orders = readJSON(ORDERS_F);
    // Filter by status
    const { status } = query;
    const result = status ? orders.filter(o => o.status === status) : orders;
    return json(res, 200, result.slice().reverse());
  }

  // PATCH /api/orders/:id  (admin: update status)
  if (method === 'PATCH' && /^\/api\/orders\/[^/]+$/.test(pathname)) {
    const sessionId = getAdminSessionId(req);
    if (!await requireAdmin(sessionId)) {
      return json(res, 401, { error: 'Unauthorized. Admin login required.' });
    }
    if (!await validateCsrf(req, sessionId)) {
      return json(res, 403, { error: 'Invalid CSRF token' });
    }
    try {
      const id     = decodeURIComponent(pathname.split('/').pop());
      const body   = await bodyJSON(req);
      const orders = readJSON(ORDERS_F);
      const idx    = orders.findIndex(o => o.id === id);
      if (idx === -1) return json(res, 404, { error: 'Order not found' });
      const status = typeof body.status === 'string' ? body.status.trim() : orders[idx].status;
      orders[idx].status = status;
      writeJSON(ORDERS_F, orders);
      return json(res, 200, orders[idx]);
    } catch (e) {
      return json(res, 400, { error: e.message === 'Body too large' ? 'Request body too large' : 'Bad JSON' });
    }
  }

  // GET /api/stats  (admin dashboard numbers)
  if (method === 'GET' && pathname === '/api/stats') {
    const sessionId = getAdminSessionId(req);
    if (!await requireAdmin(sessionId)) {
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
  const filePath = resolvePublicPath(pathname);
  if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
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