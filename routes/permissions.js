const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

const PAGES = ['overview', 'pipeline', 'leads', 'reports', 'notifications'];
const ROLES = ['area_manager', 'sr_area_manager', 'state_head', 'regional_head', 'vp_sales'];

// GET /api/permissions — allowed pages for current user's role
router.get('/', async (req, res) => {
  if (req.user.role === 'admin') {
    return res.json(PAGES); // admin always has everything
  }
  try {
    const { data, error } = await supabase
      .from('permissions')
      .select('page, allowed')
      .eq('role', req.user.role);
    if (error) return res.status(400).json({ error: error.message });
    const allowed = data.filter((p) => p.allowed).map((p) => p.page);
    res.json(allowed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/permissions/all — full matrix (admin only)
router.get('/all', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    const { data, error } = await supabase
      .from('permissions')
      .select('role, page, allowed');
    if (error) return res.status(400).json({ error: error.message });

    // Build matrix: { role: { page: allowed } }
    const matrix = {};
    ROLES.forEach((role) => {
      matrix[role] = {};
      PAGES.forEach((page) => { matrix[role][page] = false; });
    });
    data.forEach(({ role, page, allowed }) => {
      if (matrix[role]) matrix[role][page] = allowed;
    });
    res.json(matrix);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/permissions — toggle a single permission (admin only)
router.put('/', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { role, page, allowed } = req.body;
  if (!ROLES.includes(role) || !PAGES.includes(page)) {
    return res.status(400).json({ error: 'Invalid role or page' });
  }
  try {
    const { data, error } = await supabase
      .from('permissions')
      .upsert({ role, page, allowed }, { onConflict: 'role,page' })
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
