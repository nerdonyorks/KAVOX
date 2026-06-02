const mongoose = require('mongoose');
const Cart = require('./src/models/cartModel');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/kavox').then(async () => {
    const carts = await Cart.find();
    let count = 0;
    for (let c of carts) {
        let changed = false;
        c.items = c.items.filter(i => {
            if (!i.productId) {
                changed = true;
                count++;
                return false;
            }
            return true;
        });
        if (changed) {
            await c.save();
        }
    }
    console.log("Removed items with null productId:", count);
    
    // Also remove any test products that still exist but might be named "test"
    const Product = require('./src/models/productModel');
    const p = await Product.find({ name: /test/i });
    if(p.length) {
        console.log("Found test products:", p.map(x=>x.name));
    }
    
    console.log("Done");
    process.exit(0);
}).catch(err => console.error(err));
