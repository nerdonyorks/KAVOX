const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");
const { isLoggedIn } = require("../middleware/authMiddleware");

// Route to initiate payment by creating a Razorpay order
router.post("/api/payment/create-order", isLoggedIn, paymentController.createOrder);

// Route to securely verify Razorpay signature and place Mongoose order
router.post("/api/payment/verify-payment", isLoggedIn, paymentController.verifyPayment);

// Route to retry payment for a failed Razorpay order
router.post("/api/payment/retry-order", isLoggedIn, paymentController.retryOrder);

// Route to display payment failure page
router.get("/payment-failure", isLoggedIn, async (req, res) => {
    const errorMessage = req.query.error || null;
    const orderId = req.query.orderId || null;
    
    try {
        if (orderId) {
            const Order = require("../models/orderModel");
            const order = await Order.findOne({ _id: orderId, userId: req.user._id });
            if (order && order.paymentStatus !== 'Completed') {
                order.paymentStatus = 'Failed';
                order.orderStatus = 'Payment Failed';
                
                // Restore reserved wallet amount if applicable
                if (order.walletAmountUsed > 0) {
                    const walletService = require("../services/walletService");
                    await walletService.creditWallet(req.user._id, order.walletAmountUsed, 'WALLET_PAYMENT_REFUND', order.orderId);
                    
                    // Reset remainingAmountPaid to full amount since wallet is refunded
                    order.remainingAmountPaid = order.pricing.total;
                    order.walletAmountUsed = 0;
                }
                
                await order.save();
                console.log(`[PAYMENT] Order ${order.orderId} marked as Payment Failed. Wallet amount refunded if applicable.`);
            }
        }
    } catch (error) {
        console.error("Error handling payment failure logic:", error);
    }

    res.render("user/payment-failure", { 
        title: "Payment Failed - KAVOX", 
        errorMessage,
        orderId 
    });
});

module.exports = router;
