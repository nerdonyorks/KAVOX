const walletService = require("../services/walletService");
const WalletTransaction = require("../models/walletTransaction");
const Wallet = require("../models/wallet");
const User = require("../models/userModel");
const { HTTP_STATUS } = require("../utils/constants");

/**
 * Renders the user wallet dashboard view.
 */
exports.renderWalletDashboard = async (req, res) => {
  try {
    const userId = req.user._id;
    const wallet = await walletService.getWallet(userId);

    // Fetch transactions history sorted by latest first
    const transactions = await WalletTransaction.find({ userId })
      .sort({ createdAt: -1 })
      .lean();

    const Order = require("../models/orderModel");
    const orders = await Order.find({ userId }).select("orderId _id").lean();
    const orderMap = {};
    orders.forEach(o => {
      orderMap[o.orderId] = o._id;
    });

    transactions.forEach(tx => {
      if (tx.orderId && orderMap[tx.orderId]) {
        tx.orderDocId = orderMap[tx.orderId];
      }
    });

    res.render("user/wallet", {
      title: "My Wallet - KAVOX",
      wallet,
      transactions
    });
  } catch (error) {
    console.error("renderWalletDashboard Controller Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render("user/error", {
      message: "Failed to load wallet dashboard."
    });
  }
};

/**
 * Returns user wallet details and history in standardized API format.
 */
exports.getWalletDetailsAPI = async (req, res) => {
  try {
    const userId = req.user._id;
    const wallet = await walletService.getWallet(userId);
    const transactions = await WalletTransaction.find({ userId }).sort({ createdAt: -1 }).lean();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      wallet,
      transactions
    });
  } catch (error) {
    console.error("getWalletDetailsAPI Controller Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
      success: false, 
      message: "Failed to retrieve wallet information." 
    });
  }
};

/**
 * Renders admin wallets listing panel.
 */
exports.renderAdminWallets = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    let filter = {};
    if (req.query.search) {
      const searchRegex = { $regex: req.query.search, $options: 'i' };
      const matchedUsers = await User.find({ $or: [{ name: searchRegex }, { email: searchRegex }] }).select('_id');
      filter = { userId: { $in: matchedUsers.map(u => u._id) } };
    }

    const totalWallets = await Wallet.countDocuments(filter);
    const totalPages = Math.ceil(totalWallets / limit) || 1;

    const wallets = await Wallet.find(filter)
      .populate("userId", "name email phone")
      .skip(skip)
      .limit(limit)
      .lean();

    // Support AJAX JSON response or standard EJS render
    const isAjax = req.accepts('json') && !req.accepts('html');
    if (isAjax) {
      return res.json({ success: true, wallets, currentPage: page, totalPages });
    }

    res.render("admin/wallets", {
      title: "Wallet Management - KAVOX Admin",
      wallets,
      currentPage: page,
      totalPages,
      searchQuery: req.query.search || ''
    });
  } catch (error) {
    console.error("renderAdminWallets Controller Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send("Failed to load wallets admin panel.");
  }
};

/**
 * Renders transactions details ledger of a specific user.
 */
exports.renderAdminWalletDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).send("User not found.");
    }

    const wallet = await walletService.getWallet(userId);
    const transactions = await WalletTransaction.find({ userId }).sort({ createdAt: -1 }).lean();

    const Order = require("../models/orderModel");
    const orders = await Order.find({ userId }).select("orderId _id").lean();
    const orderMap = {};
    orders.forEach(o => {
      orderMap[o.orderId] = o._id;
    });

    transactions.forEach(tx => {
      if (tx.orderId && orderMap[tx.orderId]) {
        tx.orderDocId = orderMap[tx.orderId];
      }
    });

    res.render("admin/wallet-details", {
      title: `Wallet Details: ${user.name}`,
      targetUser: user,
      wallet,
      transactions
    });
  } catch (error) {
    console.error("renderAdminWalletDetails Controller Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send("Failed to load admin user wallet details.");
  }
};

/**
 * Handles admin manual wallet adjustments (credits / debits).
 */
exports.adjustWalletBalance = async (req, res) => {
  try {
    const { userId, amount, type, reason } = req.body;

    if (!userId || !amount || !type || !reason) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
        success: false, 
        message: "Missing parameter fields. Adjustment amount, type, and reason are required." 
      });
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
        success: false, 
        message: "Invalid amount. Must be a number greater than 0." 
      });
    }

    if (type !== "CREDIT" && type !== "DEBIT") {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
        success: false, 
        message: "Invalid transaction type. Must be CREDIT or DEBIT." 
      });
    }

    let updatedWallet;
    if (type === "CREDIT") {
      updatedWallet = await walletService.creditWallet(userId, numericAmount, "ADMIN_ADJUSTMENT", reason);
    } else {
      updatedWallet = await walletService.debitWallet(userId, numericAmount, "ADMIN_ADJUSTMENT", reason);
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Successfully adjusted balance by ${type === "CREDIT" ? "+" : "-"}₹${numericAmount}.`,
      wallet: updatedWallet
    });
  } catch (error) {
    console.error("adjustWalletBalance Controller Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
      success: false, 
      message: error.message || "Failed to adjust wallet balance." 
    });
  }
};
