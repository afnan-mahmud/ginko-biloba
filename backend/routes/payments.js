const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { Payment } = require('../models');

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Unauthorized' });
  try {
    req.admin = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

// GET /api/payments/steadfast-balance — fetch live balance from Steadfast API
router.get('/steadfast-balance', authMiddleware, async (req, res) => {
  try {
    const apiKey    = process.env.STEADFAST_API_KEY;
    const apiSecret = process.env.STEADFAST_API_SECRET;
    if (!apiKey || !apiSecret) {
      return res.status(400).json({ success: false, message: 'Steadfast credentials not configured' });
    }
    const baseUrl = (process.env.STEADFAST_API_URL || 'https://portal.packzy.com/api/v1').replace(/\/$/, '');
    const response = await axios.get(`${baseUrl}/get_balance`, {
      headers: { 'Api-Key': apiKey, 'Secret-Key': apiSecret, 'Content-Type': 'application/json' }
    });
    res.json({ success: true, data: response.data });
  } catch (e) {
    const msg = e.response?.data || e.message;
    res.status(500).json({ success: false, message: 'Steadfast API error', error: msg });
  }
});

// GET /api/payments — list all payments (optionally filtered by date range)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { from, to } = req.query;
    const query = {};
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = from;
      if (to)   query.date.$lte = to;
    }
    const payments = await Payment.find(query).sort({ date: -1, createdAt: -1 });

    const total = payments.reduce((s, p) => s + p.amount, 0);
    res.json({ success: true, payments, total });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/payments — add a payment entry
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { date, amount, note } = req.body;
    if (!date || !amount) return res.status(400).json({ success: false, message: 'date and amount are required' });
    const payment = await Payment.create({ date, amount: Number(amount), note: note || '' });
    res.json({ success: true, payment });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// PATCH /api/payments/:id — update a payment
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const { date, amount, note } = req.body;
    const update = {};
    if (date !== undefined)   update.date   = date;
    if (amount !== undefined) update.amount = Number(amount);
    if (note !== undefined)   update.note   = note;
    update.updatedAt = new Date();

    const payment = await Payment.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!payment) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, payment });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// DELETE /api/payments/:id — delete a payment
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await Payment.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
