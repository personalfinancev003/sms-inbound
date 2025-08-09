// middleware/auth.js
require('dotenv').config();
const db = require('../db');

module.exports = async function checkAuth(req, res, next) {
  // Ignore bearer tokens completely - only check secret_key
  
  if (!req.body || !req.body.secret_key) {
    return res.status(200).json({ message: 'Request ignored' });
  }
  
  // Validate secret_key
  try {
    const result = await db.query(
      'SELECT id FROM accounts WHERE secret_key = $1',
      [req.body.secret_key]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'Invalid secret_key' });
    }

    // Valid secret_key - attach account_id to request
    req.account_id = result.rows[0].id;
    next();
  } catch (err) {
    console.error('❌ Database error during secret_key validation');
    return res.status(500).json({ error: 'Internal server error' });
  }
};
