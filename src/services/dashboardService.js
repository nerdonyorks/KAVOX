const Order = require("../models/orderModel");
const User = require("../models/userModel");
const Product = require("../models/productModel");
const Review = require("../models/reviewModel");
const { getDateRange } = require("./reportService");

/**
 * Get KPI cards summary statistics
 */
async function getDashboardSummary(filter, startDate, endDate) {
  const { start, end } = getDateRange(filter, startDate, endDate);

  // Delivered and Completed orders aggregation
  const statsAggregation = await Order.aggregate([
    {
      $match: {
        orderStatus: "Delivered",
        createdAt: { $gte: start, $lte: end }
      }
    },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        grossRevenue: { $sum: "$pricing.subtotal" },
        netRevenue: { $sum: "$pricing.total" },
        totalDiscounts: { $sum: "$pricing.discount" },
        totalCoupons: { $sum: { $ifNull: ["$couponDiscount", 0] } },
        totalProductsSold: {
          $sum: {
            $sum: "$items.quantity"
          }
        }
      }
    }
  ]);

  const stats = statsAggregation[0] || {
    totalOrders: 0,
    grossRevenue: 0,
    netRevenue: 0,
    totalDiscounts: 0,
    totalCoupons: 0,
    totalProductsSold: 0
  };

  // Customers count is typically system-wide
  const registeredCustomers = await User.countDocuments({ role: "user" });

  const totalReviews = await Review.countDocuments({ isDeleted: false });
  const avgRatingAggregation = await Product.aggregate([
    { $match: { isDeleted: false, totalReviews: { $gt: 0 } } },
    { $group: { _id: null, avgRating: { $avg: "$averageRating" } } }
  ]);
  const averageProductRating = avgRatingAggregation[0] ? Math.round(avgRatingAggregation[0].avgRating * 10) / 10 : 0;

  return {
    totalRevenue: stats.grossRevenue, // Gross Sales
    totalOrders: stats.totalOrders,
    registeredCustomers,
    totalProductsSold: stats.totalProductsSold,
    totalDiscountsGiven: stats.totalDiscounts,
    netRevenue: stats.netRevenue,
    offersDiscount: stats.totalDiscounts - stats.totalCoupons,
    couponsDiscount: stats.totalCoupons,
    totalReviews,
    averageProductRating
  };
}

/**
 * Get revenue and order trends grouped by time intervals
 */
async function getSalesAnalytics(filter, startDate, endDate) {
  const { start, end } = getDateRange(filter, startDate, endDate);

  const orders = await Order.find({
    orderStatus: "Delivered",
    createdAt: { $gte: start, $lte: end }
  })
    .sort({ createdAt: 1 })
    .lean();

  const trendMap = {};

  orders.forEach(order => {
    const d = new Date(order.createdAt);
    let key;

    if (filter === "daily") {
      // Group by hour: e.g. "09:00"
      const hour = d.getHours();
      key = `${String(hour).padStart(2, "0")}:00`;
    } else if (filter === "weekly") {
      // Group by day of week: e.g. "Mon"
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      key = days[d.getDay()];
    } else if (filter === "yearly") {
      // Group by month of year: e.g. "Jan"
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      key = months[d.getMonth()];
    } else if (filter === "custom") {
      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays <= 2) {
        key = `${String(d.getHours()).padStart(2, "0")}:00`;
      } else if (diffDays <= 60) {
        key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      } else {
        key = d.toLocaleDateString("en-US", { year: "numeric", month: "short" });
      }
    } else {
      // Monthly (Default) -> Group by day number: e.g. "Jun 12"
      key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }

    if (!trendMap[key]) {
      trendMap[key] = { sales: 0, orders: 0 };
    }
    trendMap[key].sales += order.pricing.total; // Net Revenue
    trendMap[key].orders += 1;
  });

  // Convert map to array structure for Chart.js
  const labels = Object.keys(trendMap);
  const salesData = labels.map(l => trendMap[l].sales);
  const ordersData = labels.map(l => trendMap[l].orders);

  return {
    labels,
    salesData,
    ordersData
  };
}

/**
 * Top 10 Best Selling Products
 */
async function getTopProducts(limit = 10, filter = "monthly", startDate = null, endDate = null) {
  const { start, end } = getDateRange(filter, startDate, endDate);

  const topProducts = await Order.aggregate([
    {
      $match: {
        orderStatus: "Delivered",
        createdAt: { $gte: start, $lte: end }
      }
    },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.productId",
        productName: { $first: "$items.productName" },
        totalQuantitySold: { $sum: "$items.quantity" },
        revenueGenerated: { $sum: "$items.totalPrice" }
      }
    },
    { $sort: { totalQuantitySold: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "productDetails"
      }
    },
    {
      $project: {
        _id: 1,
        productName: 1,
        totalQuantitySold: 1,
        revenueGenerated: 1,
        productDetails: { $arrayElemAt: ["$productDetails", 0] }
      }
    }
  ]);

  return topProducts.map(p => {
    let imgUrl = "/images/placeholder.png";
    if (p.productDetails && p.productDetails.images && p.productDetails.images.length > 0) {
      imgUrl = p.productDetails.images[0].url || p.productDetails.images[0];
    }
    return {
      productId: p._id,
      productName: p.productName,
      totalQuantitySold: p.totalQuantitySold,
      revenueGenerated: p.revenueGenerated,
      image: imgUrl,
      brand: (p.productDetails && p.productDetails.brand) ? p.productDetails.brand : "KAVOX"
    };
  });
}

/**
 * Top 10 Best Selling Categories
 */
async function getTopCategories(limit = 10, filter = "monthly", startDate = null, endDate = null) {
  const { start, end } = getDateRange(filter, startDate, endDate);

  const topCategories = await Order.aggregate([
    {
      $match: {
        orderStatus: "Delivered",
        createdAt: { $gte: start, $lte: end }
      }
    },
    { $unwind: "$items" },
    {
      $lookup: {
        from: "products",
        localField: "items.productId",
        foreignField: "_id",
        as: "productInfo"
      }
    },
    { $unwind: "$productInfo" },
    {
      $group: {
        _id: "$productInfo.category",
        totalQuantitySold: { $sum: "$items.quantity" },
        revenueGenerated: { $sum: "$items.totalPrice" }
      }
    },
    { $sort: { totalQuantitySold: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "categories",
        localField: "_id",
        foreignField: "_id",
        as: "categoryDetails"
      }
    },
    {
      $project: {
        _id: 1,
        categoryName: { $arrayElemAt: ["$categoryDetails.name", 0] },
        totalQuantitySold: 1,
        revenueGenerated: 1
      }
    }
  ]);

  return topCategories.map(c => ({
    categoryId: c._id,
    categoryName: c.categoryName || "Uncategorized",
    totalQuantitySold: c.totalQuantitySold,
    revenueGenerated: c.revenueGenerated
  }));
}

/**
 * Top 10 Best Selling Brands
 */
async function getTopBrands(limit = 10, filter = "monthly", startDate = null, endDate = null) {
  const { start, end } = getDateRange(filter, startDate, endDate);

  const topBrands = await Order.aggregate([
    {
      $match: {
        orderStatus: "Delivered",
        createdAt: { $gte: start, $lte: end }
      }
    },
    { $unwind: "$items" },
    {
      $lookup: {
        from: "products",
        localField: "items.productId",
        foreignField: "_id",
        as: "productInfo"
      }
    },
    { $unwind: "$productInfo" },
    {
      $group: {
        _id: { $ifNull: ["$productInfo.brand", "KAVOX"] },
        totalQuantitySold: { $sum: "$items.quantity" },
        revenueGenerated: { $sum: "$items.totalPrice" }
      }
    },
    { $sort: { totalQuantitySold: -1 } },
    { $limit: limit },
    {
      $project: {
        brandName: "$_id",
        totalQuantitySold: 1,
        revenueGenerated: 1
      }
    }
  ]);

  return topBrands.map(b => ({
    brandName: b.brandName,
    totalQuantitySold: b.totalQuantitySold,
    revenueGenerated: b.revenueGenerated
  }));
}

/**
 * Get Top Rated Products
 */
async function getTopRatedProducts(limit = 5, filter = "monthly", startDate = null, endDate = null) {
  const products = await Product.find({ isDeleted: false, totalReviews: { $gt: 0 } })
    .sort({ averageRating: -1, totalReviews: -1 })
    .limit(limit)
    .lean();

  return products.map(p => {
    let imgUrl = "/images/placeholder.png";
    if (p.images && p.images.length > 0) {
      imgUrl = p.images[0].url || p.images[0];
    }
    return {
      productId: p._id,
      productName: p.name,
      averageRating: p.averageRating,
      totalReviews: p.totalReviews,
      image: imgUrl,
      brand: p.brand || "KAVOX"
    };
  });
}

/**
 * Get Lowest Rated Products
 */
async function getLowestRatedProducts(limit = 5, filter = "monthly", startDate = null, endDate = null) {
  const products = await Product.find({ isDeleted: false, totalReviews: { $gt: 0 } })
    .sort({ averageRating: 1, totalReviews: -1 })
    .limit(limit)
    .lean();

  return products.map(p => {
    let imgUrl = "/images/placeholder.png";
    if (p.images && p.images.length > 0) {
      imgUrl = p.images[0].url || p.images[0];
    }
    return {
      productId: p._id,
      productName: p.name,
      averageRating: p.averageRating,
      totalReviews: p.totalReviews,
      image: imgUrl,
      brand: p.brand || "KAVOX"
    };
  });
}

module.exports = {
  getDashboardSummary,
  getSalesAnalytics,
  getTopProducts,
  getTopCategories,
  getTopBrands,
  getTopRatedProducts,
  getLowestRatedProducts
};
