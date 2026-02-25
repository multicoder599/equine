require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json()); 
app.use(express.static(path.join(__dirname, 'public'))); // Serve HTML files
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Serve uploaded images

// --- IMAGE UPLOAD ENGINE (Multer) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Save files to the /uploads folder
    },
    filename: (req, file, cb) => {
        // Rename file to secure, unique string (e.g., receipt-16392839.jpg)
        cb(null, 'receipt-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- DATABASE SCHEMA (MongoDB) ---
// This defines what an "Order" looks like in your database
const orderSchema = new mongoose.Schema({
    orderId: { type: String, unique: true },
    customer: Object,       // Name, Email, Address
    items: Array,           // The cart array
    deliveryMethod: String,
    paymentMethod: String,
    subtotal: Number,
    shippingFee: Number,
    total: Number,
    status: { type: String, default: 'Awaiting Payment' }, // Changes to Processing, Shipped, etc.
    receiptImg: { type: String, default: null },           // URL of the uploaded image
    createdAt: { type: Date, default: Date.now }
});

const Order = mongoose.model('Order', orderSchema);

// --- API ENDPOINTS ---

// 1. CREATE NEW ORDER (Fired from checkout.html)
app.post('/api/orders', async (req, res) => {
    try {
        const orderData = req.body;
        
        // Generate a random Order Reference (e.g., EQ-8492-901)
        const randomRef = 'EQ-' + Math.floor(1000 + Math.random() * 9000) + '-' + Math.floor(100 + Math.random() * 900);
        orderData.orderId = randomRef;

        const newOrder = new Order(orderData);
        await newOrder.save();

        res.status(201).json({ success: true, orderId: randomRef });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 2. UPLOAD RECEIPT (Fired from pay.html)
app.post('/api/upload-receipt/:orderId', upload.single('receipt'), async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const fileUrl = `/uploads/${req.file.filename}`; // Path to the saved image

        // Find the order and update it with the image and new status
        await Order.findOneAndUpdate(
            { orderId: orderId }, 
            { receiptImg: fileUrl, status: 'Pending Verification' }
        );

        res.status(200).json({ success: true, fileUrl: fileUrl });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 3. GET ALL ORDERS (Fired from padmin.html)
app.get('/api/admin/orders', async (req, res) => {
    try {
        // Fetch orders, newest first
        const orders = await Order.find().sort({ createdAt: -1 });
        res.status(200).json(orders);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 4. UPDATE ORDER STATUS (Fired from padmin.html when you click "Approve")
app.put('/api/admin/orders/:orderId/status', async (req, res) => {
    try {
        const { status } = req.body;
        await Order.findOneAndUpdate({ orderId: req.params.orderId }, { status: status });
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 5. TRACK ORDER (Fired from track.html)
app.get('/api/track/:orderId', async (req, res) => {
    try {
        const order = await Order.findOne({ orderId: req.params.orderId });
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }
        res.status(200).json({ success: true, status: order.status, date: order.createdAt });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- SERVER & DATABASE INITIALIZATION ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("🟢 Connected to MongoDB Database");
        app.listen(PORT, () => {
            console.log(`🚀 Equine Backend running at http://localhost:${PORT}`);
        });
    })
    .catch(err => {
        console.error("🔴 MongoDB Connection Error:", err.message);
        console.log("Check your .env file for the correct MONGO_URI.");
    });