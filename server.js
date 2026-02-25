require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const app = express();
// Render assigns a dynamic PORT, usually 10000. We default to 3000 only if running locally.
const PORT = process.env.PORT || 3000; 

// --- PRODUCTION MIDDLEWARE ---
// Lock down CORS so only your live URL and your local machine can talk to this API
const allowedOrigins = ['http://localhost:3000', 'https://equine-4ya0.onrender.com'];
app.use(cors({
    origin: function(origin, callback){
        // allow requests with no origin (like mobile apps or curl requests)
        if(!origin) return callback(null, true);
        if(allowedOrigins.indexOf(origin) === -1){
            var msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    }
}));

app.use(express.json()); 
app.use(express.static(path.join(__dirname, 'public'))); 
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- IMAGE UPLOAD ENGINE (Multer) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); 
    },
    filename: (req, file, cb) => {
        cb(null, 'receipt-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- DATABASE SCHEMA (MongoDB) ---
const orderSchema = new mongoose.Schema({
    orderId: { type: String, unique: true },
    customer: Object,       
    items: Array,           
    deliveryMethod: String,
    paymentMethod: String,
    subtotal: Number,
    shippingFee: Number,
    total: Number,
    status: { type: String, default: 'Awaiting Payment' }, 
    receiptImg: { type: String, default: null },           
    createdAt: { type: Date, default: Date.now }
});

const Order = mongoose.model('Order', orderSchema);

// --- API ENDPOINTS ---

// 1. CREATE NEW ORDER
app.post('/api/orders', async (req, res) => {
    try {
        const orderData = req.body;
        const randomRef = 'EQ-' + Math.floor(1000 + Math.random() * 9000) + '-' + Math.floor(100 + Math.random() * 900);
        orderData.orderId = randomRef;

        const newOrder = new Order(orderData);
        await newOrder.save();

        res.status(201).json({ success: true, orderId: randomRef });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 2. UPLOAD RECEIPT
app.post('/api/upload-receipt/:orderId', upload.single('receipt'), async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const fileUrl = `/uploads/${req.file.filename}`; 

        await Order.findOneAndUpdate(
            { orderId: orderId }, 
            { receiptImg: fileUrl, status: 'Pending Verification' }
        );

        res.status(200).json({ success: true, fileUrl: fileUrl });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 3. GET ALL ORDERS (Admin)
app.get('/api/admin/orders', async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.status(200).json(orders);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 4. UPDATE ORDER STATUS (Admin)
app.put('/api/admin/orders/:orderId/status', async (req, res) => {
    try {
        const { status } = req.body;
        await Order.findOneAndUpdate({ orderId: req.params.orderId }, { status: status });
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 5. TRACK ORDER (Customer)
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
            console.log(`=================================================`);
            console.log(`🚀 Server is LIVE`);
            console.log(`🔗 Local URL: http://localhost:${PORT}`);
            console.log(`🌍 Live URL: https://equine-4ya0.onrender.com`);
            console.log(`=================================================`);
        });
    })
    .catch(err => {
        console.error("🔴 MongoDB Connection Error:", err.message);
    });