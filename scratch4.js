const mongoose = require('mongoose');
const Cart = require('./src/models/cartModel');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const carts = await Cart.find().populate({
        path: "items.productId",
        populate: { path: "category" }
    });
    
    for (let cart of carts) {
        let hasChanges = false;
        cart.items = cart.items.filter(item => {
            const product = item.productId;
            if (!product || product.isDeleted || !product.isActive || !product.category || !product.category.isActive || product.category.isDeleted) {
                console.log("Removing invalid product:", product ? product.name : 'null');
                hasChanges = true;
                return false;
            }
            const variant = product.variants.find(v => v.size === item.size && v.color === item.color);
            if (!variant || !variant.isActive) {
                console.log("Removing invalid variant for:", product.name);
                hasChanges = true;
                return false;
            }
            return true;
        });
        if (hasChanges) {
            cart.cartTotal = cart.items.reduce((a,b) => a+b.totalPrice, 0);
            await cart.save();
        }
    }
    
    // Check products matching test
    const Product = require('./src/models/productModel');
    const tests = await Product.find({ name: /test/i });
    if(tests.length){
        console.log("Found test products:", tests.map(x=>x.name));
        for(let p of tests) {
             p.isDeleted = true;
             await p.save();
             console.log("Deleted:", p.name);
        }
    }

    console.log("Done");
    process.exit(0);
}).catch(err => console.error(err));
