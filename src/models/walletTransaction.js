const mongoose = require("mongoose");
const { Schema } = mongoose;

const walletTransactionSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    enum: ["CREDIT", "DEBIT"],
    required: true
  },
  description: {
    type: String,
    enum: ["ORDER_CANCELLATION_REFUND", "RETURN_REFUND", "WALLET_PAYMENT", "ADMIN_ADJUSTMENT", "REFERRAL_REWARD", "SIGNUP_REWARD"],
    required: true
  },
  orderId: {
    type: String, // ODR-xxxxxxx
    default: null
  },
  status: {
    type: String,
    enum: ["Pending", "Completed", "Failed"],
    default: "Completed"
  }
}, { timestamps: true });

module.exports = mongoose.model("WalletTransaction", walletTransactionSchema);
