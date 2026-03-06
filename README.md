# Shukhi Life – Landing Page + Admin System

## Project Structure
```
shukhi-life/
├── backend/
│   ├── server.js            # Main Express server
│   ├── .env.example         # Environment variables template
│   ├── package.json
│   ├── models/index.js      # MongoDB models (Order, Admin)
│   ├── routes/
│   │   ├── orders.js        # Order routes + Meta CAPI Purchase trigger
│   │   ├── auth.js          # Admin login/auth routes
│   │   └── pixel.js         # Browser pixel server-side deduplication
│   ├── controllers/
│   │   └── meta.js          # Meta Conversions API helper
│   └── middleware/
│       └── auth.js          # JWT auth middleware
└── frontend/
    └── public/
        ├── index.html       # Landing page
        ├── login.html       # Admin login page
        └── admin.html       # Admin dashboard
```

---

## Setup Instructions

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
nano .env
```

Fill in:
```
MONGODB_URI=mongodb://localhost:27017/shukhi_life
JWT_SECRET=your_very_long_random_secret_here
META_PIXEL_ID=your_meta_pixel_id
META_CAPI_ACCESS_TOKEN=your_conversions_api_token
PORT=3000
NODE_ENV=production
ADMIN_USERNAME=admin
ADMIN_PASSWORD=YourSecurePassword123
```

### 3. IMPORTANT — Replace Pixel ID in Frontend
In `frontend/public/index.html`, find `PIXEL_ID_PLACEHOLDER` (2 occurrences) and replace with your actual Meta Pixel ID.

### 4. Run the Server
```bash
# Development
npm run dev

# Production
npm start
```

On first run, the admin user is automatically seeded from `.env` credentials.

---

## Access URLs
- **Landing Page:** `http://yourdomain.com/`
- **Admin Login:** `http://yourdomain.com/login`
- **Admin Panel:** `http://yourdomain.com/admin`

---

## Meta Pixel Events Flow

| Event | Trigger | Method |
|-------|---------|--------|
| PageView | Page loads | Browser Pixel + CAPI |
| ScrollDepth50 | User scrolls 50% | Browser Pixel + CAPI |
| ScrollDepth100 | User scrolls 100% | Browser Pixel + CAPI |
| AddToCart | "অর্ডার করুন" button click | Browser Pixel + CAPI |
| InitiateCheckout | Order form submitted | Browser Pixel + CAPI |
| Purchase | Admin marks order as **Confirmed** | CAPI only (server-side) |

> **Why Purchase is server-side only:** This ensures Meta receives Purchase events only for real, confirmed orders — not just form submissions. This gives the most accurate purchase signal for your ad optimization.

---

## VPS Deployment with PM2 + Nginx

### Install PM2
```bash
npm install -g pm2
cd backend
pm2 start server.js --name shukhi-life
pm2 save
pm2 startup
```

### Nginx Config
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Then add SSL:
```bash
certbot --nginx -d yourdomain.com
```

---

## Admin Panel Features
- 📊 Dashboard with stats (total, pending, confirmed, cancelled, revenue)
- 📦 Orders list with search, filter by status, pagination
- 🔄 Update order status (Pending → Confirmed → Cancelled)
- ✅ Auto-fires Meta Purchase CAPI event when order is **Confirmed**
- 🔒 JWT authentication, change password from Settings
- 📱 Mobile-responsive sidebar

---

## Security Notes
- All JWT tokens expire in 7 days
- Passwords are hashed with bcrypt (12 rounds)
- Admin credentials stored in MongoDB, never in plain text
- Meta CAPI data is hashed with SHA-256 before sending (name, phone, country)
- Never commit `.env` to git — add it to `.gitignore`
