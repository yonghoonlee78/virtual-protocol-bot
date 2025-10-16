// backend/src/routes/blockchain.js
const express = require('express');
const router = express.Router();
const VirtualProtocol = require('../services/blockchain/virtualProtocol');

router.get('/token/:token/balance/:wallet', async (req, res) => {
  try {
    const svc = new VirtualProtocol();
    const { token, wallet } = req.params;
    const balance = await svc.getTokenBalance(token, wallet);
    res.json({ token, wallet, balance });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
