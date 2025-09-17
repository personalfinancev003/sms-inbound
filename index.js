const express = require('express');
const checkAuth = require('./middleware/auth');
const db = require('./db');
require('dotenv').config();

const app = express();

// Raw body capture middleware for debugging - must come before express.json()
app.use('/webhook/sms', express.raw({ type: 'application/json' }), (req, res, next) => {
  const rawBody = req.body.toString('utf8');
  req.rawBody = rawBody;
  
  console.log(`[RAW BODY CAPTURE] Raw request body:`, rawBody);
  console.log(`[RAW BODY CAPTURE] Raw body length:`, rawBody.length);
  console.log(`[RAW BODY CAPTURE] Raw body (hex):`, req.body.toString('hex'));
  
  // Parse JSON manually so we have both raw and parsed versions
  try {
    req.body = JSON.parse(rawBody);
    console.log(`[RAW BODY CAPTURE] Successfully parsed JSON`);
  } catch (err) {
    console.log(`[RAW BODY CAPTURE] ❌ JSON parse error:`, err.message);
    req.body = {};
  }
  
  next();
});

// Regular JSON middleware for other routes
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
  let { message_body } = req.body;
  
  // Handle nested macrodroid format
  if (message_body && typeof message_body === 'object' && message_body.message_body) {
    console.log(`[POST /webhook/sms] 🤖 Detected nested macrodroid format`);
    message_body = message_body.message_body;
    console.log(`[POST /webhook/sms] 📱 Extracted inner message:`, message_body);
  }
  
  // Handle Android macrodroid format with base64 encoding
  if (!message_body && req.body.message_body_b64) {
    console.log(`[POST /webhook/sms] 🤖 Detected Android macrodroid format`);
    try {
      if (req.body.encoding === 'base64') {
        // Decode base64 content
        const decodedBytes = Buffer.from(req.body.message_body_b64, 'base64');
        message_body = decodedBytes.toString('utf8');
        console.log(`[POST /webhook/sms] 📱 Decoded base64 message:`, message_body);
      } else {
        // Use as-is if not base64
        message_body = req.body.message_body_b64;
        console.log(`[POST /webhook/sms] 📱 Using raw message_body_b64:`, message_body);
      }
    } catch (err) {
      console.log(`[POST /webhook/sms] ❌ Error decoding base64:`, err.message);
    }
  }
  
  // Comprehensive logging for debugging Android/iOS encoding differences
  console.log(`[POST /webhook/sms] Processing SMS for account ${req.account_id}`);
  console.log(`[POST /webhook/sms] === DEBUGGING RAW REQUEST ===`);
  console.log(`[POST /webhook/sms] Headers:`, JSON.stringify(req.headers, null, 2));
  console.log(`[POST /webhook/sms] Raw Body:`, JSON.stringify(req.body, null, 2));
  console.log(`[POST /webhook/sms] message_body variable type:`, typeof message_body);
  console.log(`[POST /webhook/sms] message_body variable value:`, message_body);
  console.log(`[POST /webhook/sms] req.body.message_body:`, req.body.message_body);
  console.log(`[POST /webhook/sms] Content-Type:`, req.headers['content-type']);
  console.log(`[POST /webhook/sms] User-Agent:`, req.headers['user-agent']);
  console.log(`[POST /webhook/sms] Content-Encoding:`, req.headers['content-encoding']);
  
  if (message_body) {
    console.log(`[POST /webhook/sms] Message Body Length:`, message_body.length);
    console.log(`[POST /webhook/sms] Message Body Type:`, typeof message_body);
    console.log(`[POST /webhook/sms] Message Body (Raw):`, message_body);
    console.log(`[POST /webhook/sms] Message Body (JSON):`, JSON.stringify(message_body));
    
    if (typeof message_body === 'string') {
      console.log(`[POST /webhook/sms] Message Body (Buffer):`, Buffer.from(message_body, 'utf8'));
      console.log(`[POST /webhook/sms] Message Body (Hex):`, Buffer.from(message_body, 'utf8').toString('hex'));
    } else {
      console.log(`[POST /webhook/sms] Message Body (Buffer): [Cannot convert object to Buffer]`);
      console.log(`[POST /webhook/sms] Message Body (Hex): [Cannot convert object to hex]`);
    }
    
    // Check for specific characters that might indicate encoding issues
    const hasArabic = /[\u0600-\u06FF]/.test(message_body);
    const hasRTL = /[\u0590-\u08FF]/.test(message_body);
    console.log(`[POST /webhook/sms] Contains Arabic chars:`, hasArabic);
    console.log(`[POST /webhook/sms] Contains RTL chars:`, hasRTL);
  } else {
    console.log(`[POST /webhook/sms] ⚠️  Message body is missing/undefined/null`);
    console.log(`[POST /webhook/sms] Body keys:`, Object.keys(req.body || {}));
  }
  console.log(`[POST /webhook/sms] === END DEBUG INFO ===`);

  if (!message_body) {
    return res.status(400).json({
      ok: false,
      code: 'MISSING_MESSAGE_BODY',
      message: 'The message_body field is required.'
    });
  }

  try {
    console.log(`[POST /webhook/sms] === INSERTING TO DATABASE ===`);
    console.log(`[POST /webhook/sms] Account ID:`, req.account_id);
    console.log(`[POST /webhook/sms] Message to insert:`, message_body);
    console.log(`[POST /webhook/sms] Message length:`, message_body.length);
    
    // Insert only required fields - everything else is auto-populated
    const result = await db.query(
      `INSERT INTO sms_messages (account_id, message_body, sender)
       VALUES ($1, $2, $3)
       RETURNING id, received_at, message_body`,
      [req.account_id, message_body, 'Mobile Automation']
    );

    const insertedSms = result.rows[0];
    
    console.log(`[POST /webhook/sms] === DATABASE INSERT SUCCESS ===`);
    console.log(`[POST /webhook/sms] Inserted SMS ID:`, insertedSms.id);
    console.log(`[POST /webhook/sms] Received at:`, insertedSms.received_at);
    console.log(`[POST /webhook/sms] Stored message body:`, insertedSms.message_body);
    console.log(`[POST /webhook/sms] Stored message length:`, insertedSms.message_body?.length);
    console.log(`[POST /webhook/sms] Message matches input:`, insertedSms.message_body === message_body);

    res.json({
      ok: true,
      code: 'SMS_LOGGED',
      id: insertedSms.id,
      message: 'SMS successfully received and queued for processing.'
    });
  } catch (err) {
    console.error('❌ Webhook error:', err);
    console.error('❌ Error details:', err.message);
    console.error('❌ Error stack:', err.stack);
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
