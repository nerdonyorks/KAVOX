const mongoose = require('mongoose');

const { Schema, ObjectId } = mongoose;

const OrdersSchema = new Schema({
  Shipping_adress: {
     Addressline: { type: String },
     City: { type: String },
     Name: { type: String },
     Phone: { type: String },
     Pin: { type: String },
     State: { type: String },
  },
  UpdatedAt: { type: Timestamp },
  Order_id: { type: String, required: true },
  User_id: { type: Schema.Types.ObjectId, required: true },
  CreatedAt: { type: Timestamp },
  Items: [{
     Item_total: { type: Decimal128, required: true },
     Product_id: { type: Schema.Types.ObjectId, required: true },
     Product_name: { type: String, required: true },
     Qty: { type: Number, required: true },
     Unit_price: { type: Decimal128, required: true },
     Varient_id: { type: Schema.Types.ObjectId, required: true },
  }],
  Discount: { type: Decimal128 },
  Payment_id: { type: Schema.Types.ObjectId, required: true },
  Delivery: { type: Decimal128 },
  Grand_total: { type: String, required: true },
  Delivery_charge: { type: Decimal128 },
  Items_total: { type: Decimal128, required: true },
  Status: { type: String },
  Payment_status: { type: String, required: true },
});

const Orders = mongoose.model('Orders', OrdersSchema);

export default Orders;

