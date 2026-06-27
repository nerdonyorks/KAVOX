const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");
const { isLoggedIn } = require("../middleware/authMiddleware");

// Route to initiate payment by creating a Razorpay order
router.post("/api/payment/create-order", isLoggedIn, paymentController.createOrder);

// Route to securely verify Razorpay signature and place Mongoose order
router.post("/api/payment/verify-payment", isLoggedIn, paymentController.verifyPayment);

// Route to display payment failure page
router.get("/payment-failure", isLoggedIn, (req, res) => {
    const errorMessage = req.query.error || null;
    res.render("user/payment-failure", { 
        title: "Payment Failed - KAVOX", 
        errorMessage 
    });
});

module.exports = router;
