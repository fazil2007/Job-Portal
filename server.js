// server.js
const express    = require('express');
const session    = require('express-session');
const cors       = require('cors');
const path       = require('path');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── CORS ───────────────────────────────────────────────────────────────────
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));

// ── Static files ───────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Session ────────────────────────────────────────────────────────────────
app.use(session({
  key:               'jobsphere_sid',
  secret:            'jobportal_secret_2024',
  resave:            true,
  saveUninitialized: false,
  cookie: {
    maxAge:   86400000,   // 24 hours
    httpOnly: true,
    secure:   false,      // must be false for localhost http
    sameSite: 'lax'
  }
}));

// ── Log every request for debugging ───────────────────────────────────────
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path} | session.admin: ${req.session.admin ? req.session.admin.email : 'none'} | session.user: ${req.session.user ? req.session.user.email : 'none'}`);
  next();
});

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/auth',  require('./routes/auth'));
app.use('/user',  require('./routes/user'));
app.use('/admin', require('./routes/admin'));
app.use('/jobs',  require('./routes/jobs'));
app.use('/cv',    require('./routes/cv'));

// ── 404 catch — always return JSON not HTML ────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.path}` });
});

// ── Error handler — always return JSON not HTML ────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ success: false, message: 'Server error: ' + err.message });
});

app.listen(8080, () => {
  console.log('🚀 Server running at http://localhost:8080');
  console.log('📁 Routes: /auth /user /admin /jobs /cv');
});