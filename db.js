// sms-inbound/db.js
const { Pool } = require('pg');
require('dotenv').config(); // ✅ Loads .env from current folder

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.on('connect', () => {
  console.log('📦 [sms-inbound] Connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.error('❌ DB Error:', err);
});

module.exports = pool;
