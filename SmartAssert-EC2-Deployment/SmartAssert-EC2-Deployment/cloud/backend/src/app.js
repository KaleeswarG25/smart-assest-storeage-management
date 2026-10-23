const express = require('express');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const employeeRoutes = require('./routes/employee.routes');
const assetRoutes = require('./routes/asset.routes');
const licenseRoutes = require('./routes/license.routes');
const expiryRoutes = require('./routes/expiry.routes');
const reportRoutes = require('./routes/report.routes');
const { notFoundHandler, globalErrorHandler } = require('./middleware/errorHandler');

const app = express();

// Enable trust proxy for Google Cloud Run reverse proxy (GFE/Envoy)
app.set('trust proxy', 1);

// Security and utility middleware: Strict CORS origin validation
const isProduction = process.env.NODE_ENV === 'production';
const configuredOrigins = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
const allowedOrigins = [
  ...configuredOrigins,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174'
];

app.use(cors({
  origin: function (origin, callback) {
    // Non-browser requests without origin header (e.g., automated tests, server health checks)
    if (!origin) return callback(null, true);

    if (isProduction && configuredOrigins.length === 0) {
      return callback(new Error('CORS misconfiguration: CORS_ORIGIN must be explicitly defined in production.'));
    }

    const isMatch = allowedOrigins.some(ao => {
      try {
        return new URL(ao).origin === new URL(origin).origin;
      } catch {
        return ao === origin;
      }
    });

    if (isMatch) {
      return callback(null, true);
    }

    const corsError = new Error(`Origin '${origin}' blocked by CORS policy.`);
    corsError.statusCode = 403;
    return callback(corsError);
  },
  credentials: true
}));

app.use(cookieParser());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Static uploads directory serving (bills and invoices)
app.use('/uploads', express.static(path.resolve(__dirname, '../../data/uploads')));

// Development request logger (non-sensitive)
if (process.env.NODE_ENV !== 'test') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[HTTP] ${req.method} ${req.originalUrl} ${res.statusCode} (${duration}ms)`);
    });
    next();
  });
}

// Root status route
app.get('/', (req, res) => {
  if (req.accepts('html')) {
    return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>smartAssert Backend API</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #1e293b; padding: 2.5rem; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.4); text-align: center; max-width: 480px; border: 1px solid #334155; }
    h1 { color: #38bdf8; margin: 0.5rem 0 1rem; font-size: 1.5rem; }
    p { color: #94a3b8; font-size: 0.95rem; line-height: 1.6; margin-bottom: 1.5rem; }
    .btn { display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 0.85rem 1.75rem; border-radius: 8px; font-weight: 600; font-size: 1rem; }
    .btn:hover { background: #1d4ed8; }
    .status-badge { display: inline-block; background: #064e3b; color: #34d399; font-size: 0.8rem; padding: 0.35rem 0.75rem; border-radius: 9999px; font-weight: 600; letter-spacing: 0.05em; }
    .footer { margin-top: 1.75rem; font-size: 0.825rem; color: #64748b; }
    .footer a { color: #38bdf8; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <span class="status-badge">● BACKEND RUNNING</span>
    <h1>smartAssert API</h1>
    <p>The backend API server is online and operational on port 5000. To access the web user interface and dashboard, click below:</p>
    <a class="btn" href="http://localhost:5173">Go to Web App (localhost:5173)</a>
    <div class="footer">
      API Health Check: <a href="/api/health">/api/health</a>
    </div>
  </div>
</body>
</html>`);
  }
  res.json({
    status: 'UP',
    message: 'smartAssert Backend API is operational.',
    frontend: 'http://localhost:5173',
    health: '/api/health'
  });
});

// API Routes
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/licenses', licenseRoutes);
app.use('/api/expiry', expiryRoutes);
app.use('/api/reports', reportRoutes);

// Catch-all 404 & Centralized Error Handlers
app.use(notFoundHandler);
app.use(globalErrorHandler);

module.exports = app;
