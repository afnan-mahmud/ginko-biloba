const mongoose = require('mongoose');

// Order Model
const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    unique: true,
    default: () => 'SL-' + Date.now() + '-' + Math.floor(Math.random() * 1000)
  },
  customer: {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    district: { type: String, default: '' }
  },
  products: [
    {
      name: String,
      quantity: Number,
      price: Number,
      subtotal: Number
    }
  ],
  shippingCharge: { type: Number, default: 80 },
  total: { type: Number, required: true },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled'],
    default: 'pending'
  },
  // Meta Pixel / CAPI tracking data
  metaData: {
    clientIpAddress: String,
    clientUserAgent: String,
    fbp: String,
    fbc: String,
    eventSourceUrl: String,
    externalId: String,
    purchaseEventSent: { type: Boolean, default: false }
  },
  // Steadfast courier data
  steadfast: {
    consignment_id: String,
    tracking_code: String,
    status: { type: String, default: null },
    sentAt: Date
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

orderSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Admin Model
const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const Order = mongoose.model('Order', orderSchema);
const Admin = mongoose.model('Admin', adminSchema);

module.exports = { Order, Admin };
