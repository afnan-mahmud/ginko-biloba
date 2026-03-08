const express = require('express');
const router = express.Router();
const { sendCapiEvent } = require('../controllers/meta');

// POST /api/pixel/event
// Frontend sends browser-side events here for CAPI deduplication
router.post('/event', async (req, res) => {
  try {
    const {
      eventName,
      fbp, fbc,
      phone, name,
      clientUserAgent,
      eventSourceUrl,
      customData,
      eventId
    } = req.body;

    const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

    const allowedEvents = ['ViewContent', 'InitiateCheckout', 'Lead'];
    if (!allowedEvents.includes(eventName)) {
      return res.status(400).json({ success: false, message: 'Unknown event' });
    }

    await sendCapiEvent({
      eventName,
      eventId,
      userData: {
        phone: phone || null,
        name: name || null,
        clientIpAddress: clientIp,
        clientUserAgent,
        fbp,
        fbc,
        externalId: phone || null
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
