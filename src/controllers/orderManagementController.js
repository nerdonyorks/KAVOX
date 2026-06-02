const Order = require("../models/orderModel");
const Product = require("../models/productModel");
const User = require("../models/userModel");
const PDFDocument = require("pdfkit");
const { HTTP_STATUS } = require("../utils/constants");
const { getCalculatedOrderStatus } = require("../utils/orderHelpers");

exports.getUserOrders = async (req, res) => {
    // AJAX request → return JSON data; browser navigation → render shell
    const isAjax = req.accepts('json') && !req.accepts('html');

    if (!isAjax) {
        return res.render("user/orders", { title: "My Orders - KAVOX" });
    }

    try {
        const userId = req.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;

        const filter = { userId };

        if (req.query.status && req.query.status !== 'All') {
            filter.orderStatus = req.query.status;
        }

        if (req.query.search) {
            filter.$or = [
                { orderId: { $regex: req.query.search, $options: 'i' } },
                { 'items.productName': { $regex: req.query.search, $options: 'i' } }
            ];
        }

        const totalOrders = await Order.countDocuments(filter);
        const totalPages = Math.ceil(totalOrders / limit);

        const orders = await Order.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        res.json({ success: true, orders, currentPage: page, totalPages });
    } catch (error) {
        console.error("Get User Orders Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to load orders." });
    }
};


exports.getOrderDetails = async (req, res) => {
    try {
        const orderId = req.params.id;
        const userId = req.user._id;

        const order = await Order.findOne({ _id: orderId, userId }).populate('items.productId');

        if (!order) {
            return res.status(HTTP_STATUS.NOT_FOUND).render("user/error", {
                message: "Order not found."
            });
        }

        res.render("user/order-details", {
            title: `Order ${order.orderId} - KAVOX`,
            order
        });
    } catch (error) {
        console.error("Get Order Details Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render("user/error", {
            message: "Failed to load order details."
        });
    }
};

exports.cancelOrder = async (req, res) => {
    try {
        const orderId = req.params.id;
        const userId = req.user._id;
        const { reason } = req.body;

        const order = await Order.findOne({ _id: orderId, userId });

        if (!order) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Order not found." });
        }

        if (order.orderStatus === 'Delivered' || order.orderStatus === 'Shipped' || order.orderStatus === 'Cancelled' || order.orderStatus === 'Partially Shipped' || order.orderStatus === 'Partially Delivered') {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Order cannot be cancelled at this stage." });
        }

        // Restore stock
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

        order.orderStatus = 'Cancelled';
        order.cancellationReason = reason || 'No reason provided';

        // Handle Wallet refund if payment method is not COD and payment was completed (for future)
        // if (order.paymentMethod !== 'COD' && order.paymentStatus === 'Completed') { ... }

        await order.save();

        res.status(HTTP_STATUS.OK).json({ success: true, message: "Order cancelled successfully." });
    } catch (error) {
        console.error("Cancel Order Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to cancel order." });
    }
};

exports.cancelOrderItem = async (req, res) => {
    try {
        const { id, itemId } = req.params;
        const userId = req.user._id;
        const { reason } = req.body;

        const order = await Order.findOne({ _id: id, userId });

        if (!order) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Order not found." });
        }

        const item = order.items.id(itemId);

        if (!item) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Item not found in order." });
        }

        if (item.itemStatus === 'Cancelled' || item.itemStatus === 'Returned' || item.itemStatus === 'Delivered' || item.itemStatus === 'Shipped') {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Item cannot be cancelled at this stage." });
        }

        // Restore stock
        const product = await Product.findById(item.productId);
        if (product) {
            const variant = product.variants.id(item.variantId);
            if (variant) {
                variant.quantity += item.quantity;
                await product.save();
            }
        }

        item.itemStatus = 'Cancelled';
        item.cancellationReason = reason || 'No reason provided';

        // Recalculate main order status
        order.orderStatus = getCalculatedOrderStatus(order.items);
        if (order.orderStatus === 'Cancelled') {
            order.cancellationReason = 'All items cancelled';
        }

        // Update totals (Optional: Depending on business logic, we might need to recalculate subtotal/total)
        // For simplicity, we just mark the item as cancelled. The actual totals might remain to show the history.

        await order.save();

        res.status(HTTP_STATUS.OK).json({ success: true, message: "Item cancelled successfully." });
    } catch (error) {
        console.error("Cancel Order Item Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to cancel item." });
    }
};

exports.requestReturn = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;
        const { reason, itemId } = req.body; // itemId is optional (for full vs partial)

        const order = await Order.findOne({ _id: id, userId });

        if (!order) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Order not found." });
        }

        if (order.orderStatus !== 'Delivered' && order.orderStatus !== 'Partially Delivered') {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Only delivered or partially delivered orders can be returned." });
        }

        if (itemId) {
            // Partial Return
            const item = order.items.id(itemId);
            if (!item) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Item not found." });
            if (item.itemStatus !== 'Delivered') return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Item must be delivered to return." });

            item.itemStatus = 'Return Requested';
            item.returnReason = reason || 'No reason provided';

            // Recalculate main order status
            order.orderStatus = getCalculatedOrderStatus(order.items);

        } else {
            // Full Return
            if (order.orderStatus !== 'Delivered') {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Full return is only allowed when the entire order is delivered." });
            }

            order.returnReason = reason || 'No reason provided';

            order.items.forEach(item => {
                if (item.itemStatus === 'Delivered') {
                    item.itemStatus = 'Return Requested';
                    item.returnReason = reason || 'No reason provided';
                }
            });

            // Recalculate main order status
            order.orderStatus = getCalculatedOrderStatus(order.items);
        }

        await order.save();
        res.status(HTTP_STATUS.OK).json({ success: true, message: "Return requested successfully." });
    } catch (error) {
        console.error("Request Return Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to request return." });
    }
};

exports.downloadInvoice = async (req, res) => {
    try {
        const orderId = req.params.id;
        const userId = req.user._id;

        const order = await Order.findOne({ _id: orderId, userId }).populate('items.productId');

        if (!order) {
            return res.status(HTTP_STATUS.NOT_FOUND).send("Order not found.");
        }

        if (order.orderStatus !== 'Delivered') {
            return res.status(HTTP_STATUS.BAD_REQUEST).send("Invoice is only available for delivered orders.");
        }

        const doc = new PDFDocument({ margin: 0, size: 'A4' });
        res.setHeader('Content-disposition', `attachment; filename=Invoice-${order.orderId}.pdf`);
        res.setHeader('Content-type', 'application/pdf');
        doc.pipe(res);

        const PAGE_W = 595.28;
        const PAGE_H = 841.89;
        const MARGIN = 40;
        const CWIDTH = PAGE_W - MARGIN * 2;

        // Brand colours matching the website
        const BLACK = '#1a1a1a';
        const GREEN = '#4ade80';
        const PINK = '#e91e63';
        const LIGHT_BG = '#f8f8f8';
        const BORDER = '#eeeeee';
        const WHITE = '#ffffff';
        const GRAY = '#888888';

        // ── Header bar ───────────────────────────────────────────────
        doc.rect(0, 0, PAGE_W, 90).fill(BLACK);

        // Logo (graceful fallback to text)
        const logoPath = `${__dirname}/../../public/images/logo.png`;
        try {
            doc.image(logoPath, MARGIN, 18, { height: 38 });
        } catch (_) {
            doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(22).text('KAVOX', MARGIN, 28);
        }
        doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(8)
            .text('SOLE LAB', MARGIN, 60, { characterSpacing: 4 });

        // "INVOICE" right-aligned
        doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(26)
            .text('INVOICE', 0, 30, { align: 'right', width: PAGE_W - MARGIN });
        doc.fillColor(GREEN).font('Helvetica').fontSize(9)
            .text(new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }),
                0, 62, { align: 'right', width: PAGE_W - MARGIN });

        // ── Order Meta Row ────────────────────────────────────────────
        let y = 110;
        doc.rect(MARGIN, y, CWIDTH, 55).fill(LIGHT_BG).stroke(BORDER);

        doc.fillColor(GRAY).font('Helvetica').fontSize(8).text('ORDER ID', MARGIN + 15, y + 10);
        doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(11).text(order.orderId, MARGIN + 15, y + 22);

        const midX = MARGIN + CWIDTH / 3;
        const rightX = MARGIN + (CWIDTH / 3) * 2;

        doc.fillColor(GRAY).font('Helvetica').fontSize(8).text('PAYMENT METHOD', midX, y + 10);
        doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(11).text(order.paymentMethod, midX, y + 22);

        doc.fillColor(GRAY).font('Helvetica').fontSize(8).text('PAYMENT STATUS', rightX, y + 10);
        doc.fillColor(PINK).font('Helvetica-Bold').fontSize(11).text(order.paymentStatus, rightX, y + 22);

        // ── Two-column address section ─────────────────────────────────
        y = 185;
        const colW = (CWIDTH - 20) / 2;
        const col2X = MARGIN + colW + 20;

        const drawAddressBox = (label, x) => {
            doc.rect(x, y, colW, 90).fill(WHITE).stroke(BORDER);
            doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(9).text(label, x + 12, y + 12, { characterSpacing: 1 });
            doc.moveTo(x + 12, y + 25).lineTo(x + 42, y + 25).lineWidth(1.5).stroke(GREEN);
            doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(11)
                .text(`${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`, x + 12, y + 33);
            doc.fillColor(GRAY).font('Helvetica').fontSize(9)
                .text(order.shippingAddress.street, x + 12, y + 49)
                .text(`${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.pincode}`, x + 12, y + 62)
                .text(`Ph: ${order.shippingAddress.mobile}`, x + 12, y + 75);
        };

        drawAddressBox('BILL TO', MARGIN);
        drawAddressBox('SHIP TO', col2X);

        // ── Items Table ───────────────────────────────────────────────
        y = 295;

        // Table header — black bar with white labels
        doc.rect(MARGIN, y, CWIDTH, 28).fill(BLACK);
        doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(9);
        const C = {
            item: MARGIN + 12,
            size: MARGIN + 220,
            color: MARGIN + 288,
            qty: MARGIN + 352,
            price: MARGIN + 400,
            total: MARGIN + 460,
        };
        doc.text('ITEM', C.item, y + 10);
        doc.text('SIZE', C.size, y + 10);
        doc.text('COLOR', C.color, y + 10);
        doc.text('QTY', C.qty, y + 10);
        doc.text('PRICE', C.price, y + 10);
        doc.text('TOTAL', C.total, y + 10);

        y += 28;

        order.items
            .filter(i => i.itemStatus !== 'Cancelled')
            .forEach((item, idx) => {
                const rowH = 30;
                const rowBg = idx % 2 === 0 ? WHITE : LIGHT_BG;
                doc.rect(MARGIN, y, CWIDTH, rowH).fill(rowBg).stroke(BORDER);
                doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(9)
                    .text(item.productName.substring(0, 26), C.item, y + 11, { width: 200 });
                doc.fillColor(GRAY).font('Helvetica').fontSize(9)
                    .text(item.size, C.size, y + 11)
                    .text(item.color, C.color, y + 11)
                    .text(item.quantity.toString(), C.qty, y + 11)
                    .text(`Rs.${item.price}`, C.price, y + 11);
                doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(9)
                    .text(`Rs.${item.totalPrice}`, C.total, y + 11);
                y += rowH;
            });

        // ── Totals ─────────────────────────────────────────────────────
        y += 15;
        const totX = MARGIN + CWIDTH - 200;

        const totalRow = (label, value, lCol, vCol, bold = false) => {
            const f = bold ? 'Helvetica-Bold' : 'Helvetica';
            const s = bold ? 11 : 9;
            doc.fillColor(lCol).font(f).fontSize(s).text(label, totX, y);
            doc.fillColor(vCol).font(f).fontSize(s).text(value, totX + 120, y, { align: 'left', width: 75 });
            y += bold ? 18 : 15;
        };

        totalRow('Subtotal', `  Rs. ${order.pricing.subtotal}`, GRAY, BLACK);
        totalRow('Discount', `- Rs. ${order.pricing.discount}`, GRAY, '#22c55e');
        totalRow('Shipping', order.pricing.shipping === 0 ? '  FREE' : `  Rs. ${order.pricing.shipping}`, GRAY, BLACK);

        doc.moveTo(totX, y).lineTo(totX + 195, y).lineWidth(0.5).stroke(BORDER);
        y += 8;

        // Total — black pill with green amount
        doc.rect(totX - 8, y - 4, 203, 26).fill(BLACK);
        doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(12).text('TOTAL', totX, y + 4);
        doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(12)
            .text(` Rs. ${order.pricing.total}`, totX + 120, y + 4, { align: 'left', width: 75 });

        // ── Footer bar ─────────────────────────────────────────────────
        doc.rect(0, PAGE_H - 55, PAGE_W, 55).fill(BLACK);
        doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(10)
            .text('Thank you for shopping with KAVOX!', 0, PAGE_H - 40, { align: 'center', width: PAGE_W });
        doc.fillColor(GRAY).font('Helvetica').fontSize(8)
            .text('kavox@gmail.com  |  solelab.kavox.com', 0, PAGE_H - 24, { align: 'center', width: PAGE_W });

        doc.end();

    } catch (error) {
        console.error("Download Invoice Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send("Failed to generate invoice.");
    }
};


