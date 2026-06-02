const mongoose = require('mongoose');
const Product = require('./src/models/productModel');
const Cart = require('./src/models/cartModel');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/kavox').then(async () => {
    console.log("Connected to MongoDB");
    const testProducts = await Product.find({ name: { $regex: /test/i } });
    console.log("Found test products:", testProducts.map(p => p.name));
    
    // Check carts
    const carts = await Cart.find().populate('items.productId');
    let testItemsInCarts = 0;
    carts.forEach(c => {
        c.items.forEach(i => {
            if (i.productId && i.productId.name && i.productId.name.toLowerCase().includes('test')) {
                testItemsInCarts++;
            }
        });
    });
    console.log("Found test items in carts:", testItemsInCarts);
    process.exit(0);
}).catch(err => console.error(err));
