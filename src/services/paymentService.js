const razorpay = require("../config/razorpay");
const crypto = require("crypto");

class PaymentService {

    async createRazorpayOrder(amount, receipt) {
        const options = {
            amount: Math.round(amount * 100), // Convert to paisa
            currency: "INR",
            receipt: receipt
        };
        try {
            return await razorpay.orders.create(options);
        } catch (error) {
            console.error("Razorpay SDK Create Order Error:", error);
            throw error;
        }
    }


    verifySignature(orderId, paymentId, signature) {
        try {
            const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
            hmac.update(orderId + "|" + paymentId);
            const generatedSignature = hmac.digest("hex");
            return generatedSignature === signature;
        } catch (error) {
            console.error("Razorpay Signature Verification Error:", error);
            return false;
        }
    }


    async fetchRazorpayOrder(orderId) {
        try {
            return await razorpay.orders.fetch(orderId);
        } catch (error) {
            console.error("Razorpay SDK Fetch Order Error:", error);
            throw error;
        }
    }
}

module.exports = new PaymentService();
