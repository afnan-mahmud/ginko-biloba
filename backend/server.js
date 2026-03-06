const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend/public')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/pixel', require('./routes/pixel'));
app.use('/api/payments', require('./routes/payments'));

// Serve frontend pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/login.html'));
});
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/admin.html'));
});

// Connect to MongoDB and seed admin
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
})
  .then(async () => {
    console.log('✅ MongoDB connected');
    await seedAdmin();
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

// Seed admin user on first run
async function seedAdmin() {
  const { Admin } = require('./models');
  const exists = await Admin.findOne({ username: process.env.ADMIN_USERNAME });
  if (!exists) {
    const hashed = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    await Admin.create({ username: process.env.ADMIN_USERNAME, password: hashed });
    console.log(`✅ Admin seeded: ${process.env.ADMIN_USERNAME}`);
  }
}

module.exports = app;
