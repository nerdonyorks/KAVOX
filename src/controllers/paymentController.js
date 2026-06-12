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
        console.error("Create Razorpay Order Controller Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
            success: false, 
            message: "Failed to initiate online payment." 
        });
    }
};

/**
 * Verifies Razorpay payment signature, fetches order from Razorpay to prevent tampering,
 * and creates order in Mongoose database.
 */
exports.verifyPayment = async (req, res) => {
    try {
        const userId = req.user._id;
        const { razorpayOrderId, razorpayPaymentId, razorpaySignature, addressId, useWallet } = req.body;

        if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !addressId) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
                success: false, 
                message: "Payment credentials and shipping address are required." 
            });
        }

        // 1. Prevent duplicate order creation on multiple clicks
        const existingOrder = await Order.findOne({ razorpayPaymentId });
        if (existingOrder) {
            console.log(`[PAYMENT] Duplicate payment verification request bypassed for paymentId: ${razorpayPaymentId}`);
            return res.status(HTTP_STATUS.OK).json({
                success: true,
                message: "Order already processed successfully.",
                orderId: existingOrder.orderId,
                amountPaid: existingOrder.pricing.total
            });
        }

        // 2. Verify payment signature securely using HMAC SHA256
        const isSignatureValid = paymentService.verifySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
        if (!isSignatureValid) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
                success: false, 
                message: "Payment verification failed. Security signature mismatch." 
            });
        }

        // 3. Fetch Razorpay order details to prevent client-side payment tampering (validate amount)
        const rzpOrder = await paymentService.fetchRazorpayOrder(razorpayOrderId);
        
        const cart = await Cart.findOne({ userId }).populate({
            path: "items.productId",
            populate: { path: "category" }
        });

        if (!cart || cart.items.length === 0) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
                success: false, 
                message: "Cart is empty. Order may already have been processed." 
            });
        }

        // Populate active offers first
        if (cart.items.length > 0) {
            const products = cart.items.map(item => item.productId).filter(Boolean);
            await offerService.populateProductOffers(products);
        }

        const summary = getDetailedTotals(cart.items);
        let couponDiscount = 0;
        let appliedCouponCode = "";
        if (req.session.couponCode) {
            const validation = await couponService.validateCoupon(req.session.couponCode, summary.cartTotal, userId);
            if (validation.isValid) {
                couponDiscount = validation.discountAmount;
                appliedCouponCode = validation.coupon.code;
            }
        }

        const expectedTotal = summary.cartTotal - couponDiscount;
        
        // Wallet calculations
        let walletAmountUsed = 0;
        let remainingAmountPaid = expectedTotal;

        const walletService = require("../services/walletService");

        if (useWallet) {
            const wallet = await walletService.getWallet(userId);
            if (wallet.balance > 0) {
                walletAmountUsed = Math.min(wallet.balance, expectedTotal);
                remainingAmountPaid = expectedTotal - walletAmountUsed;
            }
        }

        const remainingTotalInPaisa = Math.round(remainingAmountPaid * 100);

        // Verify amount paid matches remaining expected amount (1 paisa tolerance)
        if (Math.abs(rzpOrder.amount - remainingTotalInPaisa) > 1) {
            console.error(`[PAYMENT_TAMPER] Expected ${remainingTotalInPaisa} paisa, but Razorpay order amount is ${rzpOrder.amount}`);
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
                success: false, 
                message: "Payment validation failed. Total amount mismatch." 
            });
        }

        // 4. Validate stock and deduct inventory
        for (let item of cart.items) {
            const product = item.productId;
            const variant = product.variants.find(v => v.size === item.size && v.color === item.color);
            if (!variant || !variant.isActive || variant.quantity < item.quantity) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
                    success: false, 
                    message: `Insufficient stock for ${product.name} (${item.size}/${item.color}).` 
                });
            }
            variant.quantity -= item.quantity;
            await product.save();
        }

        // Prepare order items
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

        // Perform Wallet deduction if applicable
        if (walletAmountUsed > 0) {
            try {
                await walletService.debitWallet(userId, walletAmountUsed, 'WALLET_PAYMENT', newOrderId);
            } catch (walletError) {
                // Restore stock in case wallet debit fails
                for (let item of cart.items) {
                    const product = item.productId;
                    const variant = product.variants.find(v => v.size === item.size && v.color === item.color);
                    variant.quantity += item.quantity;
                    await product.save();
                }
                return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: walletError.message || "Failed to process wallet payment." });
            }
        }

        // 5. Create Order
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
                total: expectedTotal
            },
            couponCode: appliedCouponCode || undefined,
            couponDiscount: couponDiscount,
            paymentMethod: 'RAZORPAY',
            paymentStatus: 'Completed',
            orderStatus: 'Processing',
            razorpayOrderId: razorpayOrderId,
            razorpayPaymentId: razorpayPaymentId,
            transactionDate: new Date(),
            walletAmountUsed: walletAmountUsed,
            remainingAmountPaid: remainingAmountPaid
        });

        await newOrder.save();

        // Clear coupon code session
        delete req.session.couponCode;

        // Empty user cart
        cart.items = [];
        cart.cartTotal = 0;
        await cart.save();

        res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Payment verified and order placed successfully!",
            orderId: newOrder.orderId,
            amountPaid: newOrder.pricing.total
        });
    } catch (error) {
        console.error("Verify Razorpay Payment Controller Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
            success: false, 
            message: "Failed to complete transaction verification." 
        });
    }
};
