require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000; 

// --- CREATE UPLOADS FOLDER IF IT DOESN'T EXIST ---
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// --- PRODUCTION MIDDLEWARE ---
// 🔓 Fully opened CORS so mobile phones and local testing won't be blocked!
app.use(cors());

app.use(express.json()); 
app.use(express.static(path.join(__dirname, 'public'))); 
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // This allows images to be viewed!

// --- STANDARD LOCAL IMAGE UPLOAD ENGINE ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); 
    },
    filename: (req, file, cb) => {
        cb(null, 'receipt-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });


// ==========================================
// 🗄️ MONGODB DATABASE SCHEMAS
// ==========================================

// 1. ORDER SCHEMA
const orderSchema = new mongoose.Schema({
    orderId: { type: String, unique: true },
    customer: {
        name: { type: String, default: "Guest" },
        email: String,
        address: String
    },       
    items: Array,           
    paymentMethod: String,
    deliveryMethod: String,
    subtotal: Number,
    shippingFee: Number,
    total: Number,
    status: { type: String, default: 'Pending Verification' }, 
    receiptImg: { type: String, default: null },           
    createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

// 2. CART SCHEMA
const cartSchema = new mongoose.Schema({
    sessionId: { type: String, unique: true },
    items: Array,
    updatedAt: { type: Date, default: Date.now, expires: 86400 } 
});
const Cart = mongoose.model('Cart', cartSchema);


// ==========================================
// 🌐 API ENDPOINTS
// ==========================================

// --- CART ENDPOINTS ---

app.get('/api/cart/:sessionId', async (req, res) => {
    try {
        let cart = await Cart.findOne({ sessionId: req.params.sessionId });
        if (!cart) {
            cart = { sessionId: req.params.sessionId, items: [] };
        }
        res.status(200).json(cart);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/cart/:sessionId', async (req, res) => {
    try {
        await Cart.findOneAndUpdate(
            { sessionId: req.params.sessionId },
            { items: req.body.items, updatedAt: Date.now() },
            { upsert: true, new: true }
        );
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/cart/:sessionId', async (req, res) => {
    try {
        await Cart.deleteOne({ sessionId: req.params.sessionId });
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- ADMIN ENDPOINTS ---

app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    // It checks your secure environment variable first. If testing locally, it falls back to 'equineadmin123'
    const validPassword = process.env.ADMIN_PASSWORD || 'equineadmin123';
    
    if (password === validPassword) {
        // Return a simple success token
        res.status(200).json({ success: true, token: 'secure_admin_session_active' });
    } else {
        res.status(401).json({ success: false, message: 'Unauthorized' });
    }
});
// --- ORDER ENDPOINTS ---

app.post('/api/orders', async (req, res) => {
    try {
        const orderData = req.body;
        if(!orderData.orderId) {
            orderData.orderId = 'EQ-' + Math.floor(1000 + Math.random() * 9000) + '-' + Math.floor(100 + Math.random() * 900);
        }

        const newOrder = new Order(orderData);
        await newOrder.save();
        res.status(201).json({ success: true, orderId: orderData.orderId, order: newOrder });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// UPLOAD RECEIPT (Local Storage)
app.post('/api/upload-receipt/:orderId', upload.single('receipt'), async (req, res) => {
    try {
        const { orderId } = req.params;
        // Construct the URL to point to your own server's upload folder
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

app.get('/api/admin/orders', async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.status(200).json(orders);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

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

app.get('/api/track/:orderId', async (req, res) => {
    try {
        const order = await Order.findOne({ orderId: req.params.orderId });
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });
        
        res.status(200).json({ 
            success: true, 
            status: order.status, 
            customerName: order.customer.name,
            total: order.total,
            orderId: order.orderId,
            createdAt: order.createdAt
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- SERVER INITIALIZATION ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("🟢 Connected to MongoDB");
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
        });
    })
    .catch(err => console.error("🔴 MongoDB Error:", err.message));