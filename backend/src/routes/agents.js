// backend/src/routes/agents.js
const express = require('express');
const router = express.Router();
const Agent = require('../models/Agent');

// GET /api/agents
router.get('/', async (req, res) => {
  try {
    const q = {};
    if (req.query.symbol) q.symbol = req.query.symbol.toUpperCase();
    const agents = await Agent.find(q)
      .sort({ 'priceData.lastUpdated': -1 })
      .limit(200)
      .lean();
    res.json(agents);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/agents/:address
router.get('/:address', async (req, res) => {
  try {
    const agent = await Agent.findOne({
      address: new RegExp(`^${req.params.address}$`, 'i')
    }).lean();
    if (!agent) return res.status(404).json({ error: 'Not found' });
    res.json(agent);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
