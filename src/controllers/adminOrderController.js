const Order = require("../models/orderModel");
const Product = require("../models/productModel");
const User = require("../models/userModel");
const { HTTP_STATUS } = require("../utils/constants");
const { getCalculatedOrderStatus, updateOrderPricingAndRefund } = require("../utils/orderHelpers");

exports.getAdminOrders = async (req, res) => {
    // AJAX request → return JSON; browser navigation → render page
    const isAjax = req.accepts('json') && !req.accepts('html');

    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        const filter = {};

        if (req.query.status && req.query.status !== 'All') filter.orderStatus = req.query.status;
        if (req.query.paymentStatus && req.query.paymentStatus !== 'All') filter.paymentStatus = req.query.paymentStatus;

        if (req.query.startDate || req.query.endDate) {
            filter.createdAt = {};
            if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
            if (req.query.endDate) {
                const endDate = new Date(req.query.endDate);
                endDate.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = endDate;
            }
        }

        if (req.query.search) {
            const searchRegex = { $regex: req.query.search, $options: 'i' };
            const matchedUsers = await User.find({ $or: [{ name: searchRegex }, { email: searchRegex }] }).select('_id');
            filter.$or = [{ orderId: searchRegex }, { userId: { $in: matchedUsers.map(u => u._id) } }];
        }

        let sortConfig = { createdAt: -1 };
        if (req.query.sort === 'oldest')     sortConfig = { createdAt: 1 };
        if (req.query.sort === 'amountHigh') sortConfig = { 'pricing.total': -1 };
        if (req.query.sort === 'amountLow')  sortConfig = { 'pricing.total': 1 };

        const totalOrders = await Order.countDocuments(filter);
        const totalPages  = Math.ceil(totalOrders / limit) || 1;

        const orders = await Order.find(filter)
            .populate('userId', 'name email phone')
            .sort(sortConfig)
            .skip(skip)
            .limit(limit)
            .lean();

        if (isAjax) {
            return res.json({ success: true, orders, currentPage: page, totalPages });
        }

        res.render("admin/orders", {
            title: "Manage Orders - KAVOX Admin",
            orders,
            currentPage: page,
            totalPages,
            currentStatus: req.query.status || 'All',
            searchQuery: req.query.search || '',
            currentSort: req.query.sort || 'latest',
            currentPaymentStatus: req.query.paymentStatus || 'All',
            startDate: req.query.startDate || '',
            endDate: req.query.endDate || ''
        });
    } catch (error) {
        console.error("Get Admin Orders Error:", error);
        if (req.accepts('json') && !req.accepts('html')) {
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to load orders." });
        }
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send("Failed to load orders.");
    }
};


exports.getAdminOrderDetails = async (req, res) => {
    try {
        const orderId = req.params.id;
        const order = await Order.findById(orderId)
            .populate('userId', 'name email phone')
            .populate('items.productId');

        if (!order) {
            return res.status(HTTP_STATUS.NOT_FOUND).send("Order not found.");
        }

        res.render("admin/order-details", {
            title: `Order Details: ${order.orderId}`,
            order
        });
    } catch (error) {
        console.error("Get Admin Order Details Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send("Failed to load order details.");
    }
};

exports.updateOrderStatus = async (req, res) => {
    try {
        const orderId = req.params.id;
        const { status } = req.body;

        const validStatuses = ['Processing', 'Shipped', 'Delivered', 'Cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Invalid status." });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Order not found." });
        }

        // If order is already cancelled or returned, we shouldn't change it to shipped/delivered
        if (order.orderStatus === 'Cancelled' || order.orderStatus === 'Returned') {
             return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Cannot change status of a cancelled or returned order." });
        }

        // If delivered, update item statuses too (only those that are still Processing/Shipped)
        if (status === 'Delivered' || status === 'Shipped') {
            order.items.forEach(item => {
                if (item.itemStatus === 'Processing' || item.itemStatus === 'Shipped') {
                    item.itemStatus = status;
                }
            });
        }
        
        // If Cancelled by admin
        if (status === 'Cancelled') {
             for (let item of order.items) {
                if (item.itemStatus !== 'Cancelled' && item.itemStatus !== 'Returned') {
                    const product = await Product.findById(item.productId);
                    if (product) {
                        const variant = product.variants.id(item.variantId);
                        if (variant) {
                            variant.quantity += item.quantity;
                            await product.save();
                        }
                    }
                    item.itemStatus = 'Cancelled';
                }
            }
            order.cancellationReason = 'Cancelled by Administrator';

            // Update pricing and refund
            await updateOrderPricingAndRefund(order, null, true);
        }

        // Recalculate main order status based on items
        order.orderStatus = getCalculatedOrderStatus(order.items);

        if (order.orderStatus === 'Delivered' && order.paymentStatus === 'Pending') {
            order.paymentStatus = 'Completed';
        }

        await order.save();
        res.status(HTTP_STATUS.OK).json({ success: true, message: "Order status updated successfully." });

    } catch (error) {
        console.error("Update Order Status Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to update order status." });
    }
};

exports.updateItemStatus = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const { status } = req.body;

        const validStatuses = ['Processing', 'Shipped', 'Delivered', 'Cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Invalid status." });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Order not found." });
        }

        const item = order.items.id(itemId);
        if (!item) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Item not found." });
        }

        if (item.itemStatus === 'Cancelled' || item.itemStatus === 'Returned' || item.itemStatus === 'Return Requested') {
             return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Cannot change status of a cancelled, returned, or return requested item." });
        }

        let couponRemovedMsg = null;
        // If cancelling, restore stock
        if (status === 'Cancelled' && item.itemStatus !== 'Cancelled') {
            const product = await Product.findById(item.productId);
            if (product) {
                const variant = product.variants.id(item.variantId);
                if (variant) {
                    variant.quantity += item.quantity;
                    await product.save();
                }
            }
            item.cancellationReason = 'Cancelled by Administrator';

            // Update pricing and refund
            const result = await updateOrderPricingAndRefund(order, item, false);
            if (result && result.couponRemovedMessage) {
                couponRemovedMsg = result.couponRemovedMessage;
            }
        }

        item.itemStatus = status;

        // Auto-update overall order status based on all items
        order.orderStatus = getCalculatedOrderStatus(order.items);

        if (order.orderStatus === 'Delivered' && order.paymentStatus === 'Pending') {
            order.paymentStatus = 'Completed';
        }

        await order.save();

        let responseMessage = "Product status updated successfully.";
        if (couponRemovedMsg) {
            responseMessage += ` ${couponRemovedMsg}`;
        }
        res.status(HTTP_STATUS.OK).json({ success: true, message: responseMessage });

    } catch (error) {
        console.error("Update Item Status Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to update product status." });
    }
};

exports.handleReturnRequest = async (req, res) => {
    try {
        const orderId = req.params.id;
        const { action, itemId } = req.body; // action: 'approve' or 'reject'

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Order not found." });
        }

        let couponRemovedMsg = null;
        if (itemId) {
            // Partial Return
            const item = order.items.id(itemId);
            if (!item || item.itemStatus !== 'Return Requested') {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Invalid item or not requested for return." });
            }

            if (action === 'approve') {
                item.itemStatus = 'Return Approved';
                
                // Increase stock
                const product = await Product.findById(item.productId);
                if (product) {
                    const variant = product.variants.id(item.variantId);
                    if (variant) {
                        variant.quantity += item.quantity;
                        await product.save();
                    }
                }
                
                // Update pricing and refund
                const result = await updateOrderPricingAndRefund(order, item, false);
                if (result && result.couponRemovedMessage) {
                    couponRemovedMsg = result.couponRemovedMessage;
                }
            } else if (action === 'reject') {
                item.itemStatus = 'Return Rejected';
            }

            // Recalculate main order status
            order.orderStatus = getCalculatedOrderStatus(order.items);
            
        } else {
            // Full Return
            if (order.orderStatus !== 'Return Requested') {
                  return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Order is not requested for return." });
            }

            if (action === 'approve') {
                for (let item of order.items) {
                    if (item.itemStatus === 'Return Requested') {
                        item.itemStatus = 'Return Approved';
                        
                        const product = await Product.findById(item.productId);
                        if (product) {
                            const variant = product.variants.id(item.variantId);
                            if (variant) {
                                variant.quantity += item.quantity;
                                await product.save();
                            }
                        }
                    }
                }
                // Update pricing and refund
                await updateOrderPricingAndRefund(order, null, true);
            } else if (action === 'reject') {
                order.items.forEach(item => {
                    if (item.itemStatus === 'Return Requested') {
                        item.itemStatus = 'Return Rejected';
                    }
                });
            }

            // Recalculate main order status
            order.orderStatus = getCalculatedOrderStatus(order.items);
        }

        if (order.orderStatus === 'Delivered' && order.paymentStatus === 'Pending') {
            order.paymentStatus = 'Completed';
        }

        await order.save();

        let responseMessage = `Return request ${action}d successfully.`;
        if (couponRemovedMsg) {
            responseMessage += ` ${couponRemovedMsg}`;
        }
        res.status(HTTP_STATUS.OK).json({ success: true, message: responseMessage });

    } catch (error) {
        console.error("Handle Return Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to handle return request." });
    }
};
