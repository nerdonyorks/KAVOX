const mongoose = require("mongoose");
const { Schema } = mongoose;

const productOfferSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  productId: {
    type: Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },
  discountPercentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

module.exports = mongoose.model("ProductOffer", productOfferSchema);
