const Order = require("../models/orderModel");
const ProductOffer = require("../models/productOfferModel");
const CategoryOffer = require("../models/categoryOfferModel");

// Helper to parse local date string to timezone-safe Date object
function parseLocalDate(dateStr, isEndOfDay = false) {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split("-").map(Number);
  if (isEndOfDay) {
    return new Date(year, month - 1, day, 23, 59, 59, 999);
  } else {
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }
}

// Helper to determine the start and end dates based on filter type
function getDateRange(filter, startDate, endDate) {
  const now = new Date();
  let start = new Date();
  let end = new Date();

  switch (filter) {
    case "daily":
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case "weekly":
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case "monthly":
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case "yearly":
      start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case "custom":
      start = parseLocalDate(startDate, false);
      end = parseLocalDate(endDate, true);
      break;
    default:
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
  }

  return { start, end };
}

/**
 * Main sales data retrieval and summary logic.
 * Excludes cancelled, failed, and returned/refunded orders.
 */
async function getSalesReportData(filter, startDate, endDate) {
  const { start, end } = getDateRange(filter, startDate, endDate);

  const query = {
    orderStatus: { $in: ["Delivered", "Partially Delivered"] },
    createdAt: { $gte: start, $lte: end }
  };

  const orders = await Order.find(query)
    .populate({
      path: "items.productId",
      select: "name price category"
    })
    .populate("userId", "name email")
    .sort({ createdAt: -1 })
    .lean();

  // Retrieve all offers overlapping with this range to optimize DB queries
  const [productOffers, categoryOffers] = await Promise.all([
    ProductOffer.find({
      $or: [
        { startDate: { $lte: end }, endDate: { $gte: start } }
      ]
    }).lean(),
    CategoryOffer.find({
      $or: [
        { startDate: { $lte: end }, endDate: { $gte: start } }
      ]
    }).lean()
  ]);

  let totalGrossSales = 0;
  let totalDiscounts = 0;
  let totalCouponDiscounts = 0;
  let totalOfferDiscounts = 0;
  let totalProductOfferDiscounts = 0;
  let totalCategoryOfferDiscounts = 0;
  let totalNetRevenue = 0;

  const processedOrders = [];

  for (const order of orders) {
    // Filter out cancelled, returned, and return approved items
    const activeItems = order.items.filter(item => 
      item.itemStatus !== "Cancelled" && 
      item.itemStatus !== "Returned" && 
      item.itemStatus !== "Return Approved"
    );

    // Skip order if it contains no active/remaining items
    if (activeItems.length === 0) {
      continue;
    }

    const subtotal = order.pricing.subtotal;
    const discount = order.pricing.discount;
    const couponDiscount = order.couponDiscount || 0;
    const total = order.pricing.total;

    totalGrossSales += subtotal;
    totalDiscounts += discount;
    totalCouponDiscounts += couponDiscount;
    totalNetRevenue += total;

    const offerDiscount = Math.max(0, discount - couponDiscount);
    totalOfferDiscounts += offerDiscount;

    let prodOfferDiscount = 0;
    let catOfferDiscount = 0;

    if (offerDiscount > 0) {
      let rawProdSum = 0;
      let rawCatSum = 0;

      activeItems.forEach(item => {
        const date = order.createdAt;

        // Check product offers
        const pOffers = productOffers.filter(o =>
          o.productId.toString() === item.productId?._id?.toString() &&
          o.isActive &&
          o.startDate <= date && o.endDate >= date
        );
        const pPct = pOffers.length > 0 ? Math.max(...pOffers.map(o => o.discountPercentage)) : 0;

        // Check category offers
        let cPct = 0;
        if (item.productId && item.productId.category) {
          const cOffers = categoryOffers.filter(o =>
            o.categoryId.toString() === item.productId.category.toString() &&
            o.isActive &&
            o.startDate <= date && o.endDate >= date
          );
          cPct = cOffers.length > 0 ? Math.max(...cOffers.map(o => o.discountPercentage)) : 0;
        }

        const bestPct = Math.max(pPct, cPct);
        if (bestPct > 0) {
          const itemRawDiscount = item.totalPrice * (bestPct / (100 - bestPct));
          if (pPct >= cPct) {
            rawProdSum += itemRawDiscount;
          } else {
            rawCatSum += itemRawDiscount;
          }
        }
      });

      const totalRawSum = rawProdSum + rawCatSum;
      if (totalRawSum > 0) {
        prodOfferDiscount = Math.round(offerDiscount * (rawProdSum / totalRawSum));
        catOfferDiscount = offerDiscount - prodOfferDiscount;
      } else {
        // Default to Product Offer if no historical record matches
        prodOfferDiscount = offerDiscount;
        catOfferDiscount = 0;
      }
    }

    totalProductOfferDiscounts += prodOfferDiscount;
    totalCategoryOfferDiscounts += catOfferDiscount;

    processedOrders.push({
      orderId: order.orderId,
      date: order.createdAt,
      customer: order.userId ? order.userId.name : (order.shippingAddress ? `${order.shippingAddress.firstName} ${order.shippingAddress.lastName || ''}`.trim() : "Guest"),
      paymentMethod: order.paymentMethod,
      grossAmount: subtotal,
      offerDiscount: offerDiscount,
      prodOfferDiscount,
      catOfferDiscount,
      couponDiscount: couponDiscount,
      finalAmount: total,
      status: order.orderStatus
    });
  }

  return {
    summary: {
      totalOrders: orders.length,
      grossSales: totalGrossSales,
      discounts: totalDiscounts,
      couponDiscounts: totalCouponDiscounts,
      offerDiscounts: totalOfferDiscounts,
      productOfferDiscounts: totalProductOfferDiscounts,
      categoryOfferDiscounts: totalCategoryOfferDiscounts,
      netRevenue: totalNetRevenue
    },
    orders: processedOrders,
    dateRange: { start, end }
  };
}

/**
 * Analytics and trends groupings.
 */
async function getAnalyticsData(filter, startDate, endDate) {
  const reportData = await getSalesReportData(filter, startDate, endDate);
  const { orders } = reportData;

  // 1. Group Trends (Daily / Monthly buckets)
  const trendMap = {};
  orders.forEach(o => {
    const d = new Date(o.date);
    let key;
    if (filter === "yearly") {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    } else {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    if (!trendMap[key]) {
      trendMap[key] = { sales: 0, orders: 0 };
    }
    trendMap[key].sales += o.finalAmount;
    trendMap[key].orders += 1;
  });

  // Sort trend keys chronologically
  const sortedKeys = Object.keys(trendMap).sort();
  const salesTrend = sortedKeys.map(k => ({ label: k, value: trendMap[k].sales }));
  const orderTrend = sortedKeys.map(k => ({ label: k, value: trendMap[k].orders }));

  // 2. Payment Method Distribution
  const paymentDist = { COD: 0, RAZORPAY: 0, WALLET: 0 };
  orders.forEach(o => {
    const method = o.paymentMethod.toUpperCase();
    if (paymentDist[method] !== undefined) {
      paymentDist[method]++;
    }
  });

  const paymentData = Object.keys(paymentDist).map(k => ({
    label: k === "RAZORPAY" ? "Online" : k,
    value: paymentDist[k]
  }));

  return {
    summary: reportData.summary,
    salesTrend,
    orderTrend,
    paymentData
  };
}

module.exports = {
  getDateRange,
  getSalesReportData,
  getAnalyticsData
};
