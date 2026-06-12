/**
 * Ledger Book Service
 * ───────────────────
 * Aggregates all financial transactions (Sales, Wallet Payments, Offer Deductions,
 * Coupon Deductions, and Wallet Refunds), chronologically ordering and balancing them.
 */

const Order = require("../models/orderModel");
const WalletTransaction = require("../models/walletTransaction.js");
const { getDateRange } = require("./reportService");

async function getLedgerEntries(filter, startDate, endDate) {
  const { start, end } = getDateRange(filter, startDate, endDate);

  // 1. Fetch Delivered Orders within range
  const orders = await Order.find({
    orderStatus: "Delivered",
    createdAt: { $gte: start, $lte: end }
  }).sort({ createdAt: 1 }).lean();

  // 2. Fetch Wallet Refunds within range
  const refunds = await WalletTransaction.find({
    description: { $in: ["ORDER_CANCELLATION_REFUND", "RETURN_REFUND"] },
    status: "Completed",
    createdAt: { $gte: start, $lte: end }
  }).sort({ createdAt: 1 }).lean();

  const entries = [];

  // 3. Process Order Sales & Deductions
  orders.forEach(order => {
    const orderDate = new Date(order.createdAt);
    const orderId = order.orderId;
    const walletUsed = order.walletAmountUsed || 0;
    const couponDeduction = order.couponDiscount || 0;
    const totalDiscount = order.pricing.discount || 0;
    const offerDeduction = Math.max(0, totalDiscount - couponDeduction);

    // Cash/Online payment portion
    const cashOnlineCredit = order.pricing.total - walletUsed;

    // A. SALE Entry (Cash/Online portion of the sale)
    if (cashOnlineCredit > 0) {
      entries.push({
        date: orderDate,
        type: "SALE (CASH/ONLINE)",
        referenceId: orderId,
        debit: 0,
        credit: cashOnlineCredit
      });
    }

    // B. WALLET_PAYMENT Entry (if wallet was used)
    if (walletUsed > 0) {
      entries.push({
        date: orderDate,
        type: "WALLET PAYMENT",
        referenceId: orderId,
        debit: 0,
        credit: walletUsed
      });
    }

    // C. OFFER_DISCOUNT Entry (Debit)
    if (offerDeduction > 0) {
      entries.push({
        date: orderDate,
        type: "OFFER DISCOUNT",
        referenceId: orderId,
        debit: offerDeduction,
        credit: 0
      });
    }

    // D. COUPON_DISCOUNT Entry (Debit)
    if (couponDeduction > 0) {
      entries.push({
        date: orderDate,
        type: "COUPON DISCOUNT",
        referenceId: orderId,
        debit: couponDeduction,
        credit: 0
      });
    }
  });

  // 4. Process Wallet Refunds
  refunds.forEach(ref => {
    const refundDate = new Date(ref.createdAt);
    entries.push({
      date: refundDate,
      type: ref.description === "ORDER_CANCELLATION_REFUND" ? "REFUND (CANCEL)" : "REFUND (RETURN)",
      referenceId: ref.orderId || "N/A",
      debit: ref.amount,
      credit: 0
    });
  });

  // 5. Sort all entries chronologically by date
  entries.sort((a, b) => a.date.getTime() - b.date.getTime());

  // 6. Compute running balance
  let runningBalance = 0;
  const balancedEntries = entries.map(entry => {
    runningBalance = runningBalance + entry.credit - entry.debit;
    return {
      ...entry,
      balance: runningBalance
    };
  });

  // 7. Calculate ledger totals
  let totalDebit = 0;
  let totalCredit = 0;
  balancedEntries.forEach(e => {
    totalDebit += e.debit;
    totalCredit += e.credit;
  });

  return {
    entries: balancedEntries,
    summary: {
      totalDebit,
      totalCredit,
      closingBalance: runningBalance
    },
    dateRange: { start, end }
  };
}

module.exports = {
  getLedgerEntries
};
