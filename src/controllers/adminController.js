const User = require("../models/userModel");
const Order = require("../models/orderModel");
const Product = require("../models/productModel");
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

exports.renderDashboard = async (req, res) => {
    try {
        // Calculate Total Revenue
        const revenueAggregation = await Order.aggregate([
            { $match: { orderStatus: 'Delivered' } },
            { $group: { _id: null, total: { $sum: "$pricing.total" } } }
        ]);
        const totalRevenue = revenueAggregation.length > 0 ? revenueAggregation[0].total : 0;

        const totalOrders = await Order.countDocuments();
        const totalCustomers = await User.countDocuments({ role: 'user' });
        const totalProducts = await Product.countDocuments(); // Active + Inactive

        // Low Stock Products — only active, non-deleted products with active variants under 10 stock
        const lowStockProducts = await Product.find({
            isDeleted: false,
            isActive: true,
            'variants.quantity': { $lt: 10 }
        }).populate('category', 'isActive isDeleted').select('name variants images category');

        const lowStockItems = [];
        lowStockProducts.forEach(product => {
            // Skip if category is deleted or inactive
            if (!product.category || product.category.isDeleted || !product.category.isActive) return;

            product.variants.forEach(variant => {
                // Only include active variants that are low stock
                if (variant.isActive && variant.quantity < 10) {
                    lowStockItems.push({
                        id: product._id,
                        name: product.name,
                        size: variant.size,
                        color: variant.color,
                        quantity: variant.quantity,
                        image: (variant.images && variant.images[0]) ? (variant.images[0].url || variant.images[0]) : (product.images && product.images[0] ? (product.images[0].url || product.images[0]) : '/images/placeholder.png')
                    });
                }
            });
        });


        // Recent Orders — exclude cancelled orders
        const recentOrdersData = await Order.find({ orderStatus: { $ne: 'Cancelled' } })
            .populate('userId', 'name')
            .sort({ createdAt: -1 })
            .limit(5);

        const recentOrders = recentOrdersData.map(order => ({
            id: order.orderId,
            customer: order.userId ? order.userId.name : 'Unknown',
            date: new Date(order.createdAt).toLocaleDateString(),
            total: order.pricing.total,
            status: order.orderStatus
        }));

        res.render("admin/dashboard", {
            totalRevenue,
            totalOrders,
            totalCustomers,
            totalProducts,
            lowStockItems,
            orders: recentOrders
        });
    } catch (error) {
        console.error("Dashboard Error:", error);
        res.render("admin/dashboard", {
            totalRevenue: 0, totalOrders: 0, totalCustomers: 0, totalProducts: 0, lowStockItems: [], orders: []
        });
    }
};

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

    // Real purchase history data
    const realOrders = await Order.find({ userId: user._id }).sort({ createdAt: -1 }).lean();
    
    let totalSpent = 0;
    const orders = realOrders.map(order => {
        if (order.orderStatus === 'Delivered') {
            totalSpent += order.pricing.total;
        }
        return {
            id: order.orderId,
            date: new Date(order.createdAt).toLocaleDateString(),
            total: order.pricing.total,
            status: order.orderStatus,
            method: order.paymentMethod
        };
    });

    const analytics = {
        totalOrders: orders.length,
        totalSpent: totalSpent
    };

    res.render("admin/user-details", { user, orders, analytics });
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
