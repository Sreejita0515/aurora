const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'aurora.db');

let db = null;
let rawPrepare = null;

function dbGet(sql, params = []) {
  if (!db || !rawPrepare) return null;
  const stmt = rawPrepare(sql);
  const p = Array.isArray(params) ? params : (params !== undefined ? [params] : []);
  if (p.length > 0) stmt.bind(p);
  let result = null;
  if (stmt.step()) {
    const cols = stmt.getColumnNames();
    const values = stmt.get();
    result = {};
    cols.forEach((col, i) => { result[col] = values[i]; });
  }
  stmt.free();
  return result;
}

function dbAll(sql, params = []) {
  if (!db || !rawPrepare) return [];
  const stmt = rawPrepare(sql);
  const p = Array.isArray(params) ? params : (params !== undefined ? [params] : []);
  if (p.length > 0) stmt.bind(p);
  const results = [];
  const cols = stmt.getColumnNames();
  while (stmt.step()) {
    const row = {};
    const values = stmt.get();
    cols.forEach((col, i) => { row[col] = values[i]; });
    results.push(row);
  }
  stmt.free();
  return results;
}

function dbRun(sql, params = []) {
  if (!db) return;
  const p = Array.isArray(params) ? params : (params !== undefined ? [params] : []);
  db.run(sql, p);
}

function wrapDbInstance(instance) {
  rawPrepare = instance.prepare.bind(instance);
  instance.prepare = function(sql) {
    return {
      get(...args) {
        const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
        return dbGet(sql, params);
      },
      all(...args) {
        const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
        return dbAll(sql, params);
      },
      run(...args) {
        const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
        dbRun(sql, params);
        return { changes: 1 };
      }
    };
  };
}

async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  // Load existing DB or create new
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  wrapDbInstance(db);
  return db;
}

function getDbSync() {
  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

async function initializeDatabase() {
  await getDb();

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'customer',
      firebase_uid TEXT,
      created_at DATETIME DEFAULT (datetime('now'))
    )
  `);

  // Ensure firebase_uid column exists on existing databases
  try {
    db.run("ALTER TABLE users ADD COLUMN firebase_uid TEXT");
  } catch (e) {
    // Column already exists, continue
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT,
      description TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      original_price REAL,
      image_url TEXT,
      category_id TEXT,
      stock INTEGER DEFAULT 0,
      rating REAL DEFAULT 0,
      reviews_count INTEGER DEFAULT 0,
      is_featured INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS cart_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      added_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      total REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      shipping_address TEXT,
      payment_method TEXT DEFAULT 'card',
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // Seed data if empty
  const userCount = dbGet('SELECT COUNT(*) as count FROM users');
  if (!userCount || userCount.count === 0) {
    seedDatabase();
  }

  saveDb();
  return db;
}

function seedDatabase() {
  const now = new Date();

  // --- Users ---
  const adminHash = bcrypt.hashSync('admin123', 10);
  const userHash = bcrypt.hashSync('user123', 10);

  const users = [
    { id: uuidv4(), name: 'Admin', email: 'admin@aurora.com', password_hash: adminHash, role: 'admin' },
    { id: uuidv4(), name: 'Sarah Johnson', email: 'sarah@example.com', password_hash: userHash, role: 'customer' },
    { id: uuidv4(), name: 'Mike Chen', email: 'mike@example.com', password_hash: userHash, role: 'customer' },
    { id: uuidv4(), name: 'Emily Davis', email: 'emily@example.com', password_hash: userHash, role: 'customer' },
    { id: uuidv4(), name: 'James Wilson', email: 'james@example.com', password_hash: userHash, role: 'customer' },
    { id: uuidv4(), name: 'Priya Patel', email: 'priya@example.com', password_hash: userHash, role: 'customer' },
    { id: uuidv4(), name: 'Alex Turner', email: 'alex@example.com', password_hash: userHash, role: 'customer' },
    { id: uuidv4(), name: 'Lisa Wang', email: 'lisa@example.com', password_hash: userHash, role: 'customer' },
  ];

  for (const u of users) {
    dbRun('INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)', [u.id, u.name, u.email, u.password_hash, u.role]);
  }

  // --- Categories ---
  const categories = [
    { id: 'cat-electronics', name: 'Electronics', icon: '💻', description: 'Latest gadgets and tech' },
    { id: 'cat-fashion', name: 'Fashion', icon: '👗', description: 'Trending styles and apparel' },
    { id: 'cat-home', name: 'Home & Living', icon: '🏠', description: 'Furniture and home decor' },
    { id: 'cat-sports', name: 'Sports & Outdoors', icon: '⚽', description: 'Gear for active lifestyles' },
    { id: 'cat-beauty', name: 'Beauty & Care', icon: '✨', description: 'Skincare and beauty products' },
    { id: 'cat-books', name: 'Books & Media', icon: '📚', description: 'Books, music, and more' },
  ];

  for (const c of categories) {
    dbRun('INSERT INTO categories (id, name, icon, description) VALUES (?, ?, ?, ?)', [c.id, c.name, c.icon, c.description]);
  }

  // --- Products ---
  const products = [
    { id: uuidv4(), name: 'ProBook Ultra Laptop', description: 'Ultra-thin 14" laptop with M3 chip, 16GB RAM, 512GB SSD. Perfect for professionals and creatives.', price: 1299.99, original_price: 1499.99, image_url: 'https://picsum.photos/seed/laptop1/400/400', category_id: 'cat-electronics', stock: 45, rating: 4.8, reviews_count: 234, is_featured: 1 },
    { id: uuidv4(), name: 'Galaxy Pro Smartphone', description: '6.7" AMOLED display, 108MP camera, 5G connectivity, 256GB storage.', price: 899.99, original_price: 999.99, image_url: 'https://picsum.photos/seed/phone1/400/400', category_id: 'cat-electronics', stock: 120, rating: 4.6, reviews_count: 567, is_featured: 1 },
    { id: uuidv4(), name: 'SonicWave Pro Headphones', description: 'Active noise cancellation, 40-hour battery, premium drivers for audiophile-quality sound.', price: 349.99, original_price: 399.99, image_url: 'https://picsum.photos/seed/headphone1/400/400', category_id: 'cat-electronics', stock: 89, rating: 4.7, reviews_count: 892, is_featured: 1 },
    { id: uuidv4(), name: 'SmartWatch Elite', description: 'Health tracking, GPS, always-on display, 7-day battery life, water resistant to 50m.', price: 299.99, original_price: null, image_url: 'https://picsum.photos/seed/watch1/400/400', category_id: 'cat-electronics', stock: 67, rating: 4.5, reviews_count: 345 },
    { id: uuidv4(), name: '4K Ultra Monitor 27"', description: 'IPS panel, 144Hz refresh rate, HDR600, USB-C connectivity for creative professionals.', price: 549.99, original_price: 649.99, image_url: 'https://picsum.photos/seed/monitor1/400/400', category_id: 'cat-electronics', stock: 34, rating: 4.4, reviews_count: 156 },
    { id: uuidv4(), name: 'Wireless Earbuds Pro', description: 'Spatial audio, adaptive EQ, 30-hour total battery, MagSafe charging case.', price: 179.99, original_price: 199.99, image_url: 'https://picsum.photos/seed/earbuds1/400/400', category_id: 'cat-electronics', stock: 200, rating: 4.3, reviews_count: 1023 },
    { id: uuidv4(), name: 'Tablet Air 11"', description: 'Liquid Retina display, powerful chip, all-day battery, perfect for entertainment.', price: 599.99, original_price: null, image_url: 'https://picsum.photos/seed/tablet1/400/400', category_id: 'cat-electronics', stock: 55, rating: 4.6, reviews_count: 278 },
    { id: uuidv4(), name: 'Portable Bluetooth Speaker', description: 'Waterproof, 20-hour battery, 360° sound, built-in microphone for calls.', price: 89.99, original_price: 119.99, image_url: 'https://picsum.photos/seed/speaker1/400/400', category_id: 'cat-electronics', stock: 150, rating: 4.2, reviews_count: 445 },
    { id: uuidv4(), name: 'Classic Leather Jacket', description: 'Genuine leather, slim fit, satin lining, timeless style for every season.', price: 289.99, original_price: 349.99, image_url: 'https://picsum.photos/seed/jacket1/400/400', category_id: 'cat-fashion', stock: 30, rating: 4.7, reviews_count: 189, is_featured: 1 },
    { id: uuidv4(), name: 'Designer Sunglasses', description: 'UV400 protection, polarized lenses, lightweight titanium frame.', price: 159.99, original_price: null, image_url: 'https://picsum.photos/seed/sunglasses1/400/400', category_id: 'cat-fashion', stock: 75, rating: 4.4, reviews_count: 312 },
    { id: uuidv4(), name: 'Premium Running Shoes', description: 'React foam technology, breathable mesh, responsive cushioning for miles of comfort.', price: 129.99, original_price: 159.99, image_url: 'https://picsum.photos/seed/shoes1/400/400', category_id: 'cat-fashion', stock: 95, rating: 4.6, reviews_count: 678 },
    { id: uuidv4(), name: 'Cashmere Sweater', description: '100% pure cashmere, crew neck, luxuriously soft and warm.', price: 199.99, original_price: 249.99, image_url: 'https://picsum.photos/seed/sweater1/400/400', category_id: 'cat-fashion', stock: 40, rating: 4.8, reviews_count: 145 },
    { id: uuidv4(), name: 'Chronograph Watch', description: 'Swiss movement, sapphire crystal, stainless steel, water-resistant 100m.', price: 459.99, original_price: 599.99, image_url: 'https://picsum.photos/seed/chronowatch/400/400', category_id: 'cat-fashion', stock: 20, rating: 4.9, reviews_count: 89 },
    { id: uuidv4(), name: 'Canvas Tote Bag', description: 'Organic cotton canvas, leather straps, spacious interior with laptop sleeve.', price: 69.99, original_price: null, image_url: 'https://picsum.photos/seed/bag1/400/400', category_id: 'cat-fashion', stock: 110, rating: 4.3, reviews_count: 234 },
    { id: uuidv4(), name: 'Ergonomic Office Chair', description: 'Lumbar support, adjustable armrests, breathable mesh, 360° swivel.', price: 449.99, original_price: 549.99, image_url: 'https://picsum.photos/seed/chair1/400/400', category_id: 'cat-home', stock: 25, rating: 4.5, reviews_count: 567, is_featured: 1 },
    { id: uuidv4(), name: 'Minimalist Desk Lamp', description: 'LED, adjustable brightness and color temperature, wireless charging base.', price: 79.99, original_price: null, image_url: 'https://picsum.photos/seed/lamp1/400/400', category_id: 'cat-home', stock: 85, rating: 4.4, reviews_count: 234 },
    { id: uuidv4(), name: 'Smart Air Purifier', description: 'HEPA H13 filter, real-time air quality monitor, covers 500 sq ft, whisper quiet.', price: 249.99, original_price: 299.99, image_url: 'https://picsum.photos/seed/purifier1/400/400', category_id: 'cat-home', stock: 42, rating: 4.6, reviews_count: 189 },
    { id: uuidv4(), name: 'Luxury Bedding Set', description: '1000-thread count Egyptian cotton, includes duvet cover, sheet set, and pillowcases.', price: 189.99, original_price: 239.99, image_url: 'https://picsum.photos/seed/bedding1/400/400', category_id: 'cat-home', stock: 60, rating: 4.7, reviews_count: 345 },
    { id: uuidv4(), name: 'Espresso Machine Pro', description: 'Built-in grinder, steam wand, 15-bar pressure, touchscreen display.', price: 699.99, original_price: 849.99, image_url: 'https://picsum.photos/seed/coffee1/400/400', category_id: 'cat-home', stock: 18, rating: 4.8, reviews_count: 123 },
    { id: uuidv4(), name: 'Indoor Plant Set (3-pack)', description: 'Low-maintenance succulents in ceramic pots, perfect for desk or shelf.', price: 39.99, original_price: null, image_url: 'https://picsum.photos/seed/plant1/400/400', category_id: 'cat-home', stock: 200, rating: 4.2, reviews_count: 456 },
    { id: uuidv4(), name: 'Carbon Fiber Bicycle', description: 'Lightweight frame, Shimano 22-speed, disc brakes, aerodynamic design.', price: 1899.99, original_price: 2199.99, image_url: 'https://picsum.photos/seed/bike1/400/400', category_id: 'cat-sports', stock: 12, rating: 4.8, reviews_count: 67 },
    { id: uuidv4(), name: 'Yoga Mat Premium', description: 'Non-slip, eco-friendly TPE, 6mm thick, includes carrying strap.', price: 49.99, original_price: null, image_url: 'https://picsum.photos/seed/yoga1/400/400', category_id: 'cat-sports', stock: 180, rating: 4.5, reviews_count: 789 },
    { id: uuidv4(), name: 'Hiking Backpack 45L', description: 'Waterproof, ventilated back panel, multiple compartments, rain cover included.', price: 129.99, original_price: 159.99, image_url: 'https://picsum.photos/seed/backpack1/400/400', category_id: 'cat-sports', stock: 55, rating: 4.6, reviews_count: 234 },
    { id: uuidv4(), name: 'Resistance Bands Set', description: '5-piece set with varying resistance levels, includes door anchor and carry bag.', price: 29.99, original_price: 39.99, image_url: 'https://picsum.photos/seed/bands1/400/400', category_id: 'cat-sports', stock: 300, rating: 4.3, reviews_count: 1234 },
    { id: uuidv4(), name: 'Tennis Racket Pro', description: 'Graphite frame, string tension 55-65 lbs, grip size 4 3/8, with cover.', price: 189.99, original_price: null, image_url: 'https://picsum.photos/seed/tennis1/400/400', category_id: 'cat-sports', stock: 40, rating: 4.4, reviews_count: 156 },
    { id: uuidv4(), name: 'Vitamin C Serum', description: '20% Vitamin C, Hyaluronic Acid, Vitamin E. Brightens and firms skin.', price: 34.99, original_price: 44.99, image_url: 'https://picsum.photos/seed/serum1/400/400', category_id: 'cat-beauty', stock: 250, rating: 4.7, reviews_count: 1567 },
    { id: uuidv4(), name: 'Hair Dryer Professional', description: 'Ionic technology, 3 heat settings, lightweight design, includes diffuser.', price: 149.99, original_price: 179.99, image_url: 'https://picsum.photos/seed/hairdryer1/400/400', category_id: 'cat-beauty', stock: 70, rating: 4.5, reviews_count: 345 },
    { id: uuidv4(), name: 'Luxury Fragrance Set', description: '3 signature scents in 30ml bottles, perfect for gifting or trying new favorites.', price: 89.99, original_price: null, image_url: 'https://picsum.photos/seed/perfume1/400/400', category_id: 'cat-beauty', stock: 65, rating: 4.6, reviews_count: 234 },
    { id: uuidv4(), name: 'Electric Toothbrush', description: 'Sonic technology, 5 modes, 2-minute timer, includes 4 brush heads.', price: 79.99, original_price: 99.99, image_url: 'https://picsum.photos/seed/toothbrush1/400/400', category_id: 'cat-beauty', stock: 130, rating: 4.4, reviews_count: 678 },
    { id: uuidv4(), name: 'The Art of Innovation', description: 'Bestselling guide to creative thinking and building breakthrough products.', price: 24.99, original_price: null, image_url: 'https://picsum.photos/seed/book1/400/400', category_id: 'cat-books', stock: 500, rating: 4.5, reviews_count: 2345 },
    { id: uuidv4(), name: 'Wireless E-Reader', description: '7" anti-glare display, weeks of battery, waterproof, 32GB storage.', price: 139.99, original_price: 159.99, image_url: 'https://picsum.photos/seed/ereader1/400/400', category_id: 'cat-books', stock: 80, rating: 4.7, reviews_count: 890 },
    { id: uuidv4(), name: 'Vinyl Record Collection', description: 'Curated set of 5 classic albums on 180g vinyl, audiophile quality pressing.', price: 99.99, original_price: 129.99, image_url: 'https://picsum.photos/seed/vinyl1/400/400', category_id: 'cat-books', stock: 35, rating: 4.8, reviews_count: 123 },
  ];

  for (const p of products) {
    dbRun(
      'INSERT INTO products (id, name, description, price, original_price, image_url, category_id, stock, rating, reviews_count, is_featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [p.id, p.name, p.description, p.price, p.original_price || null, p.image_url, p.category_id, p.stock, p.rating, p.reviews_count, p.is_featured || 0]
    );
  }

  // --- Generate realistic order history (past 90 days) ---
  const customerIds = users.filter(u => u.role === 'customer').map(u => u.id);
  const productList = products;
  const statuses = ['delivered', 'delivered', 'delivered', 'shipped', 'processing', 'pending', 'cancelled'];

  const reviewComments = [
    'Excellent quality! Highly recommend.',
    'Good value for money, met my expectations.',
    'Fast shipping, product as described.',
    'Love it! Will buy again.',
    'Decent product, could be better packaging.',
    'Great product, using it daily.',
    'Perfect gift, the recipient loved it!',
    'Solid build quality, very impressed.',
    'Works as advertised, no complaints.',
    'Premium feel, worth every penny.',
  ];

  const orderCount = 80 + Math.floor(Math.random() * 41);
  for (let i = 0; i < orderCount; i++) {
    const daysAgo = Math.floor(Math.random() * 90);
    const orderDate = new Date(now);
    orderDate.setDate(orderDate.getDate() - daysAgo);
    const dateStr = orderDate.toISOString().replace('T', ' ').substring(0, 19);

    const userId = customerIds[Math.floor(Math.random() * customerIds.length)];
    const status = daysAgo > 14 ? 'delivered' : statuses[Math.floor(Math.random() * statuses.length)];
    const orderId = uuidv4();

    const itemCount = 1 + Math.floor(Math.random() * 4);
    let total = 0;
    const usedProducts = new Set();

    for (let j = 0; j < itemCount; j++) {
      let product;
      do {
        product = productList[Math.floor(Math.random() * productList.length)];
      } while (usedProducts.has(product.id));
      usedProducts.add(product.id);

      const qty = 1 + Math.floor(Math.random() * 3);
      const price = product.price;
      total += price * qty;

      dbRun('INSERT INTO order_items (id, order_id, product_id, quantity, price) VALUES (?, ?, ?, ?, ?)', [uuidv4(), orderId, product.id, qty, price]);

      if (status === 'delivered' && Math.random() < 0.7) {
        const rating = 3 + Math.floor(Math.random() * 3);
        const comment = reviewComments[Math.floor(Math.random() * reviewComments.length)];
        const reviewDate = new Date(orderDate);
        reviewDate.setDate(reviewDate.getDate() + Math.floor(Math.random() * 7) + 1);
        dbRun('INSERT INTO reviews (id, user_id, product_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)', [uuidv4(), userId, product.id, rating, comment, reviewDate.toISOString().replace('T', ' ').substring(0, 19)]);
      }
    }

    dbRun('INSERT INTO orders (id, user_id, total, status, shipping_address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [orderId, userId, Math.round(total * 100) / 100, status, '123 Main St, City, State 12345', dateStr, dateStr]);
  }

  console.log(`✅ Database seeded: ${users.length} users, ${categories.length} categories, ${products.length} products, ${orderCount} orders`);
}

module.exports = { getDb, getDbSync, initializeDatabase, dbGet, dbAll, dbRun, saveDb };
