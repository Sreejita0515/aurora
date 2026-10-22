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

  // Seed data if empty or upgrade if old legacy catalog is detected
  const ethnicCat = dbGet("SELECT id FROM categories WHERE id = 'cat-ethnic'");
  const userCount = dbGet('SELECT COUNT(*) as count FROM users');
  if (!userCount || userCount.count === 0 || !ethnicCat) {
    seedDatabase();
  }

  saveDb();
  return db;
}

function seedDatabase() {
  const now = new Date();

  // Clear existing catalog data for clean Indian store seeding
  dbRun('DELETE FROM reviews');
  dbRun('DELETE FROM order_items');
  dbRun('DELETE FROM orders');
  dbRun('DELETE FROM cart_items');
  dbRun('DELETE FROM products');
  dbRun('DELETE FROM categories');

  // Preserve existing users if any, or re-seed
  const existingUsers = dbAll('SELECT * FROM users');
  const adminHash = bcrypt.hashSync('admin123', 10);
  const userHash = bcrypt.hashSync('user123', 10);

  let users = [
    { id: uuidv4(), name: 'Admin', email: 'admin@aurora.com', password_hash: adminHash, role: 'admin' },
    { id: uuidv4(), name: 'Priya Patel', email: 'priya@example.com', password_hash: userHash, role: 'customer' },
    { id: uuidv4(), name: 'Rohan Mukherjee', email: 'rohan@example.com', password_hash: userHash, role: 'customer' },
    { id: uuidv4(), name: 'Ananya Iyer', email: 'ananya@example.com', password_hash: userHash, role: 'customer' },
    { id: uuidv4(), name: 'Aarav Sharma', email: 'aarav@example.com', password_hash: userHash, role: 'customer' },
    { id: uuidv4(), name: 'Sneha Nair', email: 'sneha@example.com', password_hash: userHash, role: 'customer' },
    { id: uuidv4(), name: 'Vikram Malhotra', email: 'vikram@example.com', password_hash: userHash, role: 'customer' },
    { id: uuidv4(), name: 'Arjun Mehta', email: 'arjun@example.com', password_hash: userHash, role: 'customer' },
  ];

  if (!existingUsers || existingUsers.length === 0) {
    for (const u of users) {
      dbRun('INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)', [u.id, u.name, u.email, u.password_hash, u.role]);
    }
  } else {
    // Keep existing users for seamless authentication
    users = existingUsers;
  }

  // --- Indian Store Categories ---
  const categories = [
    { id: 'cat-ethnic', name: 'Ethnic & Festive Wear', icon: '🥻', description: 'Handcrafted sarees, kurtas, dupattas & pashminas' },
    { id: 'cat-handicrafts', name: 'Handicrafts & Home Decor', icon: '🪔', description: 'Brass diyas, Jaipur blue pottery, idols & artisanal crafts' },
    { id: 'cat-ayurveda', name: 'Ayurveda & Herbal Care', icon: '🌿', description: 'Kumkumadi serums, pure herbal formulations & natural wellness' },
    { id: 'cat-gourmet', name: 'Spices, Teas & Gourmet', icon: '☕', description: 'Malabar whole spices, Darjeeling estate teas & Kashmiri saffron' },
    { id: 'cat-jewelry', name: 'Jewelry & Footwear', icon: '💎', description: 'Kundan choker sets, pure silver filigree jhumkas & Rajasthani mojris' },
    { id: 'cat-gadgets', name: 'Smart Devices & Audio', icon: '🎧', description: 'Wireless ANC earbuds, smartwatches & audio essentials' },
  ];

  for (const c of categories) {
    dbRun('INSERT INTO categories (id, name, icon, description) VALUES (?, ?, ?, ?)', [c.id, c.name, c.icon, c.description]);
  }

  // --- Authentic Indian Products with High-Resolution Photography ---
  const products = [
    {
      id: uuidv4(),
      name: 'Banarasi Katan Silk Saree',
      description: 'Handwoven pure Varanasi Katan silk saree adorned with intricate golden zari floral jaal, meenakari motifs, and a regal festive pallu. Includes matching unstitched blouse piece.',
      price: 6499,
      original_price: 8999,
      image_url: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=600&q=80',
      category_id: 'cat-ethnic',
      stock: 25,
      rating: 4.9,
      reviews_count: 342,
      is_featured: 1
    },
    {
      id: uuidv4(),
      name: 'Kashmiri Pashmina Embroidered Shawl',
      description: '100% certified pure Himalayan Cashmere wool shawl featuring delicate needle Sozni embroidery handcrafted by master artisans of Srinagar.',
      price: 4299,
      original_price: 5999,
      image_url: 'https://images.unsplash.com/photo-1646935977609-7c3f10fc06c1?auto=format&fit=crop&w=600&q=80',
      category_id: 'cat-ethnic',
      stock: 30,
      rating: 4.8,
      reviews_count: 184,
      is_featured: 1
    },
    {
      id: uuidv4(),
      name: 'Chikankari Hand-Embroidered Kurta',
      description: 'Authentic Lucknowi Chikankari tunic crafted with delicate shadow-work floral motifs on breathable pure georgette with an inner slip.',
      price: 1899,
      original_price: 2499,
      image_url: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=600&q=80',
      category_id: 'cat-ethnic',
      stock: 65,
      rating: 4.7,
      reviews_count: 256,
      is_featured: 1
    },
    {
      id: uuidv4(),
      name: 'Kanjeevaram Temple Border Silk Dupatta',
      description: 'Lustrous South Indian handloom silk dupatta woven with auspicious temple korvai borders and rich antique gold zari work.',
      price: 2799,
      original_price: 3499,
      image_url: 'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&w=600&q=80',
      category_id: 'cat-ethnic',
      stock: 40,
      rating: 4.6,
      reviews_count: 128
    },
    {
      id: uuidv4(),
      name: 'Royal Jaipur Blue Pottery Tea Set',
      description: 'Traditional 7-piece quartz ceramic tea set (teapot + 6 cups) hand-painted with Persian-inspired floral motifs by heritage artisans of Jaipur.',
      price: 1799,
      original_price: 2299,
      image_url: 'https://images.unsplash.com/photo-1598548420253-63d6a327df2d?auto=format&fit=crop&w=600&q=80',
      category_id: 'cat-handicrafts',
      stock: 45,
      rating: 4.8,
      reviews_count: 312,
      is_featured: 1
    },
    {
      id: uuidv4(),
      name: 'Handcrafted Solid Brass Peacock Diya (Pair)',
      description: 'Heavy cast pure brass oil lamps with intricately engraved peacock finials and deep oil reservoirs for Diwali, pooja rituals and home decor.',
      price: 1399,
      original_price: 1899,
      image_url: 'https://images.unsplash.com/photo-1577083753695-e010191bacb5?auto=format&fit=crop&w=600&q=80',
      category_id: 'cat-handicrafts',
      stock: 80,
      rating: 4.9,
      reviews_count: 478,
      is_featured: 1
    },
    {
      id: uuidv4(),
      name: 'Hand-Casted Brass Ganesha Idol',
      description: 'Auspicious bronze-tone brass sculpture of Lord Ganesha in blessing mudra, meticulously detailed and polished by traditional metal smiths.',
      price: 2199,
      original_price: 2799,
      image_url: 'https://images.unsplash.com/photo-1773473639434-e5c3fb31883f?auto=format&fit=crop&w=600&q=80',
      category_id: 'cat-handicrafts',
      stock: 35,
      rating: 4.9,
      reviews_count: 512
    },
    {
      id: uuidv4(),
      name: 'Kashmir Walnut Wood Carved Keepsake Box',
      description: 'Single-block walnut wood box featuring deep relief hand-carving of Kashmiri chinar leaves with soft royal velvet interior lining.',
      price: 1499,
      original_price: 1999,
      image_url: 'https://images.unsplash.com/photo-1465820909510-5aa8bb14978f?auto=format&fit=crop&w=600&q=80',
      category_id: 'cat-handicrafts',
      stock: 50,
      rating: 4.6,
      reviews_count: 94
    },
    {
      id: uuidv4(),
      name: 'Kumkumadi Miraculous Ayurvedic Serum (30ml)',
      description: 'Ancient Ayurvedic formulation infused with 26 precious herbs, Kashmiri saffron, sandalwood, and lotus extract to illuminate and nourish glowing skin.',
      price: 1499,
      original_price: 1999,
      image_url: 'https://images.unsplash.com/photo-1671493229066-f36e86b35841?auto=format&fit=crop&w=600&q=80',
      category_id: 'cat-ayurveda',
      stock: 120,
      rating: 4.8,
      reviews_count: 840,
      is_featured: 1
    },
    {
      id: uuidv4(),
      name: 'Himalayan Pure Shilajit & Gold Ashwagandha',
      description: 'Grade-A purified high-altitude Himalayan shilajit resin enriched with organic KSM-66 ashwagandha for holistic vitality, stamina and mental focus.',
      price: 999,
      original_price: 1399,
      image_url: 'https://images.unsplash.com/photo-1569936906148-06de87cb0681?auto=format&fit=crop&w=600&q=80',
      category_id: 'cat-ayurveda',
      stock: 150,
      rating: 4.7,
      reviews_count: 630
    },
    {
      id: uuidv4(),
      name: 'Mysore Pure Sandalwood Dhoop Cones (Pack of 60)',
      description: 'Charcoal-free natural temple dhoop crafted with authentic Mysore sandalwood paste, organic herbs, and floral extracts for peaceful meditation.',
      price: 449,
      original_price: 599,
      image_url: 'https://images.unsplash.com/photo-1543274420-090dfb67739d?auto=format&fit=crop&w=600&q=80',
      category_id: 'cat-ayurveda',
      stock: 220,
      rating: 4.5,
      reviews_count: 410
    },
    {
      id: uuidv4(),
      name: 'Kerala Malabar Cardamom & Black Pepper Tin',
      description: 'Single-origin bold 8mm green cardamom pods and Tellicherry TGSEB black peppercorns harvested from high-elevation estates in Idukki, Kerala.',
      price: 699,
      original_price: 899,
      image_url: 'https://images.unsplash.com/photo-1622824497447-b284a5493027?auto=format&fit=crop&w=600&q=80',
      category_id: 'cat-gourmet',
      stock: 140,
      rating: 4.8,
      reviews_count: 389,
      is_featured: 1
    },
    {
      id: uuidv4(),
      name: 'Darjeeling First Flush Muscatel Black Tea (150g)',
      description: 'Celebrated spring harvest whole-leaf black tea plucked from misty 6,000 ft Himalayan slopes with delicate floral and natural muscatel grape notes.',
      price: 899,
      original_price: 1199,
      image_url: 'https://images.unsplash.com/photo-1604697976842-d36fa5a1b2ed?auto=format&fit=crop&w=600&q=80',
      category_id: 'cat-gourmet',
      stock: 90,
      rating: 4.7,
      reviews_count: 295
    },
    {
      id: uuidv4(),
      name: 'Kashmiri Mogra Saffron (Grade A++ 1g Kesar)',
      description: '100% authentic GI-tagged Pampore saffron with long dark red stigmas, intense natural aroma and high natural crocin coloring potency.',
      price: 999,
      original_price: 1299,
      image_url: 'https://images.unsplash.com/photo-1643471672168-f4a4b6cfa440?auto=format&fit=crop&w=600&q=80',
      category_id: 'cat-gourmet',
      stock: 85,
      rating: 4.9,
      reviews_count: 540
    },
    {
      id: uuidv4(),
      name: 'Royal Assam CTC Masala Chai Blend (500g)',
      description: 'Rich malty Assam CTC granular tea hand-blended with freshly crushed green cardamom, Ceylon cinnamon, cloves, ginger and black pepper.',
      price: 499,
      original_price: 649,
      image_url: 'https://images.unsplash.com/photo-1619581073186-5b4ae1b0caad?auto=format&fit=crop&w=600&q=80',
      category_id: 'cat-gourmet',
      stock: 300,
      rating: 4.8,
      reviews_count: 720
    },
    {
      id: uuidv4(),
      name: 'Handcrafted Kundan & Pearl Choker Set',
      description: '22K yellow gold-plated Kundan necklace with lustrous freshwater pearls and matching statement jhumki earrings. Handcrafted for festive celebrations.',
      price: 2499,
      original_price: 3499,
      image_url: 'https://images.unsplash.com/photo-1738754719555-05aca36707b1?auto=format&fit=crop&w=600&q=80',
      category_id: 'cat-jewelry',
      stock: 40,
      rating: 4.8,
      reviews_count: 380,
      is_featured: 1
    },
    {
      id: uuidv4(),
      name: 'Cuttack Silver Filigree Jhumkas (925 Silver)',
      description: 'Traditional Tarakasi pure sterling silver filigree bell earrings handcrafted by generational silversmiths of Cuttack, Odisha.',
      price: 1699,
      original_price: 2199,
      image_url: 'https://images.unsplash.com/photo-1714733831162-0a6e849141be?auto=format&fit=crop&w=600&q=80',
      category_id: 'cat-jewelry',
      stock: 35,
      rating: 4.7,
      reviews_count: 165
    },
    {
      id: uuidv4(),
      name: 'Hand-Embroidered Rajasthani Leather Mojris',
      description: 'Comfortable handcrafted genuine leather juttis with rich resham thread embroidery, cushioned footbed, and traditional curved toe styling.',
      price: 1299,
      original_price: 1799,
      image_url: 'https://images.unsplash.com/photo-1757598076944-530a7bb81d79?auto=format&fit=crop&w=600&q=80',
      category_id: 'cat-jewelry',
      stock: 70,
      rating: 4.5,
      reviews_count: 210
    },
    {
      id: uuidv4(),
      name: 'AuraPods ANC Wireless Earbuds (Deep Bass Edition)',
      description: 'Active Noise Cancellation up to 35dB, 50-hour battery life with Fast Charge, quad mic ENC, and tuned specifically for rich Indian music acoustics.',
      price: 1999,
      original_price: 3499,
      image_url: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=600&q=80',
      category_id: 'cat-gadgets',
      stock: 180,
      rating: 4.6,
      reviews_count: 1450,
      is_featured: 1
    },
    {
      id: uuidv4(),
      name: 'AuraFit Apex Smartwatch (1.96" AMOLED)',
      description: 'Vibrant always-on AMOLED display with Bluetooth calling, Hindi & English voice assistant, heart rate, SpO2 sensor and 100+ Indian sports modes.',
      price: 2699,
      original_price: 4499,
      image_url: 'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?auto=format&fit=crop&w=600&q=80',
      category_id: 'cat-gadgets',
      stock: 110,
      rating: 4.5,
      reviews_count: 980
    },
  ];

  for (const p of products) {
    dbRun(
      'INSERT INTO products (id, name, description, price, original_price, image_url, category_id, stock, rating, reviews_count, is_featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [p.id, p.name, p.description, p.price, p.original_price || null, p.image_url, p.category_id, p.stock, p.rating, p.reviews_count, p.is_featured || 0]
    );
  }

  // --- Realistic Indian Orders & Reviews ---
  const customerIds = users.filter(u => u.role === 'customer').map(u => u.id);
  const productList = products;
  const statuses = ['delivered', 'delivered', 'delivered', 'shipped', 'processing', 'pending', 'cancelled'];

  const indianAddresses = [
    '14/B Indiranagar, 100ft Road, Bengaluru, Karnataka 560038',
    '42 Park Street, Flat 4A, Kolkata, West Bengal 700016',
    'B-204 Bandra West, Hill Road, Mumbai, Maharashtra 400050',
    'Flat 301, Sector 15, Noida, Uttar Pradesh 201301',
    '78 C-Scheme, Subhash Marg, Jaipur, Rajasthan 302001',
    'Plot 12, Road No. 36, Jubilee Hills, Hyderabad, Telangana 500033',
    '25 Panampilly Nagar, Main Avenue, Kochi, Kerala 682036',
    '502 Deccan Gymkhana, Pune, Maharashtra 411004',
  ];

  const reviewComments = [
    'Superb quality Banarasi weave! The zari shine is pure royalty. Highly recommend!',
    'Authentic Darjeeling first flush flavor. The floral aroma is unmatchable.',
    'Very well packed and prompt delivery to Bengaluru. The brass finish is solid.',
    'The Kumkumadi oil is pure magic. Natural radiant glow within a week of use!',
    'Received in pristine condition in Kolkata. Genuine handcrafted Indian quality.',
    'Great value for money! The Kundan choker set looks heavy and exquisite.',
    'The aroma of the Malabar cardamom filled the entire kitchen when I opened the tin.',
    'Pure soft Kashmiri Pashmina. Warm, light, and very elegant embroidery.',
    'The Jaipur blue pottery set is an absolute conversation starter on my dining table.',
    'Outstanding sound clarity and deep bass on the earbuds. Works great with regional tunes!',
  ];

  const orderCount = 80 + Math.floor(Math.random() * 41);
  for (let i = 0; i < orderCount; i++) {
    const daysAgo = Math.floor(Math.random() * 90);
    const orderDate = new Date(now);
    orderDate.setDate(orderDate.getDate() - daysAgo);
    const dateStr = orderDate.toISOString().replace('T', ' ').substring(0, 19);

    const userId = customerIds[Math.floor(Math.random() * customerIds.length)];
    const status = daysAgo > 14 ? 'delivered' : statuses[Math.floor(Math.random() * statuses.length)];
    const address = indianAddresses[Math.floor(Math.random() * indianAddresses.length)];
    const orderId = uuidv4();

    const itemCount = 1 + Math.floor(Math.random() * 3);
    let total = 0;
    const usedProducts = new Set();

    for (let j = 0; j < itemCount; j++) {
      let product;
      do {
        product = productList[Math.floor(Math.random() * productList.length)];
      } while (usedProducts.has(product.id));
      usedProducts.add(product.id);

      const qty = 1 + Math.floor(Math.random() * 2);
      const price = product.price;
      total += price * qty;

      dbRun('INSERT INTO order_items (id, order_id, product_id, quantity, price) VALUES (?, ?, ?, ?, ?)', [uuidv4(), orderId, product.id, qty, price]);

      if (status === 'delivered' && Math.random() < 0.7) {
        const rating = 4 + (Math.random() > 0.3 ? 1 : 0);
        const comment = reviewComments[Math.floor(Math.random() * reviewComments.length)];
        const reviewDate = new Date(orderDate);
        reviewDate.setDate(reviewDate.getDate() + Math.floor(Math.random() * 7) + 1);
        dbRun('INSERT INTO reviews (id, user_id, product_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)', [uuidv4(), userId, product.id, rating, comment, reviewDate.toISOString().replace('T', ' ').substring(0, 19)]);
      }
    }

    dbRun('INSERT INTO orders (id, user_id, total, status, shipping_address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [orderId, userId, Math.round(total), status, address, dateStr, dateStr]);
  }

  console.log(`✅ Indian Store database seeded: ${categories.length} categories, ${products.length} Indian products, ${orderCount} orders`);
}

module.exports = { getDb, getDbSync, initializeDatabase, dbGet, dbAll, dbRun, saveDb };

