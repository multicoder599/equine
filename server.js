require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000; 

// --- PRODUCTION MIDDLEWARE ---
const allowedOrigins = [
    'http://localhost:3000', 
    'http://127.0.0.1:5500', // Common for VS Code Live Server
    'https://equine-4ya0.onrender.com'
];

app.use(cors({
    origin: function(origin, callback){
        if(!origin) return callback(null, true);
        if(allowedOrigins.indexOf(origin) === -1){
            return callback(new Error('CORS Policy Blocked: Unauthorized Origin'), false);
        }
        return callback(null, true);
    }
}));

app.use(express.json()); 
app.use(express.static(path.join(__dirname, 'public'))); 
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- IMAGE UPLOAD ENGINE ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); 
    },
    filename: (req, file, cb) => {
        cb(null, 'receipt-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- DATABASE SCHEMA ---
const orderSchema = new mongoose.Schema({
    orderId: { type: String, unique: true },
    customer: {
        name: { type: String, default: "Guest" },
        email: String
    },       
    items: Array,           
    paymentMethod: String,
    total: Number,
    delivery: { type: Number, default: 0 },
    status: { type: String, default: 'Pending Verification' }, 
    receiptImg: { type: String, default: null },           
    createdAt: { type: Date, default: Date.now }
});

const Order = mongoose.model('Order', orderSchema);

// --- API ENDPOINTS ---

// 1. CREATE NEW ORDER (From Success Page)
app.post('/api/orders', async (req, res) => {
    try {
        const orderData = req.body;
        // Generate a clean ID if frontend didn't provide one
        if(!orderData.orderId) {
            orderData.orderId = 'EQ-' + Math.floor(1000 + Math.random() * 9000);
        }

        const newOrder = new Order(orderData);
        await newOrder.save();
        res.status(201).json({ success: true, order: newOrder });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 2. UPLOAD RECEIPT (From Success Page)
app.post('/api/upload-receipt/:orderId', upload.single('receipt'), async (req, res) => {
    try {
        const { orderId } = req.params;
        // Construct full URL so frontend can see images
        const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`; 

        const updatedOrder = await Order.findOneAndUpdate(
            { orderId: orderId }, 
            { receiptImg: fileUrl, status: 'Pending Verification' },
            { new: true }
        );

        res.status(200).json({ success: true, fileUrl: fileUrl, order: updatedOrder });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 3. GET ALL ORDERS (For Admin Dashboard)
app.get('/api/admin/orders', async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.status(200).json(orders);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 4. UPDATE ORDER STATUS (For Admin Dashboard Approve/Ship)
app.put('/api/admin/orders/:orderId/status', async (req, res) => {
    try {
        const { status } = req.body;
        const updatedOrder = await Order.findOneAndUpdate(
            { orderId: req.params.orderId }, 
            { status: status },
            { new: true }
        );
        res.status(200).json({ success: true, order: updatedOrder });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 5. TRACK ORDER (For Tracking Page)
app.get('/api/track/:orderId', async (req, res) => {
    try {
        const order = await Order.findOne({ orderId: req.params.orderId });
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });
        
        res.status(200).json({ 
            success: true, 
            status: order.status, 
            customerName: order.customer.name,
            total: order.total
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- SERVER & DATABASE INITIALIZATION ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("🟢 Connected to MongoDB");
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
        });
    })
    .catch(err => console.error("🔴 MongoDB Error:", err.message));