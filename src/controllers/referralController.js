const User = require("../models/userModel");
const Referral = require("../models/referralModel");
const referralService = require("../services/referralService");
const { HTTP_STATUS } = require("../utils/constants");

/**
 * Renders the customer referral portal dashboard.
 */
exports.renderReferralDashboard = async (req, res) => {
  try {
    const userId = req.user._id;
    let user = await User.findById(userId);

    if (!user) {
      return res.redirect("/login");
    }

    // Self-healing fallback: Generate a code if the user doesn't have one
    if (!user.referralCode) {
      const uniqueCode = await referralService.generateUniqueReferralCode(user.name);
      user.referralCode = uniqueCode;
      await user.save();
    }

    // Fetch all referrals tracked under this user
    const referrals = await Referral.find({ referrerId: userId })
      .populate("referredId", "name email")
      .sort({ createdAt: -1 })
      .lean();

    const totalReferrals = referrals.length;
    const totalEarned = referrals.reduce((acc, curr) => {
      if (curr.status === "Completed") {
        return acc + curr.rewardAmount;
      }
      return acc;
    }, 0);

    res.render("user/referral", {
      title: "Invite Friends & Earn - KAVOX",
      referralCode: user.referralCode,
      referrals,
      totalReferrals,
      totalEarned
    });
  } catch (error) {
    console.error("renderReferralDashboard Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render("user/error", {
      message: "Failed to load referral dashboard."
    });
  }
};
