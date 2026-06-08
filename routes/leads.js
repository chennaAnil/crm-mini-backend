const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

const STAGE_LABELS = {
  lead_entry: 'Lead Entry',
  opportunity: 'Opportunity',
  demo: 'Demo',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  contract: 'Contract',
  payment: 'Payment Collection',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
};

async function createNotification(userId, title, message, type = 'info', leadId = null) {
  await supabase.from('notifications').insert([{ user_id: userId, title, message, type, lead_id: leadId }]);
}

async function createActivity(leadId, userId, action, fromStage = null, toStage = null, notes = null) {
  await supabase.from('activities').insert([{ lead_id: leadId, user_id: userId, action, from_stage: fromStage, to_stage: toStage, notes }]);
}

// Roles that see only their own leads
const OWN_LEADS_ROLES = ['area_manager', 'sr_area_manager'];
// Roles that see all leads
const ALL_LEADS_ROLES = ['admin', 'vp_sales', 'regional_head', 'state_head'];

// GET leads — filtered by role
router.get('/', async (req, res) => {
  try {
    let query = supabase.from('leads').select('*').order('created_at', { ascending: false });

    if (OWN_LEADS_ROLES.includes(req.user.role)) {
      query = query.eq('assigned_to', req.user.id);
    }
    // ALL_LEADS_ROLES get no filter — see everything

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create lead
router.post('/', async (req, res) => {
  const { name, email, phone, status, source, value, pipeline_stage, notes, assigned_to } = req.body;
  try {
    // Area managers always own their leads
    const effectiveAssignedTo = OWN_LEADS_ROLES.includes(req.user.role)
      ? req.user.id
      : (assigned_to || null);

    const { data, error } = await supabase
      .from('leads')
      .insert([{ name, email, phone, status, source, value, pipeline_stage: pipeline_stage || 'lead_entry', notes, assigned_to: effectiveAssignedTo }])
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });

    await createNotification(req.user.id, 'New Lead Created', `${name} has been added to the pipeline.`, 'info', data.id);
    await createActivity(data.id, req.user.id, 'Lead created', null, data.pipeline_stage, notes);

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update lead
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, status, source, value, pipeline_stage, notes, assigned_to } = req.body;
  try {
    const { data: current } = await supabase.from('leads').select('pipeline_stage, name').eq('id', id).single();

    const { data, error } = await supabase
      .from('leads')
      .update({ name, email, phone, status, source, value, pipeline_stage, notes, assigned_to, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });

    if (current && pipeline_stage && current.pipeline_stage !== pipeline_stage) {
      await createActivity(id, req.user.id, 'Stage changed', current.pipeline_stage, pipeline_stage);
      await createNotification(
        req.user.id,
        'Lead Stage Updated',
        `${data.name} moved to ${STAGE_LABELS[pipeline_stage] || pipeline_stage}`,
        'success',
        id
      );
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE lead
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    let query = supabase.from('leads').delete().eq('id', id);
    // Restrict area managers to only delete their own leads
    if (OWN_LEADS_ROLES.includes(req.user.role)) {
      query = query.eq('assigned_to', req.user.id);
    }
    const { error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: 'Lead deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
