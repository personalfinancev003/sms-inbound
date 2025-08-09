const express = require('express');
const checkAuth = require('./middleware/auth');
const db = require('./db');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(checkAuth); // 👈 protect all endpoints


app.post('/webhook/sms', async (req, res) => {
  const { message_body, sender } = req.body;
  // Do not log message content

  if (!message_body) {
    return res.status(400).json({ error: 'Missing required field: message_body' });
  }

  try {
    // Use account_id from middleware (already validated)
    await db.query(
      `INSERT INTO sms_messages (account_id, message_body, sender)
       VALUES ($1, $2, $3)`,
      [req.account_id, message_body, sender]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Webhook error');
    res.status(500).json({ error: 'Internal server error' });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook listening on port ${PORT}`);
});
