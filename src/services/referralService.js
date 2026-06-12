const User = require("../models/userModel");
const Referral = require("../models/referralModel");
const walletService = require("./walletService");

class ReferralService {
  /**
   * Generates a unique referral code based on the user's name.
   * Format: NAMESUB-RANDOMCHARS
   * @param {String} name - User's full name
   * @returns {Promise<String>} Unique referral code
   */
  async generateUniqueReferralCode(name) {
    const cleanName = name.replace(/[^A-Za-z0-9]/g, "").substring(0, 5).toUpperCase();
    let code = "";
    let isUnique = false;

    while (!isUnique) {
      const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
      code = `${cleanName}-${randomStr}`;
      const exists = await User.findOne({ referralCode: code });
      if (!exists) {
        isUnique = true;
      }
    }
    return code;
  }

  /**
   * Processes a referral claim: validates codes, creates log, and pays out wallet rewards.
   * @param {Object} newUser - Newly registered User mongoose document
   * @param {String} referrerCode - Referrer code entered/submitted
   */
  async processReferral(newUser, referrerCode) {
    if (!referrerCode) return;

    try {
      const referrer = await User.findOne({ referralCode: referrerCode.trim() });
      if (!referrer) {
        console.warn(`[REFERRAL] Invalid referral code submitted: "${referrerCode}"`);
        return;
      }

      // Prevent self-referrals
      if (referrer._id.toString() === newUser._id.toString()) {
        console.warn(`[REFERRAL] Prevented self-referral for user: ${newUser.email}`);
        return;
      }

      // Prevent duplicate claims
      const existingClaim = await Referral.findOne({ referredId: newUser._id });
      if (existingClaim) {
        console.warn(`[REFERRAL] Referral reward already claimed for referred user: ${newUser.email}`);
        return;
      }

      const referrerReward = Number(process.env.REFERRER_REWARD || 150);
      const referredReward = Number(process.env.REFERRED_REWARD || 50);

      // 1. Create Referral record
      const referralLog = new Referral({
        referrerId: referrer._id,
        referredId: newUser._id,
        rewardAmount: referrerReward,
        status: "Completed"
      });
      await referralLog.save();

      // 2. Credit Referrer's Wallet
      await walletService.creditWallet(
        referrer._id,
        referrerReward,
        "REFERRAL_REWARD"
      );

      // 3. Credit Referred User's Wallet (Signup reward)
      await walletService.creditWallet(
        newUser._id,
        referredReward,
        "SIGNUP_REWARD"
      );

      console.log(`[REFERRAL] Referral processed: Referrer ${referrer.email} (+₹${referrerReward}), Referred ${newUser.email} (+₹${referredReward})`);
    } catch (error) {
      console.error("ReferralService processReferral Error:", error);
      throw error;
    }
  }
}

module.exports = new ReferralService();
