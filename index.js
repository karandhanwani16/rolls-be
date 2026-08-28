require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Import routes
const authRoutes = require('./routes/authRoutes');
const customerRoutes = require('./routes/customerRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const gradeRoutes = require('./routes/gradeRoutes');
const godownRoutes = require('./routes/godownRoutes');
const paymentInRoutes = require('./routes/paymentInRoutes');
const paymentOutRoutes = require('./routes/paymentOutRoutes');
const purchaseRoutes = require('./routes/purchaseRoutes');
const saleRoutes = require('./routes/saleRoutes');
const profileRoutes = require('./routes/profileRoutes');
const billToBillPaymentRoutes = require('./routes/billToBillPaymentRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const productRoutes = require('./routes/productRoutes');
const transactionRoutes = require('./routes/transactionsRoutes');
const stockReportRoutes = require('./routes/stockReportRoutes');
// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Check for required environment variables
if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET environment variable is required');
    process.exit(1);
}

// Determine allowed origins based on environment
const getAllowedOrigins = () => {
    const origins = [
        'http://mohittraders.local',
        'https://hoppscotch.io/',
        'http://localhost:8080'
    ];

    // Add more origins if needed
    return origins;
};

// CORS middleware with dynamic origin checking
// app.use(cors({
//     origin: function(origin, callback) {
//         // Allow requests with no origin (like mobile apps, curl requests)
//         if (!origin) return callback(null, true);

//         const allowedOrigins = getAllowedOrigins();
//         if (allowedOrigins.indexOf(origin) !== -1) {
//             callback(null, true);
//         } else {
//             callback(new Error('Not allowed by CORS'));
//         }
//     },
//     credentials: true,
//     methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//     allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'X-Client-Info']
// }));

app.use(express.json());

// Simple logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Add preflight headers to all routes
app.use((req, res, next) => {
    // Dynamic origin
    const origin = req.headers.origin;
    if (origin && getAllowedOrigins().includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }

    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Client-Info');
    next();
});

// Handle OPTIONS requests explicitly
app.options('*', (req, res) => {
    res.status(200).end();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/grades', gradeRoutes);
app.use('/api/godowns', godownRoutes);
app.use('/api/payments-in', paymentInRoutes);
app.use('/api/payments-out', paymentOutRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/bill-payments', billToBillPaymentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/products', productRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/stock-report', stockReportRoutes);
// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});