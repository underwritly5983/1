const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Validate DATABASE_URL
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set!');
  console.error('   Expected format: postgresql://user:password@host:port/database');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  // Add connection timeout
  connectionTimeoutMillis: 5000,
});

const init = async () => {
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
    
    return pool;
  } catch (error) {
    console.error('Database initialization error:', error);
    // Don't throw - allow server to start and retry
    console.error('⚠️  Database initialization failed, but continuing...');
    return pool;
  }
};

const query = async (text, params) => {
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
