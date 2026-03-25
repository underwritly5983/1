const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// Validate DATABASE_URL (warn only - allow server to start for local/dev without DB)
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set!');
  console.error('   Expected format: postgresql://user:password@host:port/database');
  console.error('   Create server/.env with DATABASE_URL to connect. Server will start but DB routes will fail.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/placeholder',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000,
});

const init = async () => {
  if (!process.env.DATABASE_URL) {
    console.log('⚠️  Skipping database init (no DATABASE_URL). Add .env to connect.');
    return pool;
  }
  try {
    // Test connection first
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection established');
    
    // Read and execute schema
    const schemaPath = path.join(__dirname, '../schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Execute schema (CREATE TABLE IF NOT EXISTS handles existing tables)
    await pool.query(schema);
    console.log('✅ Database schema initialized');

    // Ensure test user exists so login works out of the box (e.g. after Docker first run)
    const testEmail = 'test@example.com';
    const testPassword = 'password123';
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [testEmail]);
    if (existing.rows.length === 0) {
      const passwordHash = await bcrypt.hash(testPassword, 10);
      await pool.query(
        `INSERT INTO users (email, password_hash, company_name, phone, brand_color_primary, brand_color_secondary)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [testEmail, passwordHash, 'Test Company', '555-1234', '#2563eb', '#1e40af']
      );
      const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [testEmail]);
      const userId = userResult.rows[0].id;
      await pool.query('INSERT INTO subscriptions (user_id, tier, status) VALUES ($1, $2, $3)', [userId, 'free', 'active']);
      console.log('✅ Test user created: test@example.com / password123');
    }

    return pool;
  } catch (error) {
    console.error('Database initialization error:', error);
    // Don't throw - allow server to start and retry
    console.error('⚠️  Database initialization failed, but continuing...');
    return pool;
  }
};

const query = async (text, params) => {
  if (!process.env.DATABASE_URL) {
    const err = new Error('Database not configured (DATABASE_URL not set)');
    err.code = 'NO_DATABASE';
    throw err;
  }
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

module.exports = {
  pool,
  query,
  init
};
