const axios = require('axios');
const crypto = require('crypto');

const PIXEL_ID = process.env.META_PIXEL_ID;
const ACCESS_TOKEN = process.env.META_CAPI_ACCESS_TOKEN;
const TEST_EVENT_CODE = process.env.META_TEST_EVENT_CODE;

function hashData(value) {
  if (!value) return null;
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

function hashPhone(phone) {
  if (!phone) return null;
  // Normalize: remove spaces, dashes; ensure starts with country code
  let normalized = phone.replace(/[\s\-\(\)]/g, '');
  if (normalized.startsWith('0')) normalized = '880' + normalized.slice(1);
  if (!normalized.startsWith('880')) normalized = '880' + normalized;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

async function sendCapiEvent({ eventName, eventTime, userData, customData, eventSourceUrl, eventId }) {
  try {
    const payload = {
      data: [
        {
          event_name: eventName,
          event_time: eventTime || Math.floor(Date.now() / 1000),
          event_id: eventId || crypto.randomUUID(),
          event_source_url: eventSourceUrl || '',
          action_source: 'website',
          user_data: {
            ph: userData.phone ? [hashPhone(userData.phone)] : undefined,
            fn: userData.name ? [hashData(userData.name.split(' ')[0])] : undefined,
            ln: userData.name && userData.name.split(' ').length > 1 ? [hashData(userData.name.split(' ').slice(1).join(' '))] : undefined,
            client_ip_address: userData.clientIpAddress || null,
            client_user_agent: userData.clientUserAgent || null,
            fbp: userData.fbp || null,
            fbc: userData.fbc || null,
            external_id: userData.externalId ? [hashData(userData.externalId)] : undefined,
            country: [hashData('bd')]
          },
          custom_data: customData || {}
        }
      ]
    };

    // Remove null/undefined fields from user_data
    Object.keys(payload.data[0].user_data).forEach(k => {
      if (payload.data[0].user_data[k] === null || payload.data[0].user_data[k] === undefined) {
        delete payload.data[0].user_data[k];
      }
    });

    if (TEST_EVENT_CODE) {
      payload.test_event_code = TEST_EVENT_CODE;
    }

    const url = `https://graph.facebook.com/v18.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`;
    const response = await axios.post(url, payload);
    console.log(`[META CAPI] ${eventName} sent:`, response.data);
    return response.data;
  } catch (err) {
    console.error(`[META CAPI] Error sending ${eventName}:`, err.response?.data || err.message);
    return null;
  }
}

module.exports = { sendCapiEvent };
