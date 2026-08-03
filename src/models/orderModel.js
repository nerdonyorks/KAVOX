const mongoose = require('mongoose');
const { Schema } = mongoose;

const orderSchema = new Schema({
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  orderId: { 
    type: String, 
    required: true, 
    unique: true 
  },
  shippingAddress: {
    firstName: String,
    lastName: String,
    street: String,
    city: String,
    state: String,
    pincode: String,
    mobile: String
  },
  items: [{
    productId: { 
      type: Schema.Types.ObjectId, 
      ref: 'Product', 
      required: true 
    },
    variantId: { 
      type: Schema.Types.ObjectId 
    },
    productName: { type: String, required: true },
    size: { type: String },
    color: { type: String },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
    mrp: { type: Number },
    totalPrice: { type: Number, required: true },
    itemStatus: {
      type: String,
      enum: ['Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Requested', 'Return Approved', 'Return Rejected', 'Returned'],
      default: 'Processing'
    },
    cancellationReason: { type: String },
    returnReason: { type: String }
  }],
  pricing: {
    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    shipping: { type: Number, default: 0 },
    total: { type: Number, required: true }
  },
  paymentMethod: { 
    type: String, 
    enum: ['COD', 'RAZORPAY', 'WALLET'], 
    required: true 
  },
  paymentStatus: { 
    type: String, 
    enum: ['Pending', 'Completed', 'Failed'], 
    default: 'Pending' 
  },
  orderStatus: { 
    type: String, 
    enum: ['Processing', 'Partially Shipped', 'Shipped', 'Partially Delivered', 'Delivered', 'Cancelled', 'Return Requested', 'Returned', 'Payment Pending', 'Payment Failed'], 
    default: 'Processing' 
  },
  cancellationReason: { type: String },
  returnReason: { type: String },
  couponApplied: { type: String },
  couponCode: { type: String },
  couponDiscount: { type: Number, default: 0 },
  couponDetails: {
    code: { type: String },
    discountType: { type: String, enum: ['percentage', 'fixed'] },
    discountValue: { type: Number },
    discountAmount: { type: Number },
    originalSubtotal: { type: Number },
    finalTotal: { type: Number },
    savedAmount: { type: Number }
  },
  razorpayOrderId: { type: String },
  razorpayPaymentId: { type: String },
  transactionDate: { type: Date },
  walletAmountUsed: { type: Number, default: 0 },
  remainingAmountPaid: { type: Number, default: 0 },
  refundStatus: { type: String, enum: ['N/A', 'Pending', 'Completed'], default: 'N/A' },
  refundAmount: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
