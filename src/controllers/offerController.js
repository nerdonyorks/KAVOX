const Product = require("../models/productModel");
const Category = require("../models/categoryModel");
const ProductOffer = require("../models/productOfferModel");
const CategoryOffer = require("../models/categoryOfferModel");
const { HTTP_STATUS } = require("../utils/constants");

// ==========================================
// PRODUCT OFFER CONTROLLERS
// ==========================================

exports.listProductOffers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";

    let filter = {};
    if (search) {
      filter.name = { $regex: search, $options: "i" };
    }

    const totalOffers = await ProductOffer.countDocuments(filter);
    const totalPages = Math.ceil(totalOffers / limit) || 1;

    const offers = await ProductOffer.find(filter)
      .populate("productId", "name price")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const products = await Product.find({ isDeleted: false, isActive: true })
      .select("name price")
      .sort({ name: 1 })
      .lean();

    res.render("admin/product-offers", {
      title: "Product Offers - KAVOX Admin",
      offers,
      products,
      currentPage: page,
      totalPages,
      searchQuery: search
    });
  } catch (error) {
    console.error("listProductOffers Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send("Failed to load product offers.");
  }
};

exports.createProductOffer = async (req, res) => {
  try {
    const { name, productId, discountPercentage, startDate, endDate, isActive } = req.body;

    if (!name || !productId || !discountPercentage || !startDate || !endDate) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Missing required fields." });
    }

    const pct = parseFloat(discountPercentage);
    if (isNaN(pct) || pct < 1 || pct > 90) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Discount must be between 1% and 90%." });
    }

    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Start date must be before end date." });
    }

    // Check if there is already an active offer for this product
    if (isActive !== false) {
      const existingActive = await ProductOffer.findOne({ productId, isActive: true });
      if (existingActive) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Only one active offer is allowed per product at a time." });
      }
    }

    const newOffer = new ProductOffer({
      name: name.trim(),
      productId,
      discountPercentage: pct,
      startDate,
      endDate,
      isActive: isActive !== false
    });

    await newOffer.save();
    res.status(HTTP_STATUS.CREATED).json({ success: true, message: "Product offer created successfully.", offer: newOffer });
  } catch (error) {
    console.error("createProductOffer Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to create product offer." });
  }
};

exports.updateProductOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, productId, discountPercentage, startDate, endDate, isActive } = req.body;

    const offer = await ProductOffer.findById(id);
    if (!offer) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Product offer not found." });
    }

    if (discountPercentage) {
      const pct = parseFloat(discountPercentage);
      if (isNaN(pct) || pct < 1 || pct > 90) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Discount must be between 1% and 90%." });
      }
      offer.discountPercentage = pct;
    }

    const finalStartDate = startDate || offer.startDate;
    const finalEndDate = endDate || offer.endDate;
    if (new Date(finalStartDate) >= new Date(finalEndDate)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Start date must be before end date." });
    }

    const finalIsActive = typeof isActive !== "undefined" ? isActive : offer.isActive;
    const finalProductId = productId || offer.productId;

    if (finalIsActive) {
      const existingActive = await ProductOffer.findOne({
        productId: finalProductId,
        isActive: true,
        _id: { $ne: id }
      });
      if (existingActive) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Only one active offer is allowed per product at a time." });
      }
    }

    if (name) offer.name = name.trim();
    if (productId) offer.productId = productId;
    if (startDate) offer.startDate = startDate;
    if (endDate) offer.endDate = endDate;
    if (typeof isActive !== "undefined") offer.isActive = isActive;

    await offer.save();
    res.status(HTTP_STATUS.OK).json({ success: true, message: "Product offer updated successfully.", offer });
  } catch (error) {
    console.error("updateProductOffer Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to update product offer." });
  }
};

exports.deleteProductOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await ProductOffer.findByIdAndDelete(id);
    if (!result) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Product offer not found." });
    }
    res.status(HTTP_STATUS.OK).json({ success: true, message: "Product offer deleted successfully." });
  } catch (error) {
    console.error("deleteProductOffer Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to delete product offer." });
  }
};

// ==========================================
// CATEGORY OFFER CONTROLLERS
// ==========================================

exports.listCategoryOffers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";

    let filter = {};
    if (search) {
      filter.name = { $regex: search, $options: "i" };
    }

    const totalOffers = await CategoryOffer.countDocuments(filter);
    const totalPages = Math.ceil(totalOffers / limit) || 1;

    const offers = await CategoryOffer.find(filter)
      .populate("categoryId", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const categories = await Category.find({ isDeleted: false, isActive: true })
      .select("name")
      .sort({ name: 1 })
      .lean();

    res.render("admin/category-offers", {
      title: "Category Offers - KAVOX Admin",
      offers,
      categories,
      currentPage: page,
      totalPages,
      searchQuery: search
    });
  } catch (error) {
    console.error("listCategoryOffers Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send("Failed to load category offers.");
  }
};

exports.createCategoryOffer = async (req, res) => {
  try {
    const { name, categoryId, discountPercentage, startDate, endDate, isActive } = req.body;

    if (!name || !categoryId || !discountPercentage || !startDate || !endDate) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Missing required fields." });
    }

    const pct = parseFloat(discountPercentage);
    if (isNaN(pct) || pct < 1 || pct > 90) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Discount must be between 1% and 90%." });
    }

    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Start date must be before end date." });
    }

    // Check if there is already an active offer for this category
    if (isActive !== false) {
      const existingActive = await CategoryOffer.findOne({ categoryId, isActive: true });
      if (existingActive) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Only one active offer is allowed per category at a time." });
      }
    }

    const newOffer = new CategoryOffer({
      name: name.trim(),
      categoryId,
      discountPercentage: pct,
      startDate,
      endDate,
      isActive: isActive !== false
    });

    await newOffer.save();
    res.status(HTTP_STATUS.CREATED).json({ success: true, message: "Category offer created successfully.", offer: newOffer });
  } catch (error) {
    console.error("createCategoryOffer Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to create category offer." });
  }
};

exports.updateCategoryOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, categoryId, discountPercentage, startDate, endDate, isActive } = req.body;

    const offer = await CategoryOffer.findById(id);
    if (!offer) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Category offer not found." });
    }

    if (discountPercentage) {
      const pct = parseFloat(discountPercentage);
      if (isNaN(pct) || pct < 1 || pct > 90) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Discount must be between 1% and 90%." });
      }
      offer.discountPercentage = pct;
    }

    const finalStartDate = startDate || offer.startDate;
    const finalEndDate = endDate || offer.endDate;
    if (new Date(finalStartDate) >= new Date(finalEndDate)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Start date must be before end date." });
    }

    const finalIsActive = typeof isActive !== "undefined" ? isActive : offer.isActive;
    const finalCategoryId = categoryId || offer.categoryId;

    if (finalIsActive) {
      const existingActive = await CategoryOffer.findOne({
        categoryId: finalCategoryId,
        isActive: true,
        _id: { $ne: id }
      });
      if (existingActive) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Only one active offer is allowed per category at a time." });
      }
    }

    if (name) offer.name = name.trim();
    if (categoryId) offer.categoryId = categoryId;
    if (startDate) offer.startDate = startDate;
    if (endDate) offer.endDate = endDate;
    if (typeof isActive !== "undefined") offer.isActive = isActive;

    await offer.save();
    res.status(HTTP_STATUS.OK).json({ success: true, message: "Category offer updated successfully.", offer });
  } catch (error) {
    console.error("updateCategoryOffer Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to update category offer." });
  }
};

exports.deleteCategoryOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await CategoryOffer.findByIdAndDelete(id);
    if (!result) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Category offer not found." });
    }
    res.status(HTTP_STATUS.OK).json({ success: true, message: "Category offer deleted successfully." });
  } catch (error) {
    console.error("deleteCategoryOffer Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to delete category offer." });
  }
};
