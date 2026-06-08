const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabaseClient');
const authMiddleware = require('../middleware/auth');

// Register
router.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  try {
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existing) return res.status(400).json({ error: 'Email already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const VALID_ROLES = ['admin', 'area_manager', 'sr_area_manager', 'state_head', 'regional_head', 'vp_sales'];
    const safeRole = VALID_ROLES.includes(role) ? role : 'area_manager';
    // Admin accounts are pre-created — public registration always starts as pending
    const initialStatus = safeRole === 'admin' ? 'active' : 'pending';

    const { data, error } = await supabase
      .from('users')
      .insert([{ name, email, password: hashedPassword, role: safeRole, status: initialStatus }])
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    if (initialStatus === 'pending') {
      // Notify all admin users
      const { data: admins } = await supabase
        .from('users')
        .select('id')
        .eq('role', 'admin')
        .eq('status', 'active');

      if (admins && admins.length > 0) {
        const ROLE_LABELS = {
          area_manager: 'Area Manager', sr_area_manager: 'Sr. Area Manager',
          state_head: 'State Head', regional_head: 'Regional Head', vp_sales: 'VP Sales',
        };
        const notifications = admins.map((admin) => ({
          user_id: admin.id,
          title: 'New User Registration',
          message: `${name} (${ROLE_LABELS[safeRole] || safeRole}) has requested access and is awaiting approval.`,
          type: 'info',
        }));
        await supabase.from('notifications').insert(notifications);
      }

      return res.json({ pending: true, message: 'Registration successful. Your account is awaiting admin approval.' });
    }

    // Admin self-registration (rare) — issue token immediately
    const token = jwt.sign(
      { id: data.id, email: data.email, role: data.role, name: data.name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: { id: data.id, name: data.name, email: data.email, role: data.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) return res.status(400).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    if (user.status === 'pending') {
      return res.status(403).json({ error: 'Your account is awaiting admin approval. You will be notified once approved.' });
    }
    if (user.status === 'rejected') {
      return res.status(403).json({ error: 'Your account has been rejected. Please contact your administrator.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET current user profile
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, role, created_at')
      .eq('id', req.user.id)
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update profile (name / email)
router.put('/profile', authMiddleware, async (req, res) => {
  const { name, email } = req.body;
  try {
    if (email && email !== req.user.email) {
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .neq('id', req.user.id)
        .single();
      if (existing) return res.status(400).json({ error: 'Email already in use by another account' });
    }

    const { data, error } = await supabase
      .from('users')
      .update({ name, email })
      .eq('id', req.user.id)
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });

    const token = jwt.sign(
      { id: data.id, email: data.email, role: data.role, name: data.name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: data.id, name: data.name, email: data.email, role: data.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT change password
router.put('/password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  try {
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.user.id)
      .single();

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Current password is incorrect' });

    const hashed = await bcrypt.hash(newPassword, 10);
    const { error } = await supabase
      .from('users')
      .update({ password: hashed })
      .eq('id', req.user.id);
    if (error) return res.status(400).json({ error: error.message });

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
