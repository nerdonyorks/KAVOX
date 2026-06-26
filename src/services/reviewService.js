const mongoose = require("mongoose");
const Order = require("../models/orderModel");
const Review = require("../models/reviewModel");
const Product = require("../models/productModel");

async function verifyUserPurchase(userId, productId) {
  if (!userId || !productId) return false;

  const order = await Order.findOne({
    userId: userId,
    items: {
      $elemMatch: {
        productId: productId,
        itemStatus: "Delivered"
      }
    }
  });

  return !!order;
}


async function recalculateProductRating(productId) {
  if (!productId) return;

  try {
    const stats = await Review.aggregate([
      {
        $match: {
          productId: new mongoose.Types.ObjectId(productId),
          status: "APPROVED",
          isDeleted: false
        }
      },
      {
        $group: {
          _id: "$productId",
          averageRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 }
        }
      }
    ]);

    if (stats && stats.length > 0) {
      const average = Math.round(stats[0].averageRating * 10) / 10; // Round to 1 decimal place
      await Product.findByIdAndUpdate(productId, {
        averageRating: average,
        totalReviews: stats[0].totalReviews
      });
    } else {
      await Product.findByIdAndUpdate(productId, {
        averageRating: 0,
        totalReviews: 0
      });
    }
  } catch (error) {
    console.error("Recalculate Product Rating Error:", error);
  }
}

module.exports = {
  verifyUserPurchase,
  recalculateProductRating
};
