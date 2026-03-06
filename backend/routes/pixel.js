const express = require('express');
const router = express.Router();
const { sendCapiEvent } = require('../controllers/meta');

// POST /api/pixel/event
// Frontend sends browser events (PageView, ScrollDepth, AddToCart) here for CAPI deduplication
router.post('/event', async (req, res) => {
  try {
    const {
      eventName,
      fbp, fbc,
      clientUserAgent,
      eventSourceUrl,
      customData,
      eventId
    } = req.body;

    const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

    const allowedEvents = ['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'ScrollDepth50', 'ScrollDepth100'];
    if (!allowedEvents.includes(eventName)) {
      return res.status(400).json({ success: false, message: 'Unknown event' });
    }

    await sendCapiEvent({
      eventName,
      eventId,
      userData: {
        clientIpAddress: clientIp,
        clientUserAgent,
        fbp,
        fbc
      },
      customData: customData || {},
      eventSourceUrl
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Pixel event error:', err);
    res.status(500).json({ success: false });
  }
});

module.exports = router;
