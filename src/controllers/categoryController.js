const Category = require("../models/categoryModel");
const { HTTP_STATUS, MESSAGES } = require("../utils/constants");

// @desc    Get all categories with pagination and search
// @route   GET /api/admin/category
exports.listCategories = async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;
    const query = { isDeleted: false };

    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const skip = (page - 1) * limit;
    const total = await Category.countDocuments(query);
    const data = await Category.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("List Categories Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: MESSAGES.INTERNAL_SERVER_ERROR,
    });
  }
};

// @desc    Create new category
// @route   POST /api/admin/category
exports.createCategory = async (req, res) => {
  try {
    const { name, offer } = req.body;
    if (!name) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Category name is required.",
      });
    }

    const normalizedName = name.trim();
    // Case-insensitive check for ANY existing category (included deleted)
    const existing = await Category.findOne({ 
      name: { $regex: new RegExp(`^${normalizedName}$`, "i") } 
    });

    if (existing) {
      if (existing.isDeleted) {
        // Restore instead of duplicate
        existing.isDeleted = false;
        existing.deletedAt = null;
        existing.offer = offer || 0;
        existing.isActive = true; 
        await existing.save();

        return res.status(HTTP_STATUS.OK).json({
          success: true,
          message: "Category restored successfully.",
          data: existing,
        });
      }

      return res.status(HTTP_STATUS.CONFLICT).json({
        success: false,
        message: "Category with this name already exists.",
      });
    }

    const category = new Category({ 
      name: normalizedName,
      offer: offer || 0
    });
    await category.save();

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: MESSAGES.CATEGORY_CREATED || "Category created successfully.",
      data: category,
    });
  } catch (error) {
    console.error("Create Category Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: MESSAGES.INTERNAL_SERVER_ERROR,
    });
  }
};

// @desc    Update category
// @route   PUT /api/admin/category/:id
exports.updateCategory = async (req, res) => {
  try {
    const { name, isActive, offer } = req.body;
    const categoryId = req.params.id;

    const category = await Category.findById(categoryId);
    if (!category || category.isDeleted) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: "Category not found.",
      });
    }

    if (name) {
      const normalizedName = name.trim();
      const existing = await Category.findOne({
        name: { $regex: new RegExp(`^${normalizedName}$`, "i") },
        _id: { $ne: categoryId }
      });
      if (existing) {
        return res.status(HTTP_STATUS.CONFLICT).json({
          success: false,
          message: "Another category with this name already exists.",
        });
      }
      category.name = normalizedName;
    }

    if (typeof isActive !== "undefined") {
      category.isActive = isActive === "true" || isActive === true;
    }

    if (typeof offer !== "undefined") {
      category.offer = parseInt(offer);
    }

    if (req.file) {
      // Delete old image from Cloudinary
      if (category.image) {
        const oldPublicId = category.image.split("/").pop().split(".")[0];
        await cloudinary.uploader.destroy(`kavox/categories/${oldPublicId}`);
      }
      category.image = req.file.path;
    }

    await category.save();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Category updated successfully.",
      data: category,
    });
  } catch (error) {
    console.error("Update Category Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: MESSAGES.INTERNAL_SERVER_ERROR,
    });
  }
};

// @desc    Soft delete category
// @route   DELETE /api/admin/category/:id
exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: "Category not found.",
      });
    }

    // Soft delete
    category.isDeleted = true;
    category.deletedAt = new Date();

    await category.save();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Category deleted successfully.",
    });
  } catch (error) {
    console.error("Delete Category Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: MESSAGES.INTERNAL_SERVER_ERROR,
    });
  }
};

