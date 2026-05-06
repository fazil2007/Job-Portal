// routes/auth.js
const express = require('express');
const router  = express.Router();
const db      = require('../db');

// USER REGISTER — saves plain text password
router.post('/register', (req, res) => {
  const { name, email, phone, password, address } = req.body;

  if (!name || !email || !password)
    return res.json({ success: false, message: 'Name, email and password are required' });

  db.query(
    'INSERT INTO USER (name, email, password, address) VALUES (?,?,?,?)',
    [name.trim(), email.trim().toLowerCase(), password.trim(), address || ''],
    (err, result) => {
      if (err) {
        console.log('Register error:', err.message);
        return res.json({ success: false, message: 'Email already exists' });
      }
      if (phone) {
        db.query('INSERT INTO USER_PHONE (phone, user_id) VALUES (?,?)', [phone, result.insertId]);
      }
      res.json({ success: true, message: 'Registration successful! Please log in.' });
    }
  );
});

// USER LOGIN — plain text comparison
router.post('/login', (req, res) => {
  const email    = (req.body.email    || '').trim().toLowerCase();
  const password = (req.body.password || '').trim();

  console.log('\n--- USER LOGIN ---');
  console.log('Email:', email);

  if (!email || !password)
    return res.json({ success: false, message: 'Email and password required' });

  db.query('SELECT * FROM USER WHERE LOWER(email) = ?', [email], (err, results) => {
    if (err) {
      console.log('DB Error:', err.message);
      return res.json({ success: false, message: 'Database error' });
    }

    console.log('Users found:', results.length);

    if (results.length === 0)
      return res.json({ success: false, message: 'No account found with this email' });

    const user = results[0];

    console.log('Password in DB :', user.password);
    console.log('Password entered:', password);

    // Plain text comparison
    if (password !== user.password)
      return res.json({ success: false, message: 'Incorrect password' });

    req.session.user = {
      id:    user.user_id,
      name:  user.name,
      email: user.email,
      role:  'user'
    };

    req.session.save((err) => {
      if (err) {
        console.log('Session error:', err);
        return res.json({ success: false, message: 'Session error' });
      }
      console.log('User login success:', user.name);
      res.json({ success: true, role: 'user', name: user.name });
    });
  });
});

// ADMIN LOGIN — plain text comparison
router.post('/admin-login', (req, res) => {
  const email    = (req.body.email    || '').trim().toLowerCase();
  const password = (req.body.password || '').trim();

  console.log('\n--- ADMIN LOGIN ---');
  console.log('Email:', email);

  if (!email || !password)
    return res.json({ success: false, message: 'Email and password required' });

  db.query('SELECT * FROM ADMIN WHERE LOWER(email) = ?', [email], (err, results) => {
    if (err) {
      console.log('DB Error:', err.message);
      return res.json({ success: false, message: 'Database error' });
    }

    console.log('Admins found:', results.length);

    if (results.length === 0)
      return res.json({ success: false, message: 'No admin found with this email' });

    const admin = results[0];

    console.log('Password in DB :', admin.password);
    console.log('Password entered:', password);

    // Plain text comparison
    if (password !== admin.password)
      return res.json({ success: false, message: 'Incorrect password' });

    req.session.admin = {
      id:    admin.admin_id,
      name:  admin.name,
      email: admin.email,
      role:  'admin'
    };

    req.session.save((err) => {
      if (err) {
        console.log('Session save error:', err);
        return res.json({ success: false, message: 'Session error' });
      }
      console.log('Admin login success:', admin.name);
      res.json({ success: true, role: 'admin', name: admin.name });
    });
  });
});

// LOGOUT
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// SESSION CHECK
router.get('/session', (req, res) => {
  if (req.session.user)  return res.json({ loggedIn: true, role: 'user',  user: req.session.user  });
  if (req.session.admin) return res.json({ loggedIn: true, role: 'admin', user: req.session.admin });
  res.json({ loggedIn: false });
});

module.exports = router;