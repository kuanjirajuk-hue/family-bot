const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// 1. Replace imports
code = code.replace("const mysql = require('mysql2/promise');", "const { Pool } = require('pg');");

// 2. Replace connection pool
const poolRegex = /\/\/ MySQL Connection Pool[\s\S]+?charset: 'utf8mb4'\n\}\);/;
const pgPool = `// PostgreSQL Connection Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || \`postgres://\${process.env.DB_USER || 'postgres'}:\${process.env.DB_PASS || 'postgres'}@\${process.env.DB_HOST || 'localhost'}:5432/family_system\`,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Wrapper to make pg compatible with existing mysql2 queries
const originalQuery = pool.query.bind(pool);
pool.query = async function(text, values) {
  if (typeof text === 'string' && text.includes('?')) {
    let i = 1;
    text = text.replace(/\\?/g, () => \`$\${i++}\`);
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
};`;
code = code.replace(poolRegex, pgPool);

// 3. Remove CREATE DATABASE block
const createDbRegex = /\/\/ Create DB if not exists[\s\S]+?await initConn\.end\(\);/;
code = code.replace(createDbRegex, "// PostgreSQL database is provided by Render, no need to create it here.");

// 4. Update init error log
code = code.replace("Is XAMPP MySQL running?", "Is PostgreSQL running?");

fs.writeFileSync('server.js', code);
console.log('Migration complete');
