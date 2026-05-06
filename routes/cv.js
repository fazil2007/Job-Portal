// routes/cv.js
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const db      = require('../db');

// ── Upload directory — MUST match admin.js path ────────────────────────────
const uploadDir = path.join(__dirname, '..', 'uploads', 'cvs');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('Created upload dir:', uploadDir);
}
console.log('CV upload directory:', uploadDir);

// ── Multer config ──────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uid  = req.session.user ? req.session.user.id : 'unknown';
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `cv_user${uid}_${Date.now()}${ext}`;
    cb(null, name);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.pdf', '.doc', '.docx'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error('Only PDF, DOC, DOCX files allowed'), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

const isUser = (req, res, next) => {
  if (!req.session.user) return res.json({ success: false, message: 'Not logged in' });
  next();
};

// ── UPLOAD CV ──────────────────────────────────────────────────────────────
router.post('/upload', isUser, (req, res) => {
  upload.single('cv')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE')
        return res.json({ success: false, message: 'File too large. Max 5 MB.' });
      return res.json({ success: false, message: err.message });
    }
    if (err)      return res.json({ success: false, message: err.message });
    if (!req.file) return res.json({ success: false, message: 'No file received' });

    const uid        = req.session.user.id;
    const fileName   = req.file.filename;
    const fileFormat = path.extname(req.file.originalname).replace('.', '').toUpperCase();
    const today      = new Date().toISOString().split('T')[0];

    console.log(`CV upload: user=${uid}, file=${fileName}, format=${fileFormat}`);

    db.query(
      'INSERT INTO UPLOAD_CV (user_id, file_name, upload_date, file_format) VALUES (?,?,?,?)',
      [uid, fileName, today, fileFormat],
      (dbErr, result) => {
        if (dbErr) {
          console.log('CV DB insert error:', dbErr.message);
          fs.unlink(req.file.path, () => {});
          return res.json({ success: false, message: 'Database error: ' + dbErr.message });
        }
        console.log('CV saved to DB, cv_id:', result.insertId);
        res.json({
          success: true,
          message: 'CV uploaded successfully!',
          cv_id: result.insertId,
          fileName,
          fileFormat,
          uploadDate: today
        });
      }
    );
  });
});

// ── GET all CVs for logged-in user ─────────────────────────────────────────
router.get('/my-cvs', isUser, (req, res) => {
  db.query(
    'SELECT * FROM UPLOAD_CV WHERE user_id = ? ORDER BY upload_date DESC',
    [req.session.user.id],
    (err, results) => {
      if (err) return res.json({ success: false, message: err.message });
      console.log(`User ${req.session.user.id} has ${results.length} CVs`);
      res.json({ success: true, cvs: results });
    }
  );
});

// ── DOWNLOAD CV (user) ─────────────────────────────────────────────────────
router.get('/download/:cvId', isUser, (req, res) => {
  db.query(
    'SELECT * FROM UPLOAD_CV WHERE cv_id = ? AND user_id = ?',
    [req.params.cvId, req.session.user.id],
    (err, results) => {
      if (err || results.length === 0)
        return res.status(404).json({ success: false, message: 'CV not found' });
      const filePath = path.join(uploadDir, results[0].file_name);
      if (!fs.existsSync(filePath))
        return res.status(404).json({ success: false, message: 'File missing on server' });
      res.download(filePath, results[0].file_name);
    }
  );
});

// ── DELETE CV ──────────────────────────────────────────────────────────────
router.delete('/delete/:cvId', isUser, (req, res) => {
  db.query(
    'SELECT * FROM UPLOAD_CV WHERE cv_id = ? AND user_id = ?',
    [req.params.cvId, req.session.user.id],
    (err, results) => {
      if (err || results.length === 0)
        return res.json({ success: false, message: 'CV not found' });
      const filePath = path.join(uploadDir, results[0].file_name);
      db.query('DELETE FROM UPLOAD_CV WHERE cv_id = ?', [req.params.cvId], (delErr) => {
        if (delErr) return res.json({ success: false, message: 'Delete failed' });
        fs.unlink(filePath, () => {});
        res.json({ success: true, message: 'CV deleted' });
      });
    }
  );
});

module.exports = router;