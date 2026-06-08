const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// GET activities, optionally filtered by lead_id
router.get('/', async (req, res) => {
  const { lead_id } = req.query;
  try {
    let query = supabase
      .from('activities')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (lead_id) query = query.eq('lead_id', lead_id);
    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
