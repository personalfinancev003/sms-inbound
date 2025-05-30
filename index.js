const express = require('express');
const db = require('./db');
require('dotenv').config();

const app = express();
app.use(express.json());

app.post('/webhook/sms', async (req, res) => {
  const { message_body, sender, secret_key } = req.body;
  console.log('Incoming payload:', { message_body, sender, secret_key });

  if (!message_body || !secret_key) {
    console.log('❌ Missing required fields');
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const result = await db.query(
      'SELECT id FROM accounts WHERE secret_key = $1',
      [secret_key]
    );

    if (result.rowCount === 0) {
      console.log('❌ Invalid secret key');
      return res.status(401).json({ error: 'Invalid secret key' });
    }

    const accountId = result.rows[0].id;

    await db.query(
      `INSERT INTO sms_messages (account_id, message_body, sender)
       VALUES ($1, $2, $3)`,
      [accountId, message_body, sender]
    );

    console.log('✅ Message inserted');
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Webhook error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook listening on port ${PORT}`);
});
