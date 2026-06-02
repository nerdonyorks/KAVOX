const Cart = require("../models/cartModel");
const Order = require("../models/orderModel");
const Product = require("../models/productModel");
const User = require("../models/userModel");
const { HTTP_STATUS, MESSAGES } = require("../utils/constants");

const getDetailedTotals = (items) => {
    let totalActualPrice = 0;
    let totalProductDiscount = 0;
    let totalCategoryDiscount = 0;
    let cartTotal = 0;

    items.forEach(item => {
        const product = item.productId;
        const qty = item.quantity;
        const basePrice = product.price;
        const basePriceTotal = basePrice * qty;
        totalActualPrice += basePriceTotal;

        const pOffer = product.productOffer || 0;
        const cOffer = (product.category && product.category.offer) ? product.category.offer : 0;

        // Always apply whichever offer is greater
        const bestOffer = Math.max(pOffer, cOffer);
        const finalItemPrice = bestOffer > 0
            ? Math.round(basePrice * (1 - bestOffer / 100))
            : basePrice;

        const savedOnItem = (basePrice - finalItemPrice) * qty;

        // Attribute saving to the winning offer type
        if (pOffer >= cOffer && pOffer > 0) {
            totalProductDiscount += savedOnItem;
        } else if (cOffer > pOffer && cOffer > 0) {
            totalCategoryDiscount += savedOnItem;
        }

        cartTotal += finalItemPrice * qty;
    });

    return {
        totalActualPrice,
        totalProductDiscount,
        totalCategoryDiscount,
        cartTotal
    };
};

const generateOrderId = () => {
    return 'ODR-' + Math.floor(100000000 + Math.random() * 900000000).toString();
};

exports.getCheckout = async (req, res) => {
    try {
        const userId = req.user._id;

        // Fetch Cart
        const cart = await Cart.findOne({ userId }).populate({
            path: "items.productId",
            populate: { path: "category" }
        });

        if (!cart || cart.items.length === 0) {
            return res.redirect("/cart");
        }

        // Validate items are still active and in stock
        let isValid = true;
        for (let item of cart.items) {
            const product = item.productId;
            if (!product || product.isDeleted || !product.isActive || !product.category || !product.category.isActive || product.category.isDeleted) {
                isValid = false;
                break;
            }
            const variant = product.variants.find(v => v.size === item.size && v.color === item.color);
            if (!variant || !variant.isActive || variant.quantity < item.quantity) {
                isValid = false;
                break;
            }
        }

        if (!isValid) {
            // Re-render cart so validations kick in there
            return res.redirect("/cart");
        }

        const summary = getDetailedTotals(cart.items);
        
        // Fetch User Addresses
        const user = await User.findById(userId);
        const addresses = user.addresses || [];

        res.render("user/checkout", {
            title: "Checkout - KAVOX",
            cart,
            summary,
            addresses
        });
    } catch (error) {
        console.error("Get Checkout Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render("user/error", {
            message: "Failed to load checkout."
        });
    }
};

exports.placeOrder = async (req, res) => {
    try {
        const userId = req.user._id;
        const { addressId, paymentMethod } = req.body;

        if (!addressId || !paymentMethod) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Address and Payment Method are required." });
        }

        if (paymentMethod !== 'COD') {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Only Cash on Delivery is supported currently." });
        }

        const user = await User.findById(userId);
        const address = user.addresses.id(addressId);
        if (!address) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Invalid shipping address." });
        }

        const cart = await Cart.findOne({ userId }).populate({
            path: "items.productId",
            populate: { path: "category" }
        });

        if (!cart || cart.items.length === 0) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Cart is empty." });
        }

        // Verify stock one last time and deduct
        for (let item of cart.items) {
            const product = item.productId;
            if (!product || product.isDeleted || !product.isActive || !product.category || !product.category.isActive || product.category.isDeleted) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: `Product ${product?.name || ''} is no longer available.` });
            }
            const variant = product.variants.find(v => v.size === item.size && v.color === item.color);
            if (!variant || !variant.isActive) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: `Variant for ${product.name} is no longer available.` });
            }
            if (variant.quantity < item.quantity) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: `Insufficient stock for ${product.name}.` });
            }

            // Deduct stock
            variant.quantity -= item.quantity;
            await product.save();
        }

        const summary = getDetailedTotals(cart.items);

        // Create Order items array — recalculate final price with best offer
        const orderItems = cart.items.map(item => {
            const product = item.productId;
            const variant = product.variants.find(v => v.size === item.size && v.color === item.color);

            const pOffer = product.productOffer || 0;
            const cOffer = (product.category && product.category.offer) ? product.category.offer : 0;
            const bestOffer = Math.max(pOffer, cOffer);
            const finalPrice = bestOffer > 0
                ? Math.round(product.price * (1 - bestOffer / 100))
                : product.price;

            return {
                productId: product._id,
                variantId: variant ? variant._id : null,
                productName: product.name,
                size: item.size,
                color: item.color,
                quantity: item.quantity,
                price: finalPrice,
                totalPrice: item.quantity * finalPrice
            };
        });

        const newOrder = new Order({
            userId,
            orderId: generateOrderId(),
            shippingAddress: {
                firstName: address.firstName,
                lastName: address.lastName,
                street: address.street,
                city: address.city,
                state: address.state,
                pincode: address.pincode,
                mobile: address.mobile
            },
            items: orderItems,
            pricing: {
                subtotal: summary.totalActualPrice, // the total base price
                discount: summary.totalProductDiscount + summary.totalCategoryDiscount,
                shipping: 0,
                total: summary.cartTotal
            },
            paymentMethod: 'COD',
            paymentStatus: 'Pending',
            orderStatus: 'Processing'
        });

        await newOrder.save();

        // Clear Cart
        cart.items = [];
        cart.cartTotal = 0;
        await cart.save();

        res.status(HTTP_STATUS.OK).json({ 
            success: true, 
            message: "Order placed successfully!",
            orderId: newOrder.orderId
        });

    } catch (error) {
        console.error("Place Order Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to place order." });
    }
};
