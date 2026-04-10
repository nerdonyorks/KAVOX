const User = require("../models/userModel");
const { HTTP_STATUS, MESSAGES } = require("../utils/constants");

exports.renderLogin = (req, res) => {
    let error = req.query.error;
    if (error === 'admin_via_google') {
        error = MESSAGES.ADMIN_VIA_USER_PORTAL;
    }
    res.render("admin/login", { error });
};

exports.loginAdmin = async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log(`[AUTH] Admin login attempt for: ${username}`);

    if (!username || !password) {
        console.log(`[AUTH] Missing credentials for admin login`);
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, error: MESSAGES.REQUIRED_FIELDS_MISSING });
    }

    const admin = await User.findOne({ email: username });

    if (!admin) {
        console.log(`[AUTH] Admin user not found: ${username}`);
        return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, error: MESSAGES.ADMIN_LOGIN_ERROR });
    }

    if (admin.role !== "admin") {
        console.log(`[AUTH] Unauthorized role attempt: ${admin.role} for ${username}`);
        return res.status(HTTP_STATUS.FORBIDDEN).json({ success: false, error: MESSAGES.ADMIN_ONLY });
    }

    const isMatch = await admin.comparePassword(password);
    console.log(`[AUTH] Password match result for ${username}: ${isMatch}`);

    if (!isMatch) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, error: MESSAGES.ADMIN_LOGIN_ERROR });
    }

    req.login(admin, (err) => {
        if (err) {
            console.error(`[AUTH] Passport login error for ${username}:`, err);
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, error: MESSAGES.INTERNAL_LOGIN_ERROR });
        }
        
        req.session.save((err) => {
            if (err) {
                console.error(`[AUTH] Session save error for ${username}:`, err);
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, error: MESSAGES.SESSION_SAVE_ERROR });
            }
            console.log(`[AUTH] Admin session established for: ${username}`);
            return res.json({ success: true, redirect: "/admin/dashboard" });
        });
    });

  } catch (error) {
    console.error("[AUTH] Fatal Admin Login Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, error: MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

exports.renderDashboard = (req, res) => res.render("admin/dashboard");

exports.renderUserManagement = async (req, res) => {
  try {
    const { status, search } = req.query;
    let query = { role: "user" };
    
    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'blocked') {
      query.isActive = false;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    //pagination
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

    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.json({ 
        success: true, 
        users: mappedUsers, 
        totalPages, 
        currentPage: page, 
        totalUsers 
      });
    }

    res.render("admin/userManagment", { 
        users: mappedUsers,
        currentFilter: status || 'all',
        currentPage: page,
        totalPages: totalPages,
        totalUsers: totalUsers,
        searchQuery: search || ''
    });
  } catch (error) {
    console.error("User fetching error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send(MESSAGES.USERS_LOAD_FAILED);
  }
};

exports.blockUser = async (req, res, next) => {
  try {
    const userId = req.params.id;
    await User.findByIdAndUpdate(userId, { isActive: false });
    
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(HTTP_STATUS.OK).json({ success: true, message: MESSAGES.USER_BLOCKED });
    }
    res.redirect("/admin/users");
  } catch (error) {
    console.error("Block User Error:", error);
    next(error);
  }
};

exports.unblockUser = async (req, res, next) => {
  try {
    const userId = req.params.id;
    await User.findByIdAndUpdate(userId, { isActive: true });
    
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(HTTP_STATUS.OK).json({ success: true, message: MESSAGES.USER_UNBLOCKED });
    }
    res.redirect("/admin/users");
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
        return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: MESSAGES.USER_NOT_FOUND });
    }

    user.isActive = !user.isActive;
    await user.save();

    res.status(HTTP_STATUS.OK).json({ 
        success: true, 
        message: user.isActive ? MESSAGES.USER_UNBLOCKED : MESSAGES.USER_BLOCKED,
        isBlocked: !user.isActive 
    });
  } catch (error) {
    console.error("Toggle Block Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGES.TOGGLE_BLOCK_ERROR });
  }
};

exports.renderUserDetails = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId).lean();
    
    if (!user) {
        return res.status(HTTP_STATUS.NOT_FOUND).send(MESSAGES.USER_NOT_FOUND);
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

exports.logoutAdmin = (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error("Admin Logout Error:", err);
            return res.redirect("/admin/dashboard");
        }
        req.session.destroy((err) => {
            if (err) {
                console.error("Admin Session Destroy Error:", err);
            }
            res.clearCookie('admin_sid');
            res.redirect("/admin/login");
        });
    });
};
