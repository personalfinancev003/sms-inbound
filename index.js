const express = require('express');
const checkAuth = require('./middleware/auth');
const db = require('./db');
require('dotenv').config();

const app = express();
app.use(express.json());

// Custom auth middleware for webhook endpoint using header
const webhookAuth = async (req, res, next) => {
  const secretKey = req.headers['x-secret-key'];
  
  if (!secretKey) {
    return res.status(400).json({
      ok: false,
      code: 'MISSING_SECRET_KEY',
      message: 'The x-secret-key header is required.'
    });
  }
  
  try {
    const result = await db.query(
      'SELECT id FROM accounts WHERE secret_key = $1',
      [secretKey]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({
        ok: false,
        code: 'INVALID_KEY',
        message: 'The provided secret key is invalid or not associated with any account.'
      });
    }

    req.account_id = result.rows[0].id;
    next();
  } catch (err) {
    console.error('❌ Database error during secret_key validation');
    return res.status(500).json({
      ok: false,
      code: 'INTERNAL_ERROR',
      message: 'An internal error occurred while processing the SMS.'
    });
  }
};

// Webhook endpoint with header-based auth
app.post('/webhook/sms', webhookAuth, async (req, res) => {
  const { message_body } = req.body;
  console.log(`[POST /webhook/sms] Processing SMS for account ${req.account_id}`);

  if (!message_body) {
    return res.status(400).json({
      ok: false,
      code: 'MISSING_MESSAGE_BODY',
      message: 'The message_body field is required.'
    });
  }

  try {
    // Generate SMS ID
    const smsId = `sms_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Insert with more details
    const result = await db.query(
      `INSERT INTO sms_messages (id, account_id, message_body, sender, source, processing_status, received_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id, received_at`,
      [smsId, req.account_id, message_body, 'Mobile Automation', 'webhook', 'pending']
    );

    res.json({
      ok: true,
      code: 'SMS_LOGGED',
      id: smsId,
      message: 'SMS successfully received and queued for processing.'
    });
  } catch (err) {
    console.error('❌ Webhook error:', err);
    res.status(500).json({
      ok: false,
      code: 'INTERNAL_ERROR',
      message: 'An internal error occurred while processing the SMS.'
    });
  }
});

// Apply default auth to all other endpoints
app.use(checkAuth);


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook listening on port ${PORT}`);
});
