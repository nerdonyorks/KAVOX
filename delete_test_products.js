const mongoose = require('mongoose');
const Product = require('./src/models/productModel');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
    // Check products matching test
    const tests = await Product.find({ name: /test/i });
    if(tests.length){
        console.log("Found test products:", tests.map(x=>x.name));
        for(let p of tests) {
             await Product.deleteOne({ _id: p._id });
             console.log("Deleted:", p.name);
        }
    } else {
        console.log("No test products found.");
    }
    
    // Check users
    const User = require('./src/models/userModel');
    const Cart = require('./src/models/cartModel');
    // Clear all carts just to be safe from old test data
    // Or just clear carts with 0 total that have no items
    const carts = await Cart.find();
    for(let c of carts) {
        if(c.items.length === 0) {
            await c.save(); // Just trigger save to ensure it's clean
        }
    }

    console.log("Done");
    process.exit(0);
}).catch(err => console.error(err));
