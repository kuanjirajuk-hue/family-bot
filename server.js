const express = require('express');
const cors = require('cors');
const line = require('@line/bot-sdk');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Configs for LINE
const lineConfig = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN || 'YOUR_CHANNEL_ACCESS_TOKEN',
  channelSecret: process.env.LINE_CHANNEL_SECRET || 'YOUR_CHANNEL_SECRET'
};

const client = new line.Client(lineConfig);

// PostgreSQL Connection Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || `postgres://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASS || 'postgres'}@${process.env.DB_HOST || 'localhost'}:5432/family_system`,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Wrapper to make pg compatible with existing mysql2 queries
const originalQuery = pool.query.bind(pool);
pool.query = async function(text, values) {
  if (typeof text === 'string' && text.includes('?')) {
    let i = 1;
    text = text.replace(/\?/g, () => `$${i++}`);
  }
  text = text.replace(/ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci/g, '');
  text = text.replace(/DATETIME/g, 'TIMESTAMP');
  
  if (text.includes("INSERT IGNORE INTO settings")) {
      text = text.replace("INSERT IGNORE INTO settings", "INSERT INTO settings").replace("VALUES ('savings', '0')", "VALUES ('savings', '0') ON CONFLICT (setting_key) DO NOTHING");
  } else if (text.includes("INSERT IGNORE INTO users (id, name, budget)")) {
      text = text.replace("INSERT IGNORE INTO users (id, name, budget)", "INSERT INTO users (id, name, budget)") + " ON CONFLICT (id) DO NOTHING";
  } else if (text.includes("INSERT IGNORE INTO users (id, name)")) {
      text = text.replace("INSERT IGNORE INTO users (id, name)", "INSERT INTO users (id, name)") + " ON CONFLICT (id) DO NOTHING";
  } else if (text.includes("ON DUPLICATE KEY UPDATE setting_value = ?")) {
      text = text.replace("ON DUPLICATE KEY UPDATE setting_value = ?", "ON CONFLICT (setting_key) DO UPDATE SET setting_value = $3");
  }
  
  const result = await originalQuery(text, values);
  return [result.rows, result.fields];
};

// ─────────────────────────────────────────────
//  Initialize Database Tables
// ─────────────────────────────────────────────
async function initDb() {
  try {
    // PostgreSQL database is provided by Render, no need to create it here.

    // Users (with monthly budget limit, default 4000.00 THB)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id     VARCHAR(200) NOT NULL,
        name   VARCHAR(200) DEFAULT NULL,
        budget DECIMAL(10,2) DEFAULT 4000.00,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Ensure budget column exists in case users table was created earlier
    try {
      await pool.query('ALTER TABLE users ADD COLUMN budget DECIMAL(10,2) DEFAULT 4000.00');
    } catch (e) {
      // column already exists
    }
    await pool.query('UPDATE users SET budget = 4000.00 WHERE budget IS NULL');

    // Transactions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id          VARCHAR(100) NOT NULL,
        date        DATETIME     DEFAULT NULL,
        amount      DECIMAL(10,2) DEFAULT NULL,
        category    VARCHAR(200) DEFAULT NULL,
        description TEXT         DEFAULT NULL,
        user_id     VARCHAR(200) DEFAULT NULL,
        type        VARCHAR(20)  DEFAULT NULL,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Fixed Transactions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fixed_transactions (
        id            VARCHAR(100) NOT NULL,
        amount        DECIMAL(10,2) DEFAULT NULL,
        category      VARCHAR(200) DEFAULT NULL,
        description   TEXT         DEFAULT NULL,
        user_id       VARCHAR(200) DEFAULT NULL,
        type          VARCHAR(20)  DEFAULT NULL,
        recurring_day INT          DEFAULT NULL,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Stock
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stock (
        id        VARCHAR(100) NOT NULL,
        name      VARCHAR(200) DEFAULT NULL,
        quantity  DECIMAL(10,2) DEFAULT NULL,
        unit      VARCHAR(100) DEFAULT NULL,
        threshold DECIMAL(10,2) DEFAULT NULL,
        user_id   VARCHAR(200) DEFAULT NULL,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Reminders
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reminders (
        id      VARCHAR(100) NOT NULL,
        date    DATE         DEFAULT NULL,
        message TEXT         DEFAULT NULL,
        user_id VARCHAR(200) DEFAULT NULL,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Settings
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        setting_key VARCHAR(100) NOT NULL,
        setting_value TEXT DEFAULT NULL,
        PRIMARY KEY (setting_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    // Initialize default savings
    await pool.query("INSERT IGNORE INTO settings (setting_key, setting_value) VALUES ('savings', '0')");

    console.log('✅ Database initialized successfully.');
  } catch (err) {
    console.error('❌ Failed to initialize database. Is PostgreSQL running?', err.message);
    process.exit(1); // Stop server if DB is unavailable
  }
}

// ─────────────────────────────────────────────
//  Middleware
// ─────────────────────────────────────────────
app.use(cors());
app.use(express.static('public'));

// LINE Webhook (must be before bodyParser.json)
app.post('/webhook', line.middleware(lineConfig), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

app.use(bodyParser.json());

// ─────────────────────────────────────────────
//  Helpers & Budget Calculations
// ─────────────────────────────────────────────

const THAI_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

// Get or create user — supports both LINE userId and plain name (from dashboard)
async function getOrCreateUser(userId) {
  if (!userId) return 'Unknown';

  const [rows] = await pool.query('SELECT name FROM users WHERE id = ?', [userId]);
  if (rows.length > 0) return rows[0].name;

  // Try to get LINE profile (only works for real LINE userIds)
  let userName = userId; // default: use the id itself as name
  if (userId.startsWith('U')) {
    try {
      const profile = await client.getProfile(userId);
      userName = profile.displayName;
    } catch (e) {
      // Not a LINE user, use userId as name
    }
  }

  await pool.query(
    'INSERT IGNORE INTO users (id, name, budget) VALUES (?, ?, 4000.00)',
    [userId, userName]
  );
  return userName;
}

// Calculate individual monthly budget status (Default 4,000 THB/month)
async function getUserBudgetSummary(userId, userNameHint) {
  let [users] = await pool.query('SELECT * FROM users WHERE id = ? OR name = ?', [userId, userId]);
  if (users.length === 0 && userNameHint) {
    [users] = await pool.query('SELECT * FROM users WHERE id = ? OR name = ?', [userNameHint, userNameHint]);
  }

  let user = users.length > 0 ? users[0] : null;
  const name = (user && user.name) ? user.name : (userNameHint || userId);
  const budget = user && user.budget !== null && !isNaN(user.budget) ? parseFloat(user.budget) : 4000.00;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const monthStr = String(month + 1).padStart(2, '0');
  const startStr = `${year}-${monthStr}-01 00:00:00`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const endStr = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')} 23:59:59`;

  // Find all user records matching this name or id (e.g. LINE ID and plain name)
  const [allMatchingUsers] = await pool.query('SELECT id, name FROM users WHERE id = ? OR name = ? OR name = ?', [userId, userId, name]);

  const idsToCheck = new Set([userId]);
  if (name) idsToCheck.add(name);
  if (user && user.id) idsToCheck.add(user.id);
  if (user && user.name) idsToCheck.add(user.name);
  for (const match of allMatchingUsers) {
    if (match.id) idsToCheck.add(match.id);
    if (match.name) idsToCheck.add(match.name);
  }

  const idArray = Array.from(idsToCheck);
  const placeholders = idArray.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total_spent 
     FROM transactions 
     WHERE user_id IN (${placeholders})
       AND type = 'expense'
       AND date >= ? AND date <= ?`,
    [...idArray, startStr, endStr]
  );

  const spent = parseFloat(rows[0].total_spent) || 0;
  const remaining = budget - spent;
  const percentage = budget > 0 ? Math.round((spent / budget) * 100) : 0;

  return {
    userId: user ? user.id : userId,
    userName: name,
    budget,
    spent,
    remaining,
    percentage,
    isOverBudget: remaining < 0,
    monthName: THAI_MONTHS[month],
    yearThai: year + 543
  };
}

// Get all users' monthly budget status (only registered users in users table)
async function getAllUsersBudgetSummary() {
  const [users] = await pool.query('SELECT * FROM users ORDER BY name');

  const nameMap = new Map();

  for (const u of users) {
    if (!u) continue;
    const rawName = (u.name || u.id || '').trim();
    if (!rawName || rawName === '???' || rawName === 'System' || rawName === 'Unknown') continue;

    const normKey = rawName.toLowerCase();
    if (!nameMap.has(normKey)) {
      nameMap.set(normKey, {
        id: u.id,
        name: rawName,
        budget: u.budget !== null && !isNaN(u.budget) ? parseFloat(u.budget) : 4000.00
      });
    } else {
      const existing = nameMap.get(normKey);
      if (u.id.startsWith('U') && !existing.id.startsWith('U')) {
        existing.id = u.id;
      }
      if (u.budget && parseFloat(u.budget) !== 4000.00) {
        existing.budget = parseFloat(u.budget);
      }
    }
  }

  const summaries = [];
  for (const [key, u] of nameMap.entries()) {
    const summary = await getUserBudgetSummary(u.id, u.name);
    summaries.push(summary);
  }

  return summaries;
}

// ─────────────────────────────────────────────
//  LINE Event Handler
// ─────────────────────────────────────────────
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const text = event.message.text.trim();
  const userId = event.source.userId;
  const userName = await getOrCreateUser(userId);

  console.log(`[LINE MSG] from ${userName} (${userId}): "${text}"`);

  let replyText = '💡 คำสั่งที่รองรับ:\n' +
    '- +จ่าย 150 ค่ากาแฟ (ตัดยอดงบ 4,000 อัตโนมัติ)\n' +
    '- +รับ 20000 เงินเดือน\n' +
    '- งบ / เช็คงบ (ดูยอดคงเหลือเดือนนี้)\n' +
    '- ซื้อ น้ำยาล้างจาน 2 ถุง\n' +
    '- สต็อก น้ำยาล้างจาน\n' +
    '- เตือน พรุ่งนี้ ซื้อของเข้าบ้าน';

  try {
    // 1. Transaction: +จ่าย / +รับ
    const typeMatch = text.match(/^\+(จ่าย|รับ)/);
    
    if (typeMatch) {
      const type = typeMatch[1] === 'จ่าย' ? 'expense' : 'income';
      
      // Extract number from the text
      const numMatch = text.match(/[\d.]+/);
      const amount = numMatch ? parseFloat(numMatch[0]) : 0;
      
      // Extract category
      let category = text.replace(/^\+(จ่าย|รับ)/, '').replace(/[\d.]+/, '').trim();
      if (!category) category = 'ทั่วไป';

      const date = new Date().toISOString().slice(0, 19).replace('T', ' ');

      await pool.query(
        'INSERT INTO transactions (id, date, amount, category, description, user_id, type) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuidv4(), date, amount, category, category, userId, type]
      );

      if (type === 'expense') {
        const budgetStatus = await getUserBudgetSummary(userId, userName);
        let alertMsg = '';
        if (budgetStatus.remaining < 0) {
          alertMsg = `\n🚨 ใช้เกินงบแล้ว: ${Math.abs(budgetStatus.remaining).toLocaleString('th-TH')} บาท!`;
        } else if (budgetStatus.percentage >= 80) {
          alertMsg = `\n⚠️ เตือน: ใกล้หมดงบเดือนนี้แล้ว (เหลือ ${budgetStatus.remaining.toLocaleString('th-TH')} บ.)`;
        }

        replyText = `✅ บันทึกรายจ่ายสำเร็จ!\n` +
          `━━━━━━━━━━━━━━━\n` +
          `👤 ผู้จ่าย: ${userName}\n` +
          `📝 รายการ: ${category}\n` +
          `💸 จำนวน: ${amount.toLocaleString('th-TH')} บาท\n` +
          `━━━━━━━━━━━━━━━\n` +
          `📊 งบเดือนนี้ (${budgetStatus.monthName} ${budgetStatus.yearThai}):\n` +
          `💳 ใช้ไป: ${budgetStatus.spent.toLocaleString('th-TH')} / ${budgetStatus.budget.toLocaleString('th-TH')} บ. (${budgetStatus.percentage}%)\n` +
          `💰 คงเหลือ: ${budgetStatus.remaining.toLocaleString('th-TH')} บาท` +
          alertMsg;
      } else {
        replyText = `✅ บันทึกรายรับสำเร็จ!\n` +
          `━━━━━━━━━━━━━━━\n` +
          `👤 ผู้รับ: ${userName}\n` +
          `📝 รายการ: ${category}\n` +
          `💵 จำนวน: ${amount.toLocaleString('th-TH')} บาท`;
      }

      return client.replyMessage(event.replyToken, { type: 'text', text: replyText });
    }

    // 2. Check Budget: งบ / เช็คงบ / ยอดเงิน / โควต้า / สรุปงบ
    const budgetCheckRegex = /^(งบ|เช็คงบ|ยอดเงิน|โควต้า|สรุปงบ|งบประมาณ|ดูงบ)$/;
    if (budgetCheckRegex.test(text)) {
      const budgetStatus = await getUserBudgetSummary(userId, userName);
      let statusIcon = '🟢 สถานะ: ใช้งบปกติ';
      if (budgetStatus.remaining < 0) {
        statusIcon = `🚨 สถานะ: เกินงบ ${Math.abs(budgetStatus.remaining).toLocaleString('th-TH')} บาท`;
      } else if (budgetStatus.percentage >= 80) {
        statusIcon = `⚠️ สถานะ: ใกล้หมดงบ (เหลือ ${budgetStatus.remaining.toLocaleString('th-TH')} บ.)`;
      }

      replyText = `📊 สรุปงบประจำเดือน (${budgetStatus.monthName} ${budgetStatus.yearThai})\n` +
        `━━━━━━━━━━━━━━━\n` +
        `👤 สมาชิก: ${userName}\n` +
        `💰 โควต้างบ: ${budgetStatus.budget.toLocaleString('th-TH')} บาท\n` +
        `💳 ใช้ไปแล้ว: ${budgetStatus.spent.toLocaleString('th-TH')} บาท (${budgetStatus.percentage}%)\n` +
        `💵 คงเหลือใช้ได้: ${budgetStatus.remaining.toLocaleString('th-TH')} บาท\n` +
        `━━━━━━━━━━━━━━━\n` +
        statusIcon;
      return client.replyMessage(event.replyToken, { type: 'text', text: replyText });
    }

    // 3. Buy Stock: ซื้อ <ชื่อ> <จำนวน> <หน่วย>
    const buyRegex = /^ซื้อ\s+(.+?)\s+([\d.]+)\s*(.*)$/;
    const buyMatch = text.match(buyRegex);
    if (buyMatch) {
      const itemName = buyMatch[1].trim();
      const qty = parseFloat(buyMatch[2]);
      const unit = buyMatch[3].trim() || 'ชิ้น';

      const [rows] = await pool.query('SELECT * FROM stock WHERE name = ?', [itemName]);
      let currentQty = qty;
      let currentUnit = unit;

      if (rows.length > 0) {
        const item = rows[0];
        currentQty = parseFloat(item.quantity) + qty;
        currentUnit = unit || item.unit;
        await pool.query(
          'UPDATE stock SET quantity = ?, unit = ? WHERE id = ?',
          [currentQty, currentUnit, item.id]
        );
      } else {
        await pool.query(
          'INSERT INTO stock (id, name, quantity, unit, threshold, user_id) VALUES (?, ?, ?, ?, ?, ?)',
          [uuidv4(), itemName, currentQty, currentUnit, 1, userId]
        );
      }

      replyText = `เพิ่ม ${itemName} ${qty} ${currentUnit} (คงเหลือ: ${currentQty} ${currentUnit}) ✅`;
      return client.replyMessage(event.replyToken, { type: 'text', text: replyText });
    }

    // 4. Check Stock: สต็อก <ชื่อ>
    const stockRegex = /^สต็อก\s+(.+)$/;
    const stockMatch = text.match(stockRegex);
    if (stockMatch) {
      const itemName = stockMatch[1].trim();
      const [rows] = await pool.query('SELECT * FROM stock WHERE name = ?', [itemName]);
      replyText = rows.length > 0
        ? `สต็อก ${itemName} คงเหลือ ${rows[0].quantity} ${rows[0].unit}`
        : `ไม่พบสต็อกของ ${itemName}`;
      return client.replyMessage(event.replyToken, { type: 'text', text: replyText });
    }

    // 5. Reminder: เตือน พรุ่งนี้ <ข้อความ>
    const remindRegex = /^เตือน\s+พรุ่งนี้\s+(.+)$/;
    const remindMatch = text.match(remindRegex);
    if (remindMatch) {
      const message = remindMatch[1].trim();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split('T')[0];

      await pool.query(
        'INSERT INTO reminders (id, date, message, user_id) VALUES (?, ?, ?, ?)',
        [uuidv4(), dateStr, message, userId]
      );

      replyText = `ตั้งเตือนพรุ่งนี้: "${message}" เรียบร้อย ✅`;
      return client.replyMessage(event.replyToken, { type: 'text', text: replyText });
    }
  } catch (err) {
    console.error('handleEvent error:', err);
    replyText = '❌ เกิดข้อผิดพลาด กรุณาลองใหม่';
  }

  return client.replyMessage(event.replyToken, { type: 'text', text: replyText });
}

// ─────────────────────────────────────────────
//  API Endpoints
// ─────────────────────────────────────────────

// GET /api/budgets (Monthly Budget summary for all users)
app.get('/api/budgets', async (req, res) => {
  try {
    const summaries = await getAllUsersBudgetSummary();
    res.json(summaries);
  } catch (err) {
    console.error('GET /api/budgets error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/users/:id/budget
app.put('/api/users/:id/budget', async (req, res) => {
  try {
    const { id } = req.params;
    const { budget } = req.body;
    if (budget === undefined || isNaN(budget) || parseFloat(budget) < 0) {
      return res.status(400).json({ error: 'กรุณาระบุจำนวนงบประมาณที่ถูกต้อง' });
    }
    await pool.query('UPDATE users SET budget = ? WHERE id = ? OR name = ?', [parseFloat(budget), id, id]);
    res.json({ success: true, budget: parseFloat(budget) });
  } catch (err) {
    console.error('PUT /api/users/:id/budget error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users
app.get('/api/users', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users');
    const usersMap = {};
    rows.forEach(r => usersMap[r.id] = r);
    res.json(usersMap);
  } catch (err) {
    console.error('GET /api/users error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users (Add new family member)
app.post('/api/users', async (req, res) => {
  try {
    const { name, budget } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อสมาชิก' });
    }
    const userName = name.trim();
    const userBudget = budget !== undefined && !isNaN(budget) ? parseFloat(budget) : 4000.00;
    const id = uuidv4();

    await pool.query(
      'INSERT INTO users (id, name, budget) VALUES (?, ?, ?)',
      [id, userName, userBudget]
    );

    res.json({ success: true, id, name: userName, budget: userBudget });
  } catch (err) {
    console.error('POST /api/users error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/:id (Delete family member)
app.delete('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Delete by ID or name
    await pool.query('DELETE FROM users WHERE id = ? OR name = ?', [id, id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/users/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/transactions
app.get('/api/transactions', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM transactions ORDER BY date DESC');
    res.json(rows.map(r => ({ ...r, userId: r.user_id })));
  } catch (err) {
    console.error('GET /api/transactions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/transactions
app.post('/api/transactions', async (req, res) => {
  try {
    const { type, category, amount, userId, description } = req.body;

    if (!type || !category || !amount || !userId) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ (type, category, amount, userId)' });
    }

    const id = uuidv4();
    const date = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // Auto-create user if not exists (for dashboard web users)
    await pool.query(
      'INSERT IGNORE INTO users (id, name, budget) VALUES (?, ?, 4000.00)',
      [userId, userId]
    );

    await pool.query(
      'INSERT INTO transactions (id, date, amount, category, description, user_id, type) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, date, parseFloat(amount), category, description || category, userId, type]
    );

    res.json({ success: true, id });
  } catch (err) {
    console.error('POST /api/transactions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/transactions/:id
app.put('/api/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { type, category, amount, userId, description } = req.body;

    if (!type || !category || !amount || !userId) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ (type, category, amount, userId)' });
    }

    // Auto-create user if not exists (for dashboard web users)
    await pool.query(
      'INSERT IGNORE INTO users (id, name) VALUES (?, ?)',
      [userId, userId]
    );

    const [result] = await pool.query(
      'UPDATE transactions SET amount = ?, category = ?, description = ?, user_id = ?, type = ? WHERE id = ?',
      [parseFloat(amount), category, description || category, userId, type, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'ไม่พบรายการ' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('PUT /api/transactions/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/transactions/:id
app.delete('/api/transactions/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM transactions WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/transactions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stock
app.get('/api/stock', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM stock ORDER BY name');
    res.json(rows.map(r => ({ ...r, userId: r.user_id })));
  } catch (err) {
    console.error('GET /api/stock error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stock  (create or update)
app.post('/api/stock', async (req, res) => {
  try {
    const { id, name, quantity, unit, threshold } = req.body;

    if (!name || quantity === undefined || !unit) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ (name, quantity, unit)' });
    }

    if (id) {
      // Update existing
      await pool.query(
        'UPDATE stock SET name=?, quantity=?, unit=?, threshold=? WHERE id=?',
        [name, parseFloat(quantity), unit, parseFloat(threshold) || 1, id]
      );
      res.json({ success: true, id });
    } else {
      // Create new
      const newId = uuidv4();
      await pool.query(
        'INSERT INTO stock (id, name, quantity, unit, threshold, user_id) VALUES (?, ?, ?, ?, ?, ?)',
        [newId, name, parseFloat(quantity), unit, parseFloat(threshold) || 1, 'System']
      );
      res.json({ success: true, id: newId });
    }
  } catch (err) {
    console.error('POST /api/stock error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/stock/:id
app.delete('/api/stock/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM stock WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/stock error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fixed_transactions
app.get('/api/fixed_transactions', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM fixed_transactions ORDER BY recurring_day');
    res.json(rows.map(r => ({ ...r, userId: r.user_id, recurringDay: r.recurring_day })));
  } catch (err) {
    console.error('GET /api/fixed_transactions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/fixed_transactions  (create or update)
app.post('/api/fixed_transactions', async (req, res) => {
  try {
    const { id, type, category, amount, recurringDay } = req.body;

    if (!type || !category || !amount || !recurringDay) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ (type, category, amount, recurringDay)' });
    }

    if (id) {
      await pool.query(
        'UPDATE fixed_transactions SET type=?, category=?, amount=?, recurring_day=? WHERE id=?',
        [type, category, parseFloat(amount), parseInt(recurringDay), id]
      );
      res.json({ success: true, id });
    } else {
      const newId = uuidv4();
      await pool.query(
        'INSERT INTO fixed_transactions (id, amount, category, type, recurring_day, user_id) VALUES (?, ?, ?, ?, ?, ?)',
        [newId, parseFloat(amount), category, type, parseInt(recurringDay), 'System']
      );
      res.json({ success: true, id: newId });
    }
  } catch (err) {
    console.error('POST /api/fixed_transactions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/fixed_transactions/:id
app.delete('/api/fixed_transactions/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM fixed_transactions WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/fixed_transactions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/settings
app.get('/api/settings', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM settings');
    const settings = {};
    rows.forEach(r => settings[r.setting_key] = r.setting_value);
    res.json(settings);
  } catch (err) {
    console.error('GET /api/settings error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings
app.post('/api/settings', async (req, res) => {
  try {
    const { key, value } = req.body;
    await pool.query(
      'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
      [key, value, value]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/settings error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
//  Cron: Daily 08:00 — Reminders + Fixed Tx + Low Stock
// ─────────────────────────────────────────────
cron.schedule('0 8 * * *', async () => {
  console.log('⏰ Running daily cron job...');
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  const dayOfMonth = today.getDate();

  const messages = [];

  try {
    // 1. Today's reminders
    const [reminders] = await pool.query('SELECT * FROM reminders WHERE date = ?', [dateStr]);
    if (reminders.length > 0) {
      messages.push('🔔 แจ้งเตือนสำหรับวันนี้:');
      reminders.forEach(r => messages.push(`- ${r.message}`));
    }

    // 2. Fixed transactions due today
    const [fixedTxs] = await pool.query(
      'SELECT * FROM fixed_transactions WHERE recurring_day = ?',
      [dayOfMonth]
    );
    if (fixedTxs.length > 0) {
      messages.push('\n💸 รายการประจำที่ครบกำหนดวันนี้:');
      for (const t of fixedTxs) {
        messages.push(`- [${t.type === 'expense' ? 'จ่าย' : 'รับ'}] ${t.category}: ${t.amount} บาท`);
        const date = new Date().toISOString().slice(0, 19).replace('T', ' ');
        await pool.query(
          'INSERT INTO transactions (id, date, amount, category, description, user_id, type) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [uuidv4(), date, t.amount, t.category, 'Auto (Fixed)', 'System', t.type]
        );
      }
    }

    // 3. Low stock alert
    const [lowStock] = await pool.query('SELECT * FROM stock WHERE quantity <= threshold');
    if (lowStock.length > 0) {
      messages.push('\n⚠️ สต็อกสินค้าใกล้หมด:');
      lowStock.forEach(s => messages.push(`- ${s.name} เหลือ ${s.quantity} ${s.unit}`));
    }

    // Broadcast to LINE if configured
    const hasLineConfig = process.env.LINE_ACCESS_TOKEN &&
      process.env.LINE_ACCESS_TOKEN !== 'YOUR_CHANNEL_ACCESS_TOKEN';

    if (messages.length > 0 && hasLineConfig) {
      await client.broadcast({ type: 'text', text: messages.join('\n') });
    } else if (messages.length > 0) {
      console.log('Cron messages (no LINE config):\n', messages.join('\n'));
    }
  } catch (e) {
    console.error('Cron job error:', e);
  }
});

// ─────────────────────────────────────────────
//  Start Server — wait for DB init first
// ─────────────────────────────────────────────
initDb().then(() => {
  app.listen(port, () => {
    console.log(`🚀 Server is running at http://localhost:${port}`);
  });
});
