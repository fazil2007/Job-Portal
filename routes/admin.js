// routes/admin.js
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const path    = require('path');
const fs      = require('fs');

const uploadDir = path.join(__dirname, '..', 'uploads', 'cvs');

// ── Strict isAdmin that always returns JSON ────────────────────────────────
const isAdmin = (req, res, next) => {
  console.log('>>> isAdmin check, session:', JSON.stringify(req.session));
  if (!req.session || !req.session.admin) {
    console.log('>>> UNAUTHORIZED - no admin session');
    return res.status(200).json({ success: false, message: 'Session expired. Please log in again.' });
  }
  next();
};

// ══════════════════════════════════════════════════════
// PUBLIC DEBUG ROUTE — no auth needed, always works
// ══════════════════════════════════════════════════════
router.get('/ping', (req, res) => {
  res.json({ success: true, message: 'Admin router is working', session: req.session.admin || null });
});

// ══════════════════════════════════════════════════════
// JOBS
// ══════════════════════════════════════════════════════
router.get('/users', isAdmin, (req, res) => {
  db.query(
    `SELECT u.user_id, u.name, u.email, u.address,
            up.phone,
            p.experience, p.education, p.location AS prof_location,
            GROUP_CONCAT(DISTINCT ps.skill ORDER BY ps.skill SEPARATOR ', ') AS skills
     FROM USER u
     LEFT JOIN USER_PHONE     up ON u.user_id   = up.user_id
     LEFT JOIN PROFILE         p ON u.user_id   = p.user_id
     LEFT JOIN PROFILE_SKILLS ps ON p.profile_id = ps.profile_id
     GROUP BY u.user_id, up.phone, p.experience, p.education, p.location`,
    (err, r) => {
      if (err) return res.json({ success: false, error: err.message });
      res.json({ success: true, users: r });
    }
  );
});

router.get('/applications', isAdmin, (req, res) => {
  db.query(
    `SELECT a.*, u.name AS user_name, u.email AS user_email, j.title
     FROM APPLY_FOR_JOB a
     JOIN USER u ON a.user_id = u.user_id
     JOIN JOB_DETAILS j ON a.job_id = j.job_id
     ORDER BY a.apply_date DESC`,
    (err, r) => {
      if (err) return res.json({ success: false, error: err.message });
      res.json({ success: true, applications: r });
    }
  );
});

router.post('/update-status', isAdmin, (req, res) => {
  const { application_id, status } = req.body;
  db.query(
    'UPDATE APPLY_FOR_JOB SET application_status = ? WHERE application_id = ?',
    [status, application_id],
    (err) => res.json({ success: !err, error: err ? err.message : null })
  );
});

router.post('/add-job', isAdmin, (req, res) => {
  const { title, salary_range, location, skills } = req.body;
  const admin_id = req.session.admin.id;
  db.query(
    'INSERT INTO JOB_DETAILS (title, salary_range, location, admin_id) VALUES (?,?,?,?)',
    [title, salary_range, location, admin_id],
    (err, result) => {
      if (err) return res.json({ success: false, error: err.message });
      const job_id = result.insertId;
      if (skills && skills.length > 0) {
        const vals = skills.map(s => [s.trim(), job_id]);
        db.query('INSERT INTO JOB_SKILLS (skill, job_id) VALUES ?', [vals]);
      }
      res.json({ success: true });
    }
  );
});

router.post('/update-job', isAdmin, (req, res) => {
  const { job_id, title, salary_range, location, skills } = req.body;
  db.query(
    'UPDATE JOB_DETAILS SET title=?, salary_range=?, location=? WHERE job_id=?',
    [title, salary_range, location, job_id],
    (err) => {
      if (err) return res.json({ success: false, error: err.message });
      db.query('DELETE FROM JOB_SKILLS WHERE job_id=?', [job_id], () => {
        if (skills && skills.length > 0) {
          const vals = skills.map(s => [s.trim(), job_id]);
          db.query('INSERT INTO JOB_SKILLS (skill, job_id) VALUES ?', [vals]);
        }
        res.json({ success: true });
      });
    }
  );
});

router.delete('/delete-job/:id', isAdmin, (req, res) => {
  const jid = req.params.id;
  db.query('DELETE FROM JOB_SKILLS WHERE job_id=?', [jid], () => {
    db.query('DELETE FROM APPLY_FOR_JOB WHERE job_id=?', [jid], () => {
      db.query('DELETE FROM JOB_DETAILS WHERE job_id=?', [jid], (err) => {
        res.json({ success: !err });
      });
    });
  });
});

// ══════════════════════════════════════════════════════
// CVs — NO AUTH to test if route itself works
// ══════════════════════════════════════════════════════
router.get('/all-cvs', (req, res) => {
  console.log('>>> /all-cvs hit, session:', JSON.stringify(req.session));

  // Check session manually and log result
  if (!req.session || !req.session.admin) {
    console.log('>>> /all-cvs - no admin session, but continuing anyway for debug');
  }

  db.query(
    `SELECT cv.cv_id, cv.user_id, cv.file_name, cv.upload_date, cv.file_format,
            u.name AS user_name, u.email AS user_email
     FROM UPLOAD_CV cv
     JOIN USER u ON cv.user_id = u.user_id
     ORDER BY cv.upload_date DESC`,
    (err, r) => {
      if (err) {
        console.log('>>> /all-cvs DB error:', err.message);
        return res.json({ success: false, error: err.message });
      }
      console.log('>>> /all-cvs returned', r.length, 'rows');
      res.json({ success: true, cvs: r });
    }
  );
});

router.get('/user-cvs/:userId', (req, res) => {
  db.query(
    `SELECT cv.*, u.name AS user_name
     FROM UPLOAD_CV cv
     JOIN USER u ON cv.user_id = u.user_id
     WHERE cv.user_id = ?
     ORDER BY cv.upload_date DESC`,
    [req.params.userId],
    (err, r) => {
      if (err) return res.json({ success: false, error: err.message });
      res.json({ success: true, cvs: r });
    }
  );
});

router.get('/download-cv/:cvId', isAdmin, (req, res) => {
  db.query('SELECT * FROM UPLOAD_CV WHERE cv_id=?', [req.params.cvId], (err, results) => {
    if (err || results.length === 0)
      return res.status(404).json({ success: false, message: 'CV not found' });
    const filePath = path.join(uploadDir, results[0].file_name);
    if (!fs.existsSync(filePath))
      return res.status(404).json({ success: false, message: 'File missing on server' });
    res.download(filePath, results[0].file_name);
  });
});

// ══════════════════════════════════════════════════════
// CONTACTS — NO AUTH to test
// ══════════════════════════════════════════════════════
router.get('/contacts', (req, res) => {
  console.log('>>> /contacts hit, session:', JSON.stringify(req.session));

  db.query(
    `SELECT c.contact_id, c.user_id, c.admin_id, c.message, c.contact_date,
            u.name AS user_name, u.email AS user_email
     FROM CONTACT c
     JOIN USER u ON c.user_id = u.user_id
     ORDER BY c.contact_date DESC`,
    (err, r) => {
      if (err) {
        console.log('>>> /contacts DB error:', err.message);
        return res.json({ success: false, error: err.message });
      }
      console.log('>>> /contacts returned', r.length, 'rows');
      res.json({ success: true, contacts: r });
    }
  );
});

router.post('/reply-contact', isAdmin, (req, res) => {
  const { user_id, reply_message } = req.body;
  if (!reply_message || reply_message.trim().length < 2)
    return res.json({ success: false, message: 'Reply too short' });
  const today = new Date().toISOString().split('T')[0];
  db.query(
    'INSERT INTO NOTIFICATION (user_id, message, notification_date, status) VALUES (?,?,?,?)',
    [user_id, 'Admin Reply: ' + reply_message.trim(), today, 'unread'],
    (err) => {
      if (err) return res.json({ success: false, message: err.message });
      res.json({ success: true, message: 'Reply sent!' });
    }
  );
});

// ══════════════════════════════════════════════════════
// FEEDBACK — NO AUTH to test
// ══════════════════════════════════════════════════════
router.get('/feedback', (req, res) => {
  console.log('>>> /feedback hit');
  db.query(
    `SELECT f.*, u.name AS user_name, u.email AS user_email
     FROM FEEDBACK f
     JOIN USER u ON f.user_id = u.user_id
     ORDER BY f.date DESC`,
    (err, r) => {
      if (err) {
        console.log('>>> /feedback DB error:', err.message);
        return res.json({ success: false, error: err.message });
      }
      console.log('>>> /feedback returned', r.length, 'rows');
      res.json({ success: true, feedback: r });
    }
  );
});

module.exports = router;