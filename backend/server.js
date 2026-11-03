require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mpesaRoutes = require('./routes/mpesa');

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.MPESA_ENV || 'sandbox'
  });
});

// M-Pesa routes
app.use('/api/mpesa', mpesaRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║   VYRO POS M-Pesa Backend Server                          ║
║   Port: ${PORT.toString().padEnd(48)}║
║   Environment: ${(process.env.MPESA_ENV || 'sandbox').padEnd(43)}║
║   Status: Running ✓                                        ║
╚════════════════════════════════════════════════════════════╝
  `);
});
