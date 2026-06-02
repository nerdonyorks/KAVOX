const mongoose = require('mongoose');
const Product = require('./src/models/productModel');
const Cart = require('./src/models/cartModel');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/kavox').then(async () => {
    const carts = await Cart.find().populate('items.productId');
    carts.forEach(c => {
        c.items.forEach(i => {
            if (i.productId && (i.productId.isDeleted || !i.productId.isActive)) {
                console.log("Found inactive/deleted product in cart:", i.productId.name);
            }
        });
    });
    console.log("Done");
    process.exit(0);
}).catch(err => console.error(err));
