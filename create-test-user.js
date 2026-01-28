// Script to create a test user in the database
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://ifta_user:ifta_password@localhost:5432/ifta_db',
  ssl: false
});

async function createTestUser() {
  try {
    const email = 'test@example.com';
    const password = 'password123';
    const companyName = 'Test Company';
    
    // Check if user exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    
    if (existing.rows.length > 0) {
      console.log('✅ Test user already exists!');
      console.log(`   Email: ${email}`);
      console.log(`   Password: ${password}`);
      console.log('\nYou can login with these credentials.');
      process.exit(0);
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Create user
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, company_name, phone, brand_color_primary, brand_color_secondary)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, company_name`,
      [email, passwordHash, companyName, '555-1234', '#2563eb', '#1e40af']
    );
    
    const user = result.rows[0];
    
    // Create default subscription
    await pool.query(
      'INSERT INTO subscriptions (user_id, tier, status) VALUES ($1, $2, $3)',
      [user.id, 'free', 'active']
    );
    
    console.log('✅ Test user created successfully!');
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Company: ${user.company_name}`);
    console.log(`   Password: ${password}`);
    console.log('\nYou can now login with these credentials.');
    
  } catch (error) {
    console.error('❌ Error creating test user:', error.message);
    if (error.code === '23505') {
      console.log('   User already exists. You can login with:');
      console.log('   Email: test@example.com');
      console.log('   Password: password123');
    }
  } finally {
    await pool.end();
  }
}

createTestUser();
