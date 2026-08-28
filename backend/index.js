require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const compression = require('compression');
const errorHandler = require('./middleware/errorMiddleware');

const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const userRoutes = require('./routes/userRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const favouritesRoutes = require('./routes/favouritesRoutes');
const auditRoutes = require('./routes/auditRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Behind Cloudflare (proxy/tunnel): honour CF-Connecting-IP / X-Forwarded-For so
// rate limiting and audit logs see real client IPs. Override with TRUST_PROXY env
// (e.g. "1", "loopback", or a comma-separated list). Defaults cover loopback +
// private networks, which is where cloudflared and reverse proxies typically run.
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback, linklocal, uniquelocal');

// Middlewares
// Extra origins (production domain etc.) come from CORS_ORIGINS as a comma-separated list.
// Origins are normalized (trailing slash stripped) so 'https://site.vercel.app/' still matches
// the slash-less Origin header browsers actually send.
const normalizeOrigin = (o) => String(o).trim().replace(/\/+$/, '');
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  ...String(process.env.CORS_ORIGINS || '').split(',').map(normalizeOrigin).filter(Boolean),
];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(normalizeOrigin(origin)) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(compression());
app.use(express.json({ limit: '6mb' }));
app.use(express.urlencoded({ extended: true }));

// Uploaded meal images (multer disk storage)
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '7d' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/meals', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/favourites', favouritesRoutes);
app.use('/api/audit', auditRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Campus Cafeteria API is running', timestamp: new Date().toISOString() });
});

// Error handler (last middleware)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

// Background jobs: missed-meal sweeps at session close + carryover expiry
const { startScheduler } = require('./utils/scheduler');
startScheduler();

module.exports = app;
