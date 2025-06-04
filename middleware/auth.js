// middleware/auth.js
require('dotenv').config();

module.exports = function checkAuth(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(403).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split(' ')[1];

  if (token !== process.env.AUTH_SECRET) {
    return res.status(403).json({ error: 'Unauthorized: Invalid token' });
  }

  next();
};
