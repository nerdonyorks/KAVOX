const razorpay = require("../config/razorpay");
const crypto = require("crypto");

class PaymentService {
    /**
     * Creates a new Razorpay order on their servers.
     * @param {Number} amount - Amount in INR (will be converted to paisa internally)
     * @param {String} receipt - Unique receipt identifier
     * @returns {Promise<Object>} Razorpay order details
     */
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

    /**
     * Verifies the authenticity of Razorpay signature using SHA256 HMAC.
     * @param {String} orderId - Razorpay order ID
     * @param {String} paymentId - Razorpay payment ID
     * @param {String} signature - Razorpay payment signature
     * @returns {Boolean} True if verified, false otherwise
     */
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

    /**
     * Fetches details of a specific Razorpay order.
     * @param {String} orderId - Razorpay order ID
     * @returns {Promise<Object>} Razorpay order details
     */
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
