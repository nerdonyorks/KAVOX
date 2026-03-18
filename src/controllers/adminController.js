const User = require("../models/userModel");

exports.renderLogin = (req, res) => res.render("admin/login");

exports.loginAdmin = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, error: "Username and password are required" });
    }

    const admin = await User.findOne({ email: username });

    if (!admin) {
        return res.status(401).json({ success: false, error: "Admin not found" });
    }

    if (admin.role !== "admin") {
        return res.status(403).json({ success: false, error: "Access denied: Not an administrator" });
    }

    const isMatch = await admin.comparePassword(password);

    if (!isMatch) {
        return res.status(401).json({ success: false, error: "Invalid password" });
    }

    req.login(admin, (err) => {
        if (err) {
            return res.status(500).json({ success: false, error: "Session creation error" });
        }
        return res.json({ success: true, redirect: "/admin/dashboard" });
    });

  } catch (error) {
    console.error("Admin Login Error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

exports.renderDashboard = (req, res) => res.render("admin/dashboard");

exports.renderUserManagement = async (req, res) => {
  try {
    const { status } = req.query;
    let query = { role: "user" };
    
    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'blocked') {
      query.isActive = false;
    }

    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const totalUsers = await User.countDocuments(query);
    const totalPages = Math.ceil(totalUsers / limit);

    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    // Map data for EJS
    const mappedUsers = users.map(user => ({
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || 'N/A',
        joinedOn: new Date(user.createdAt).toLocaleDateString(),
        blocked: !user.isActive,
        avatar: user.profilePicture || '/images/default-avatar.png'
    }));

    res.render("admin/userManagment", { 
        users: mappedUsers,
        currentFilter: status || 'all',
        currentPage: page,
        totalPages: totalPages,
        totalUsers: totalUsers
    });
  } catch (error) {
    console.error("User fetching error:", error);
    res.status(500).send("Unable to load users");
  }
};

exports.blockUser = async (req, res, next) => {
  try {
    const userId = req.params.id;
    await User.findByIdAndUpdate(userId, { isActive: false });
    res.redirect("/admin/userManagment");
  } catch (error) {
    console.error("Block User Error:", error);
    next(error);
  }
};

exports.unblockUser = async (req, res, next) => {
  try {
    const userId = req.params.id;
    await User.findByIdAndUpdate(userId, { isActive: true });
    res.redirect("/admin/userManagment");
  } catch (error) {
    console.error("Unblock User Error:", error);
    next(error);
  }
};

exports.toggleUserBlock = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);
    
    if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
    }

    user.isActive = !user.isActive;
    await user.save();

    res.json({ 
        success: true, 
        message: user.isActive ? "User unblocked successfully" : "User blocked successfully",
        isBlocked: !user.isActive 
    });
  } catch (error) {
    console.error("Toggle Block Error:", error);
    res.status(500).json({ success: false, message: "Server error toggling block status" });
  }
};

exports.renderUserDetails = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId).lean();
    
    if (!user) {
        return res.status(404).send("User not found");
    }

    // Demo purchase history data
    const orders = [
        { id: "ORD-9923", date: "2026-03-01", total: 4500, status: "Delivered", method: "Razorpay" },
        { id: "ORD-1120", date: "2026-03-10", total: 1299, status: "Processing", method: "COD" },
        { id: "ORD-7281", date: "2026-02-15", total: 2499, status: "Cancelled", method: "Wallet" }
    ];

    res.render("admin/user-details", { user, orders });
  } catch (error) {
    console.error("View User Error:", error);
    next(error);
  }
};
