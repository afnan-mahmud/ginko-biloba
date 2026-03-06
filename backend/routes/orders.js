const express = require('express');
const router = express.Router();
const axios = require('axios');
const { Order, Payment } = require('../models');
const { sendCapiEvent } = require('../controllers/meta');
const authMiddleware = require('../middleware/auth');
const crypto = require('crypto');

const PRODUCTS = {
  'ginko-30': { name: 'Ginko Biloba - ৩০ পিস', price: 790 },
  'ginko-60': { name: 'Ginko Biloba - ৬০ পিস (প্ল্যাটিনাম প্যাক)', price: 1250 }
};

// POST /api/orders/initiate-checkout
// Called when user fills form and clicks "Order Korun" — sends InitiateCheckout to Meta
router.post('/initiate-checkout', async (req, res) => {
  try {
    const { name, phone, address, district, products, fbp, fbc, eventSourceUrl, clientUserAgent, eventId } = req.body;
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

    await sendCapiEvent({
      eventName: 'InitiateCheckout',
      eventId,
      userData: {
        name, phone,
        clientIpAddress: clientIp,
        clientUserAgent,
        fbp, fbc,
        externalId: phone
      },
      customData: {
        currency: 'BDT',
        num_items: products?.reduce((a, p) => a + p.qty, 0) || 1
      },
      eventSourceUrl
    });

    res.json({ success: true });
  } catch (err) {
    console.error('InitiateCheckout error:', err);
    res.status(500).json({ success: false });
  }
});

// POST /api/orders/place
// Called when user submits the order form — stores order + sends no Purchase yet
router.post('/place', async (req, res) => {
  try {
    const {
      name, phone, address, district,
      selectedProducts, // [{ id: 'ginko-30', qty: 1 }]
      fbp, fbc, eventSourceUrl, clientUserAgent
    } = req.body;

    if (!name || !phone || !address) {
      return res.status(400).json({ success: false, message: 'নাম, ফোন ও ঠিকানা আবশ্যক' });
    }

    const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

    // Build products array
    const orderProducts = [];
    let subtotalSum = 0;
    for (const item of (selectedProducts || [{ id: 'ginko-30', qty: 1 }])) {
      const p = PRODUCTS[item.id];
      if (!p) continue;
      const subtotal = p.price * item.qty;
      orderProducts.push({ name: p.name, quantity: item.qty, price: p.price, subtotal });
      subtotalSum += subtotal;
    }
    if (orderProducts.length === 0) {
      orderProducts.push({ name: PRODUCTS['ginko-30'].name, quantity: 1, price: 790, subtotal: 790 });
      subtotalSum = 790;
    }

    const shippingCharge = district && district.toLowerCase().includes('dhaka') ? 80 : 130;
    const total = subtotalSum + shippingCharge;

    const externalId = crypto.randomUUID();

    const order = new Order({
      customer: { name, phone, address, district: district || '' },
      products: orderProducts,
      shippingCharge,
      total,
      metaData: {
        clientIpAddress: clientIp,
        clientUserAgent,
        fbp: fbp || null,
        fbc: fbc || null,
        eventSourceUrl: eventSourceUrl || '',
        externalId
      }
    });

    await order.save();

    res.json({ success: true, orderId: order.orderId, total });
  } catch (err) {
    console.error('Place order error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ───────────── ADMIN ROUTES ─────────────

// GET /api/orders — all orders (admin)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = status ? { status } : {};
    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const total = await Order.countDocuments(filter);
    res.json({ success: true, orders, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// GET /api/orders/stats (admin)
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const total = await Order.countDocuments();
    const pending = await Order.countDocuments({ status: 'pending' });
    const confirmed = await Order.countDocuments({ status: 'confirmed' });
    const cancelled = await Order.countDocuments({ status: 'cancelled' });
    const revenue = await Order.aggregate([
      { $match: { status: 'confirmed' } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);
    res.json({
      success: true,
      stats: {
        total, pending, confirmed, cancelled,
        revenue: revenue[0]?.total || 0
      }
    });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// GET /api/orders/accounts-summary — accounts summary (admin)
router.get('/accounts-summary', authMiddleware, async (req, res) => {
  try {
    const { from, to } = req.query;
    const dateFilter = { status: 'confirmed' };
    if (from || to) {
      dateFilter.createdAt = {};
      if (from) dateFilter.createdAt.$gte = new Date(from + 'T00:00:00');
      if (to)   dateFilter.createdAt.$lte = new Date(to + 'T23:59:59.999');
    }

    const confirmedOrders = await Order.find(dateFilter).lean();

    const row1Total = confirmedOrders.reduce((s, o) => s + (o.total || 0), 0);
    const row1Delivery = confirmedOrders.reduce((s, o) => s + (o.shippingCharge || 0), 0);

    const pendingDelivery = confirmedOrders.filter(o => {
      const ds = (o.steadfast?.delivery_status || '').toLowerCase();
      return !ds || (!ds.includes('deliver') && ds !== 'cancelled');
    });
    const row2Total = pendingDelivery.reduce((s, o) => s + (o.total || 0), 0);
    const row2Delivery = pendingDelivery.reduce((s, o) => s + (o.shippingCharge || 0), 0);

    const payDateFilter = {};
    if (from || to) {
      payDateFilter.date = {};
      if (from) payDateFilter.date.$gte = from;
      if (to)   payDateFilter.date.$lte = to;
    }
    const payments = await Payment.find(payDateFilter).lean();
    const totalReceived = payments.reduce((s, p) => s + (p.amount || 0), 0);

    res.json({
      success: true,
      row1: { totalAmount: row1Total, deliveryCharge: row1Delivery, netAmount: row1Total - row1Delivery },
      row2: { totalAmount: row2Total, deliveryCharge: row2Delivery, netAmount: row2Total - row2Delivery },
      row3: { totalReceived, remaining: (row1Total - row1Delivery) - totalReceived }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/orders/:id/status — update status (admin)
router.patch('/:id/status', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'confirmed', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const prevStatus = order.status;
    order.status = status;

    // If status changed to confirmed AND purchase event not yet sent → send Purchase to Meta CAPI
    if (status === 'confirmed' && !order.metaData.purchaseEventSent) {
      const result = await sendCapiEvent({
        eventName: 'Purchase',
        userData: {
          name: order.customer.name,
          phone: order.customer.phone,
          clientIpAddress: order.metaData.clientIpAddress,
          clientUserAgent: order.metaData.clientUserAgent,
          fbp: order.metaData.fbp,
          fbc: order.metaData.fbc,
          externalId: order.metaData.externalId,
          eventSourceUrl: order.metaData.eventSourceUrl
        },
        customData: {
          currency: 'BDT',
          value: order.total,
          order_id: order.orderId,
          contents: order.products.map(p => ({
            id: p.name,
            quantity: p.quantity,
            item_price: p.price
          }))
        },
        eventSourceUrl: order.metaData.eventSourceUrl
      });

      if (result) {
        order.metaData.purchaseEventSent = true;
      }
    }

    await order.save();
    res.json({ success: true, order });
  } catch (err) {
    console.error('Update status error:', err);
    res.status(500).json({ success: false });
  }
});

// GET /api/orders/:id (admin)
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false });
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// POST /api/orders/:id/steadfast — send order to Steadfast courier (admin)
router.post('/:id/steadfast', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (order.status !== 'confirmed') {
      return res.status(400).json({ success: false, message: 'Order must be confirmed before sending to Steadfast' });
    }

    if (order.steadfast?.consignment_id) {
      return res.status(400).json({ success: false, message: 'Already sent to Steadfast', steadfast: order.steadfast });
    }

    const baseUrl = (process.env.STEADFAST_API_URL || 'https://portal.packzy.com/api/v1').replace(/\/$/, '');
    const apiKey = process.env.STEADFAST_API_KEY;
    const apiSecret = process.env.STEADFAST_API_SECRET;
    if (!apiKey || !apiSecret) {
      return res.status(500).json({ success: false, message: 'Steadfast API credentials not configured' });
    }

    const response = await axios.post(
      `${baseUrl}/create_order`,
      {
        invoice: order.orderId,
        recipient_name: order.customer.name,
        recipient_phone: order.customer.phone,
        recipient_address: order.customer.address,
        cod_amount: order.total,
        note: `District: ${order.customer.district || 'N/A'}`
      },
      {
        headers: {
          'Api-Key': apiKey,
          'Secret-Key': apiSecret,
          'Content-Type': 'application/json'
        }
      }
    );

    const sf = response.data?.consignment;
    order.steadfast = {
      consignment_id: sf?.consignment_id?.toString() || null,
      tracking_code: sf?.tracking_code || null,
      status: sf?.status || 'in_review',
      delivery_status: sf?.delivery_status || sf?.status || null,
      delivery_fee: sf?.delivery_fee != null ? Number(sf.delivery_fee) : null,
      statusUpdatedAt: new Date(),
      sentAt: new Date()
    };
    await order.save();

    res.json({ success: true, steadfast: order.steadfast });
  } catch (err) {
    const errMsg = err.response?.data?.errors || err.response?.data?.message || err.message;
    console.error('Steadfast error:', errMsg);
    res.status(500).json({ success: false, message: 'Steadfast API error', error: errMsg });
  }
});

// GET /api/orders/:id/steadfast-status — refresh delivery status & fee from Steadfast
router.get('/:id/steadfast-status', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const cid = order.steadfast?.consignment_id;
    if (!cid) return res.status(400).json({ success: false, message: 'Order not sent to Steadfast yet' });

    const baseUrl = (process.env.STEADFAST_API_URL || 'https://portal.packzy.com/api/v1').replace(/\/$/, '');
    const apiKey = process.env.STEADFAST_API_KEY;
    const apiSecret = process.env.STEADFAST_API_SECRET;

    const response = await axios.get(`${baseUrl}/status_by_cid/${cid}`, {
      headers: { 'Api-Key': apiKey, 'Secret-Key': apiSecret, 'Content-Type': 'application/json' }
    });

    const sf = response.data?.consignment || response.data;
    const delivery_status = sf?.delivery_status || sf?.status || null;
    const delivery_fee    = sf?.delivery_fee != null ? Number(sf.delivery_fee) : order.steadfast.delivery_fee;

    order.steadfast.delivery_status  = delivery_status;
    order.steadfast.delivery_fee     = delivery_fee;
    order.steadfast.statusUpdatedAt  = new Date();
    await order.save();

    res.json({ success: true, delivery_status, delivery_fee, statusUpdatedAt: order.steadfast.statusUpdatedAt });
  } catch (err) {
    const errMsg = err.response?.data || err.message;
    console.error('Steadfast status error:', errMsg);
    res.status(500).json({ success: false, message: 'Steadfast API error', error: errMsg });
  }
});

// PATCH /api/orders/:id/payment-received — toggle payment received status
router.patch('/:id/payment-received', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (!order.steadfast?.consignment_id) {
      return res.status(400).json({ success: false, message: 'Order not sent to Steadfast' });
    }

    const ds = (order.steadfast.delivery_status || '').toLowerCase();
    const isDelivered = ds.includes('deliver') && !ds.includes('partial');
    if (!isDelivered) {
      return res.status(400).json({ success: false, message: 'Payment can only be marked after delivery' });
    }

    const { payment_received } = req.body;
    order.steadfast.payment_received    = !!payment_received;
    order.steadfast.payment_received_at = payment_received ? new Date() : null;
    await order.save();

    res.json({ success: true, payment_received: order.steadfast.payment_received, payment_received_at: order.steadfast.payment_received_at });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
