// routes/jobs.js
const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all jobs
router.get('/', (req, res) => {
  db.query(`SELECT j.*, GROUP_CONCAT(s.skill SEPARATOR ', ') as skills 
            FROM JOB_DETAILS j 
            LEFT JOIN JOB_SKILLS s ON j.job_id = s.job_id 
            GROUP BY j.job_id`, (err, results) => {
    if (err) return res.json({ success: false });
    res.json({ success: true, jobs: results });
  });
});

// GET single job
router.get('/:id', (req, res) => {
  db.query(`SELECT j.*, GROUP_CONCAT(s.skill SEPARATOR ', ') as skills 
            FROM JOB_DETAILS j 
            LEFT JOIN JOB_SKILLS s ON j.job_id = s.job_id 
            WHERE j.job_id = ? GROUP BY j.job_id`, [req.params.id], (err, results) => {
    if (err || results.length === 0) return res.json({ success: false });
    res.json({ success: true, job: results[0] });
  });
});

// APPLY for job
router.post('/apply', (req, res) => {
  if (!req.session.user) return res.json({ success: false, message: 'Not logged in' });
  const { job_id } = req.body;
  const user_id = req.session.user.id;
  const today = new Date().toISOString().split('T')[0];
  db.query('INSERT INTO APPLY_FOR_JOB (user_id, job_id, apply_date, application_status) VALUES (?,?,?,?)',
    [user_id, job_id, today, 'Pending'],
    (err) => {
      if (err) return res.json({ success: false, message: 'Already applied or error' });
      res.json({ success: true, message: 'Applied successfully!' });
    });
});

module.exports = router;