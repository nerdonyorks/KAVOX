const Cart = require("../models/cartModel");
const Order = require("../models/orderModel");
const User = require("../models/userModel");
const Product = require("../models/productModel");
const paymentService = require("../services/paymentService");
const couponService = require("../services/couponService");
const { getDetailedTotals } = require("./orderController");
const { HTTP_STATUS } = require("../utils/constants");
const offerService = require("../services/offerService");

const generateOrderId = () => {
    return 'ODR-' + Math.floor(100000000 + Math.random() * 900000000).toString();
};

/**
 * Initiates Razorpay payment by validating checkout data, calculating amounts,
 * and calling Razorpay order creation.
 */
exports.createOrder = async (req, res) => {
    try {
        const userId = req.user._id;
        const { addressId, useWallet } = req.body;

        if (!addressId) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
                success: false, 
                message: "Shipping address is required." 
            });
        }

        // Fetch user's cart
        const cart = await Cart.findOne({ userId }).populate({
            path: "items.productId",
            populate: { path: "category" }
        });

        if (!cart || cart.items.length === 0) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
                success: false, 
                message: "Cart is empty." 
            });
        }

        // Populate active offers first
        if (cart.items.length > 0) {
            const products = cart.items.map(item => item.productId).filter(Boolean);
            await offerService.populateProductOffers(products);
        }

        // Validate stock and status
        for (let item of cart.items) {
            const product = item.productId;
            if (!product || product.isDeleted || !product.isActive || !product.category || !product.category.isActive || product.category.isDeleted) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
                    success: false, 
                    message: `Product ${product?.name || ''} is no longer available.` 
                });
            }
            const variant = product.variants.find(v => v.size === item.size && v.color === item.color);
            if (!variant || !variant.isActive) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
                    success: false, 
                    message: `Variant for ${product.name} is no longer available.` 
                });
            }
            if (variant.quantity < item.quantity) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
                    success: false, 
                    message: `Insufficient stock for ${product.name} (${item.size}/${item.color}). Only ${variant.quantity} available.` 
                });
            }
        }

        const summary = getDetailedTotals(cart.items);

        let couponDiscount = 0;
        if (req.session.couponCode) {
            const validation = await couponService.validateCoupon(req.session.couponCode, summary.cartTotal, userId);
            if (validation.isValid) {
                couponDiscount = validation.discountAmount;
            }
        }

        let finalAmount = summary.cartTotal - couponDiscount;
        let walletAmountUsed = 0;

        if (useWallet) {
            const walletService = require("../services/walletService");
            const wallet = await walletService.getWallet(userId);
            if (wallet.balance > 0) {
                walletAmountUsed = Math.min(wallet.balance, finalAmount);
                finalAmount -= walletAmountUsed;
            }
        }

        if (finalAmount <= 0) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
                success: false, 
                message: "Remaining order amount must be greater than zero for online payment." 
            });
        }

        // Generate a receipt ID and initiate Razorpay order
        const receiptId = `rcpt_${Math.floor(100000 + Math.random() * 900000)}`;
        const rzpOrder = await paymentService.createRazorpayOrder(finalAmount, receiptId);

        // Prepare Mongoose order items
        const orderItems = cart.items.map(item => {
            const product = item.productId;
            const variant = product.variants.find(v => v.size === item.size && v.color === item.color);
            
            const pricing = offerService.getDiscountedPrice(product);
            const finalPrice = pricing.finalPrice;
 
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

        // Retrieve shipping address details
        const user = await User.findById(userId);
        const address = user.addresses.id(addressId);
        if (!address) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
                success: false, 
                message: "Invalid shipping address." 
            });
        }

        const newOrderId = generateOrderId();

        // Create Mongoose Order with paymentStatus: 'Failed'
        const newOrder = new Order({
            userId,
            orderId: newOrderId,
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
                subtotal: summary.totalActualPrice,
                discount: summary.totalProductDiscount + summary.totalCategoryDiscount + couponDiscount,
                shipping: 0,
                total: finalAmount + walletAmountUsed
            },
            couponCode: appliedCouponCode || undefined,
            couponDiscount: couponDiscount,
            paymentMethod: 'RAZORPAY',
            paymentStatus: 'Failed',
            orderStatus: 'Processing',
            razorpayOrderId: rzpOrder.id,
            walletAmountUsed: walletAmountUsed,
            remainingAmountPaid: finalAmount
        });

        await newOrder.save();

        // Deduct stock
        for (let item of cart.items) {
            const product = item.productId;
            const variant = product.variants.find(v => v.size === item.size && v.color === item.color);
            variant.quantity -= item.quantity;
            await product.save();
        }

        // Perform Wallet deduction
        if (walletAmountUsed > 0) {
            const walletService = require("../services/walletService");
            try {
                await walletService.debitWallet(userId, walletAmountUsed, 'WALLET_PAYMENT', newOrderId);
            } catch (walletError) {
                // Rollback Order creation
                await Order.deleteOne({ _id: newOrder._id });
                // Restore stock
                for (let item of cart.items) {
                    const product = item.productId;
                    const variant = product.variants.find(v => v.size === item.size && v.color === item.color);
                    if (variant) {
                        variant.quantity += item.quantity;
                        await product.save();
                    }
                }
                return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: walletError.message || "Failed to process wallet payment." });
            }
        }

        // Clear coupon code session
        delete req.session.couponCode;

        // Empty user cart
        cart.items = [];
        cart.cartTotal = 0;
        await cart.save();

        res.status(HTTP_STATUS.OK).json({
            success: true,
            orderId: newOrder._id,
            orderIdString: newOrder.orderId,
            razorpayOrder: rzpOrder,
            razorpayKeyId: process.env.RAZORPAY_KEY_ID,
            user: {
                name: req.user.name,
                email: req.user.email,
                phone: req.user.phone || ''
            }
        });
    } catch (error) {
        console.error("Create Razorpay Order Controller Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
            success: false, 
            message: "Failed to initiate online payment." 
        });
    }
};

/**
 * Verifies Razorpay payment signature and updates the order status to Completed.
 */
exports.verifyPayment = async (req, res) => {
    try {
        const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

        if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
                success: false, 
                message: "Payment credentials are required." 
            });
        }

        // 1. Find the order by razorpayOrderId
        const order = await Order.findOne({ razorpayOrderId });
        if (!order) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Order not found."
            });
        }

        // 2. Prevent duplicate order updates
        if (order.paymentStatus === 'Completed') {
            return res.status(HTTP_STATUS.OK).json({
                success: true,
                message: "Order already processed successfully.",
                orderId: order.orderId,
                amountPaid: order.pricing.total
            });
        }

        // 3. Verify signature
        const isSignatureValid = paymentService.verifySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
        if (!isSignatureValid) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
                success: false, 
                message: "Payment verification failed. Security signature mismatch." 
            });
        }

        // 4. Update payment details
        order.paymentStatus = 'Completed';
        order.razorpayPaymentId = razorpayPaymentId;
        order.transactionDate = new Date();
        await order.save();

        res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Payment verified and order placed successfully!",
            orderId: order.orderId,
            amountPaid: order.pricing.total
        });
    } catch (error) {
        console.error("Verify Razorpay Payment Controller Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
            success: false, 
            message: "Failed to complete transaction verification." 
        });
    }
};

/**
 * Initiates payment retry for a failed Razorpay order.
 */
exports.retryOrder = async (req, res) => {
    try {
        const userId = req.user._id;
        const { orderId } = req.body;

        if (!orderId) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
                success: false, 
                message: "Order ID is required." 
            });
        }

        const order = await Order.findOne({ _id: orderId, userId }).populate('items.productId');
        if (!order) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ 
                success: false, 
                message: "Order not found." 
            });
        }

        if (order.paymentMethod !== 'RAZORPAY' || order.paymentStatus !== 'Failed') {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
                success: false, 
                message: "Only failed Razorpay orders can be retried." 
            });
        }

        // Check if any product or category is unlisted or unavailable
        for (let item of order.items) {
            const product = item.productId;
            if (!product || product.isDeleted || !product.isActive || !product.category || !product.category.isActive || product.category.isDeleted) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
                    success: false, 
                    message: `Product ${item.productName} is no longer available.` 
                });
            }
        }

        const receiptId = `rcpt_${Math.floor(100000 + Math.random() * 900000)}`;
        const rzpOrder = await paymentService.createRazorpayOrder(order.remainingAmountPaid, receiptId);

        order.razorpayOrderId = rzpOrder.id;
        await order.save();

        res.status(HTTP_STATUS.OK).json({
            success: true,
            razorpayOrder: rzpOrder,
            razorpayKeyId: process.env.RAZORPAY_KEY_ID,
            user: {
                name: req.user.name,
                email: req.user.email,
                phone: req.user.phone || ''
            }
        });
    } catch (error) {
        console.error("Retry Razorpay Order Controller Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
            success: false, 
            message: "Failed to initiate online payment retry." 
        });
    }
};
