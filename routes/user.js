// routes/user.js
const express = require('express');
const router  = express.Router();
const db      = require('../db');

const isUser = (req, res, next) => {
  if (!req.session.user) return res.json({ success: false, message: 'Not logged in' });
  next();
};

// ── GET full profile ───────────────────────────────────────────────────────
router.get('/profile', isUser, (req, res) => {
  const uid = req.session.user.id;
  db.query(
    `SELECT u.user_id, u.name, u.email, u.address,
            p.profile_id, p.experience, p.education, p.location AS prof_location,
            GROUP_CONCAT(DISTINCT ps.skill ORDER BY ps.skill SEPARATOR ',') AS skills,
            up.phone
     FROM USER u
     LEFT JOIN PROFILE        p  ON u.user_id   = p.user_id
     LEFT JOIN PROFILE_SKILLS ps ON p.profile_id = ps.profile_id
     LEFT JOIN USER_PHONE      up ON u.user_id   = up.user_id
     WHERE u.user_id = ?
     GROUP BY u.user_id, p.profile_id, up.phone`,
    [uid],
    (err, results) => {
      if (err) { console.log('Profile fetch err:', err.message); return res.json({ success: false }); }
      res.json({ success: true, profile: results[0] || null });
    }
  );
});

// ── UPDATE profile (USER + PROFILE + PROFILE_SKILLS + USER_PHONE) ──────────
router.post('/update-profile', isUser, (req, res) => {
  const uid = req.session.user.id;
  const { name, address, phone, experience, education, location, skills } = req.body;

  // 1. Update USER table
  db.query('UPDATE USER SET name = ?, address = ? WHERE user_id = ?', [name, address, uid], (err) => {
    if (err) { console.log('USER update err:', err.message); return res.json({ success: false, message: 'Failed to update user info' }); }

    // 2. Upsert USER_PHONE
    if (phone) {
      db.query('SELECT phone FROM USER_PHONE WHERE user_id = ?', [uid], (err, rows) => {
        if (rows && rows.length > 0) {
          db.query('UPDATE USER_PHONE SET phone = ? WHERE user_id = ?', [phone, uid]);
        } else {
          db.query('INSERT INTO USER_PHONE (phone, user_id) VALUES (?, ?)', [phone, uid], (err) => {
            if (err) console.log('Phone upsert err:', err.message);
          });
        }
      });
    }

    // 3. Upsert PROFILE table
    db.query('SELECT profile_id FROM PROFILE WHERE user_id = ?', [uid], (err, rows) => {
      if (err) { console.log('Profile select err:', err.message); return res.json({ success: false, message: 'DB error' }); }

      const exp  = parseInt(experience) || 0;
      const edu  = education || '';
      const loc  = location  || '';

      const afterProfileUpsert = (profile_id) => {
        // 4. Replace PROFILE_SKILLS
        db.query('DELETE FROM PROFILE_SKILLS WHERE profile_id = ?', [profile_id], (err) => {
          if (err) console.log('Skills delete err:', err.message);

          const skillList = Array.isArray(skills)
            ? skills.filter(Boolean)
            : (skills || '').split(',').map(s => s.trim()).filter(Boolean);

          if (skillList.length > 0) {
            const vals = skillList.map(s => [s, profile_id]);
            db.query('INSERT INTO PROFILE_SKILLS (skill, profile_id) VALUES ?', [vals], (err) => {
              if (err) console.log('Skills insert err:', err.message);
            });
          }
          res.json({ success: true, message: 'Profile saved successfully!' });
        });
      };

      if (rows.length > 0) {
        const pid = rows[0].profile_id;
        db.query(
          'UPDATE PROFILE SET experience = ?, education = ?, location = ? WHERE profile_id = ?',
          [exp, edu, loc, pid],
          (err) => {
            if (err) { console.log('Profile update err:', err.message); return res.json({ success: false, message: 'Failed to update profile' }); }
            afterProfileUpsert(pid);
          }
        );
      } else {
        db.query(
          'INSERT INTO PROFILE (user_id, experience, education, location) VALUES (?, ?, ?, ?)',
          [uid, exp, edu, loc],
          (err, result) => {
            if (err) { console.log('Profile insert err:', err.message); return res.json({ success: false, message: 'Failed to create profile' }); }
            afterProfileUpsert(result.insertId);
          }
        );
      }
    });
  });
});

// ── GET user applications ──────────────────────────────────────────────────
router.get('/applications', isUser, (req, res) => {
  db.query(
    `SELECT a.*, j.title, j.location, j.salary_range
     FROM APPLY_FOR_JOB a
     JOIN JOB_DETAILS j ON a.job_id = j.job_id
     WHERE a.user_id = ?
     ORDER BY a.apply_date DESC`,
    [req.session.user.id],
    (err, results) => {
      if (err) return res.json({ success: false });
      res.json({ success: true, applications: results });
    }
  );
});

// ── CONTACT US — send message to admin ────────────────────────────────────
router.post('/contact', isUser, (req, res) => {
  const uid     = req.session.user.id;
  const { message, admin_id } = req.body;

  if (!message || message.trim().length < 5) {
    return res.json({ success: false, message: 'Message is too short' });
  }

  // Use provided admin_id or fall back to the first admin in DB
  const sendContact = (aid) => {
    const today = new Date().toISOString().split('T')[0];
    db.query(
      'INSERT INTO CONTACT (user_id, admin_id, message, contact_date) VALUES (?, ?, ?, ?)',
      [uid, aid, message.trim(), today],
      (err) => {
        if (err) { console.log('Contact err:', err.message); return res.json({ success: false, message: 'Failed to send message' }); }
        res.json({ success: true, message: 'Message sent successfully! We will get back to you soon.' });
      }
    );
  };

  if (admin_id) {
    sendContact(admin_id);
  } else {
    db.query('SELECT admin_id FROM ADMIN LIMIT 1', (err, rows) => {
      if (err || rows.length === 0) return res.json({ success: false, message: 'No admin available' });
      sendContact(rows[0].admin_id);
    });
  }
});

// ── GET contact history for user ───────────────────────────────────────────
router.get('/contact-history', isUser, (req, res) => {
  db.query(
    `SELECT c.*, a.name AS admin_name
     FROM CONTACT c
     JOIN ADMIN a ON c.admin_id = a.admin_id
     WHERE c.user_id = ?
     ORDER BY c.contact_date DESC`,
    [req.session.user.id],
    (err, results) => {
      if (err) return res.json({ success: false });
      res.json({ success: true, contacts: results });
    }
  );
});

module.exports = router;