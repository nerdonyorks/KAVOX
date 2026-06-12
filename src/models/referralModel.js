const mongoose = require("mongoose");
const { Schema } = mongoose;

const referralSchema = new Schema({
  referrerId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  referredId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  rewardAmount: {
    type: Number,
    required: true
  },
  rewardDate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ["Pending", "Completed", "Failed"],
    default: "Completed"
  }
}, { timestamps: true });

module.exports = mongoose.model("Referral", referralSchema);
