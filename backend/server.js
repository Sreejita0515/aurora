// Aurora Shopping Platform — Backend with Firebase Authentication
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { initializeDatabase, getDb, dbRun, saveDb } = require('./database');
const AIDecisionAgent = require('./ai-agent');
const path = require('path');

// ──── Firebase Admin SDK ────
const admin = require('firebase-admin');

// Initialize Firebase Admin — uses projectId from your config
// No service account JSON needed for ID-token verification
admin.initializeApp({
  projectId: 'aurora-ee3eb',
});

// Secret code required to register as an admin (keep this private!)
const ADMIN_SECRET_CODE = 'AURORA-ADMIN-2026';

// Middleware: extract & verify Firebase ID token from Authorization header
const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer (.+)$/);
  if (match) {
    try {
      const decoded = await admin.auth().verifyIdToken(match[1]);
      req.firebaseUser = decoded; // { uid, email, name, ... }
    } catch (err) {
      // Token invalid or expired — continue without auth
      console.warn('Firebase token verification failed:', err.code || err.message);
    }
  }
  next();
};

// Middleware: require a valid Firebase token (use on protected routes)
const requireAuth = (req, res, next) => {
  if (!req.firebaseUser) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }
  next();
};

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(verifyFirebaseToken);
app.use(express.static(path.join(__dirname, '..', 'frontend')));

(async () => {
  await initializeDatabase();
  const db = await getDb();

  // ═══════════════════════════════════════════════════
  // HELPER: Find or create a local user from Firebase token
  // ═══════════════════════════════════════════════════
  // grantAdmin = true when user provided the correct ADMIN_SECRET_CODE during registration
  function findOrCreateFirebaseUser(firebaseUser, grantAdmin = false) {
    const { uid, email = '' } = firebaseUser;
    const name = firebaseUser.name || firebaseUser.display_name || (email ? email.split('@')[0] : 'User');
    const safeEmail = email || `${uid}@aurora.user`;
    const isAdminEmail = safeEmail.toLowerCase() === 'admin@aurora.com';
    const shouldBeAdmin = grantAdmin || isAdminEmail;

    // Check if we already have this Firebase user linked
    let user = db.prepare('SELECT * FROM users WHERE firebase_uid = ?').get(uid);
    if (user) {
      if (shouldBeAdmin && user.role !== 'admin') {
        db.prepare('UPDATE users SET role = ? WHERE id = ?').run('admin', user.id);
        saveDb();
        user.role = 'admin';
      }
      const { password_hash, ...safe } = user;
      return safe;
    }

    // Check if user exists by email (legacy account → link Firebase UID)
    user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(safeEmail.toLowerCase());
    if (user) {
      const role = shouldBeAdmin ? 'admin' : user.role;
      db.prepare('UPDATE users SET firebase_uid = ?, role = ? WHERE id = ?').run(uid, role, user.id);
      saveDb();
      const { password_hash, ...safe } = user;
      return { ...safe, firebase_uid: uid, role };
    }

    // Create brand new user
    const id = uuidv4();
    const role = shouldBeAdmin ? 'admin' : 'customer';
    db.prepare(
      'INSERT INTO users (id, name, email, password_hash, role, firebase_uid) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, name, safeEmail, '', role, uid);
    saveDb();

    return { id, name, email: safeEmail, role, firebase_uid: uid };
  }

  // Middleware: require admin role (uses Firebase token)
  const requireAdmin = (req, res, next) => {
    if (!req.firebaseUser) {
      return res.status(401).json({ error: 'Authentication required. Please sign in with an admin account.' });
    }
    try {
      const user = findOrCreateFirebaseUser(req.firebaseUser);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
      }
      req.adminUser = user;
      next();
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  };

  // ═══════════════════════════════════════════════════
  // AUTH ROUTES
  // ═══════════════════════════════════════════════════

  // POST /api/auth/firebase — Frontend sends Firebase ID token + optional adminCode
  app.post('/api/auth/firebase', requireAuth, (req, res) => {
    try {
      const adminCode = (req.body && req.body.adminCode) || '';
      const grantAdmin = adminCode === ADMIN_SECRET_CODE;
      if (adminCode && !grantAdmin) {
        return res.status(403).json({ error: 'Invalid admin access code. Please check and try again.' });
      }
      const user = findOrCreateFirebaseUser(req.firebaseUser, grantAdmin);
      res.json({ user });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/auth/me — Get profile of currently authenticated Firebase user
  app.get('/api/auth/me', requireAuth, (req, res) => {
    try {
      const user = findOrCreateFirebaseUser(req.firebaseUser);
      res.json({ user });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/admin/verify — Verify admin access for frontend admin console
  app.get('/api/admin/verify', requireAdmin, (req, res) => {
    res.json({ verified: true, user: req.adminUser });
  });

  // Legacy login (kept as fallback for demo accounts when Firebase is unavailable)
  app.post('/api/auth/login', (req, res) => {
    try {
      const bcrypt = require('bcryptjs');
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      const { password_hash, ...safe } = user;
      res.json({ user: safe });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Legacy register (kept as fallback)
  app.post('/api/auth/register', (req, res) => {
    try {
      const bcrypt = require('bcryptjs');
      const { name, email, password } = req.body;
      if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required' });
      const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (exists) return res.status(409).json({ error: 'Email already registered' });
      const id = uuidv4();
      const hash = bcrypt.hashSync(password, 10);
      db.prepare('INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)')
        .run(id, name, email, hash, 'customer');
      saveDb();
      const user = db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(id);
      res.status(201).json({ user });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ═══════════════════════════════════════════════════
  // PRODUCTS
  // ═══════════════════════════════════════════════════
  app.get('/api/products', (req, res) => {
    try {
      const { category, search, sort, featured } = req.query;
      let sql = `
        SELECT p.*, c.name AS category_name, c.icon AS category_icon
        FROM products p
        JOIN categories c ON p.category_id = c.id
        WHERE 1=1`;
      const params = [];
      if (category && category !== 'all') { sql += ' AND p.category_id = ?'; params.push(category); }
      if (search) { sql += ' AND (p.name LIKE ? OR p.description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
      if (featured === 'true') sql += ' AND p.is_featured = 1';
      switch (sort) {
        case 'price-low': sql += ' ORDER BY p.price ASC'; break;
        case 'price-high': sql += ' ORDER BY p.price DESC'; break;
        case 'rating': sql += ' ORDER BY p.rating DESC'; break;
        case 'newest': sql += ' ORDER BY p.created_at DESC'; break;
        default: sql += ' ORDER BY p.is_featured DESC, p.rating DESC';
      }
      const products = db.prepare(sql).all(...params);
      res.json({ products });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/products/:id', (req, res) => {
    try {
      const product = db.prepare(`
        SELECT p.*, c.name AS category_name, c.icon AS category_icon
        FROM products p
        JOIN categories c ON p.category_id = c.id
        WHERE p.id = ?
      `).get(req.params.id);
      if (!product) return res.status(404).json({ error: 'Product not found' });
      const reviews = db.prepare(`
        SELECT r.*, u.name AS user_name
        FROM reviews r
        JOIN users u ON r.user_id = u.id
        WHERE r.product_id = ?
        ORDER BY r.created_at DESC
        LIMIT 10
      `).all(req.params.id);
      res.json({ product, reviews });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/categories', (req, res) => {
    try {
      const categories = db.prepare(`
        SELECT c.*, COUNT(p.id) AS product_count
        FROM categories c
        LEFT JOIN products p ON c.id = p.category_id
        GROUP BY c.id
        ORDER BY c.name
      `).all();
      res.json({ categories });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ═══════════════════════════════════════════════════
  // CART
  // ═══════════════════════════════════════════════════
  app.get('/api/cart/:userId', (req, res) => {
    try {
      const items = db.prepare(`
        SELECT ci.*, p.name, p.price, p.image_url, p.stock
        FROM cart_items ci
        JOIN products p ON ci.product_id = p.id
        WHERE ci.user_id = ?
        ORDER BY ci.added_at DESC
      `).all(req.params.userId);
      const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
      res.json({ items, total: Math.round(total * 100) / 100, count: items.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/cart', (req, res) => {
    try {
      const { userId, productId, quantity = 1 } = req.body;
      if (!userId || !productId) return res.status(400).json({ error: 'userId and productId required' });
      const existing = db.prepare('SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?').get(userId, productId);
      if (existing) {
        db.prepare('UPDATE cart_items SET quantity = quantity + ? WHERE id = ?').run(quantity, existing.id);
      } else {
        db.prepare('INSERT INTO cart_items (id, user_id, product_id, quantity) VALUES (?, ?, ?, ?)')
          .run(uuidv4(), userId, productId, quantity);
      }
      saveDb();
      const items = db.prepare(`
        SELECT ci.*, p.name, p.price, p.image_url, p.stock FROM cart_items ci
        JOIN products p ON ci.product_id = p.id WHERE ci.user_id = ?
      `).all(userId);
      const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
      res.json({ items, total: Math.round(total * 100) / 100, count: items.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/cart/:itemId', (req, res) => {
    try {
      const { quantity } = req.body;
      if (quantity <= 0) {
        db.prepare('DELETE FROM cart_items WHERE id = ?').run(req.params.itemId);
      } else {
        db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(quantity, req.params.itemId);
      }
      saveDb();
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/cart/:itemId', (req, res) => {
    try {
      db.prepare('DELETE FROM cart_items WHERE id = ?').run(req.params.itemId);
      saveDb();
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ═══════════════════════════════════════════════════
  // ORDERS
  // ═══════════════════════════════════════════════════
  app.post('/api/orders', (req, res) => {
    try {
      const { userId, shippingAddress, paymentMethod = 'card' } = req.body;
      if (!userId) return res.status(400).json({ error: 'userId required' });
      const cartItems = db.prepare(`
        SELECT ci.*, p.price, p.stock, p.name, p.id AS product_id FROM cart_items ci
        JOIN products p ON ci.product_id = p.id WHERE ci.user_id = ?
      `).all(userId);
      if (!cartItems.length) return res.status(400).json({ error: 'Cart is empty' });
      for (const it of cartItems) {
        if (it.stock < it.quantity) return res.status(400).json({ error: `Insufficient stock for "${it.name}"` });
      }
      const orderId = uuidv4();
      const total = cartItems.reduce((s, i) => s + i.price * i.quantity, 0);
      db.prepare(`
        INSERT INTO orders (id, user_id, total, status, shipping_address, payment_method)
        VALUES (?, ?, ?, 'pending', ?, ?)
      `).run(orderId, userId, Math.round(total * 100) / 100, shippingAddress || 'Not provided', paymentMethod);
      const insItem = db.prepare('INSERT INTO order_items (id, order_id, product_id, quantity, price) VALUES (?, ?, ?, ?, ?)');
      const updStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
      for (const it of cartItems) {
        insItem.run(uuidv4(), orderId, it.product_id, it.quantity, it.price);
        updStock.run(it.quantity, it.product_id);
      }
      db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(userId);
      saveDb();
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      res.status(201).json({ order });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/orders/:userId', (req, res) => {
    try {
      const orders = db.prepare(`
        SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC
      `).all(req.params.userId);
      const getItems = db.prepare(`
        SELECT oi.*, p.name AS product_name, p.image_url FROM order_items oi
        JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?
      `);
      const withItems = orders.map(o => ({ ...o, items: getItems.all(o.id) }));
      res.json({ orders: withItems });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/orders/detail/:orderId', (req, res) => {
    try {
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.orderId);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      const items = db.prepare(`
        SELECT oi.*, p.name AS product_name, p.image_url, p.description
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = ?
      `).all(req.params.orderId);
      res.json({ order: { ...order, items } });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ═══════════════════════════════════════════════════
  // ADMIN (Protected by Firebase Auth requireAdmin)
  // ═══════════════════════════════════════════════════
  app.get('/api/admin/analytics', requireAdmin, (req, res) => {
    try {
      const analysis = new AIDecisionAgent(db).analyze();
      res.json(analysis);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/admin/products', requireAdmin, (req, res) => {
    try {
      const products = db.prepare(`
        SELECT p.*, c.name AS category_name,
          COALESCE((SELECT SUM(oi.quantity) FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            WHERE oi.product_id = p.id AND o.status != 'cancelled'), 0) AS total_sold
        FROM products p
        JOIN categories c ON p.category_id = c.id
        ORDER BY p.name
      `).all();
      res.json({ products });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
    try {
      const { name, price, stock, description } = req.body;
      const updates = [];
      const params = [];
      if (name !== undefined) { updates.push('name = ?'); params.push(name); }
      if (price !== undefined) { updates.push('price = ?'); params.push(price); }
      if (stock !== undefined) { updates.push('stock = ?'); params.push(stock); }
      if (description !== undefined) { updates.push('description = ?'); params.push(description); }
      if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
      params.push(req.params.id);
      db.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      saveDb();
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
      res.json({ product });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/admin/orders/:id/status', requireAdmin, (req, res) => {
    try {
      const { status } = req.body;
      const allowed = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
      if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
      db.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);
      saveDb();
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
      res.json({ order });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/admin/orders', requireAdmin, (req, res) => {
    try {
      const orders = db.prepare(`
        SELECT o.*, u.name AS customer_name, u.email AS customer_email
        FROM orders o
        JOIN users u ON o.user_id = u.id
        ORDER BY o.created_at DESC
        LIMIT 50
      `).all();
      res.json({ orders });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // SPA fallback
  app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html')));
  app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'admin.html')));

  app.listen(PORT, () => {
    console.log('\n   ╔══════════════════════════════════════════════════╗');
    console.log('   ║           🌌 Aurora Shopping Platform            ║');
    console.log('   ║──────────────────────────────────────────────────║');
    console.log(`   ║  Server running on http://localhost:${PORT}         ║`);
    console.log(`   ║  Shop:  http://localhost:${PORT}/                   ║`);
    console.log(`   ║  Admin: http://localhost:${PORT}/admin               ║`);
    console.log('   ║──────────────────────────────────────────────────║');
    console.log('   ║  🔥 Firebase Authentication: ENABLED            ║');
    console.log('   ║  Project: aurora-ee3eb                           ║');
    console.log('   ╚══════════════════════════════════════════════════╝');
  });
})();
