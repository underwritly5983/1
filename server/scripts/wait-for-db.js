// Simple script to wait for database to be ready
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function waitForDb(maxRetries = 30, delay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await pool.query('SELECT NOW()');
      console.log('✅ Database is ready!');
      await pool.end();
      process.exit(0);
    } catch (error) {
      console.log(`⏳ Waiting for database... (${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  console.error('❌ Database not ready after maximum retries');
  await pool.end();
  process.exit(1);
}

waitForDb();
