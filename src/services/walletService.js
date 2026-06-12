const Wallet = require("../models/wallet");
const WalletTransaction = require("../models/walletTransaction");

class WalletService {
  /**
   * Fetches or creates a user's wallet.
   * @param {String} userId - Mongoose ObjectId
   * @returns {Promise<Object>} The wallet document
   */
  async getWallet(userId) {
    try {
      let wallet = await Wallet.findOne({ userId });
      if (!wallet) {
        wallet = new Wallet({ userId, balance: 0, totalCredits: 0, totalDebits: 0 });
        await wallet.save();
      }
      return wallet;
    } catch (error) {
      console.error("WalletService getWallet Error:", error);
      throw error;
    }
  }

  /**
   * Atomically credits a user's wallet and logs a credit transaction.
   * @param {String} userId - User ID
   * @param {Number} amount - Amount in INR
   * @param {String} description - Description enum
   * @param {String} orderId - Reference Order ID (optional)
   * @returns {Promise<Object>} Updated wallet document
   */
  async creditWallet(userId, amount, description, orderId = null) {
    if (amount <= 0) throw new Error("Credit amount must be greater than zero.");
    
    try {
      // Perform atomic update to prevent race conditions
      const wallet = await Wallet.findOneAndUpdate(
        { userId },
        { 
          $inc: { 
            balance: Number(amount), 
            totalCredits: Number(amount) 
          } 
        },
        { new: true, upsert: true }
      );

      // Create transaction record
      const transaction = new WalletTransaction({
        userId,
        amount,
        type: "CREDIT",
        description,
        orderId,
        status: "Completed"
      });
      await transaction.save();

      return wallet;
    } catch (error) {
      console.error("WalletService creditWallet Error:", error);
      throw error;
    }
  }

  /**
   * Atomically debits a user's wallet if balance is sufficient, and logs a debit transaction.
   * @param {String} userId - User ID
   * @param {Number} amount - Amount to deduct
   * @param {String} description - Description enum
   * @param {String} orderId - Reference Order ID (optional)
   * @returns {Promise<Object>} Updated wallet document
   */
  async debitWallet(userId, amount, description, orderId = null) {
    if (amount <= 0) throw new Error("Debit amount must be greater than zero.");

    try {
      // Atomic query check: only update if balance is >= amount
      const wallet = await Wallet.findOneAndUpdate(
        { userId, balance: { $gte: amount } },
        { 
          $inc: { 
            balance: -Number(amount), 
            totalDebits: Number(amount) 
          } 
        },
        { new: true }
      );

      if (!wallet) {
        throw new Error("Insufficient wallet balance.");
      }

      // Create transaction record
      const transaction = new WalletTransaction({
        userId,
        amount,
        type: "DEBIT",
        description,
        orderId,
        status: "Completed"
      });
      await transaction.save();

      return wallet;
    } catch (error) {
      console.error("WalletService debitWallet Error:", error);
      throw error;
    }
  }

  /**
   * Verifies if a user has sufficient balance.
   * @param {String} userId - User ID
   * @param {Number} amount - Amount to verify
   * @returns {Promise<Boolean>} True if sufficient, false otherwise
   */
  async verifyWalletBalance(userId, amount) {
    try {
      const wallet = await Wallet.findOne({ userId });
      return wallet && wallet.balance >= amount;
    } catch (error) {
      console.error("WalletService verifyWalletBalance Error:", error);
      return false;
    }
  }
}

module.exports = new WalletService();
