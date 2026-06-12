const Product = require("../models/productModel");
const Category = require("../models/categoryModel");
const Wishlist = require("../models/wishlist");
const { HTTP_STATUS, MESSAGES } = require("../utils/constants");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs").promises;

//Get single product by ID

exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate("category", "name");
    if (!product || product.isDeleted) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: "Product not found.",
      });
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: product,
    });
  } catch (error) {
    console.error("Get Product By ID Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: MESSAGES.INTERNAL_SERVER_ERROR,
    });
  }
};

//Get all products with pagination and search

exports.listProducts = async (req, res) => {
  try {
    const { search, page = 1, limit = 4, category } = req.query;
    const query = { isDeleted: false };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    if (category && category !== "all") {
      query.category = category;
    }

    const skip = (page - 1) * limit;
    const total = await Product.countDocuments(query);
    const data = await Product.find(query)
      .populate("category", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const offerService = require("../services/offerService");
    await offerService.populateProductOffers(data);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("List Products Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: MESSAGES.INTERNAL_SERVER_ERROR,
    });
  }
};

//Create new product
exports.createProduct = async (req, res) => {
  try {
    let { name, description, price, category, showOnHome, isActive, variants } = req.body;

    // Validate name (alphanumeric and spaces only)
    const nameRegex = /^[a-zA-Z0-9\s]+$/;
    if (!nameRegex.test(name.trim())) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Product name can only contain letters and numbers.",
      });
    }

    // Check for unique name (case-insensitive)
    const existingProduct = await Product.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
    });

    if (existingProduct) {
      if (!existingProduct.isDeleted) {
        return res.status(HTTP_STATUS.CONFLICT).json({
          success: false,
          message: "A product with this name already exists.",
        });
      } else {
        // Restore soft-deleted product
        console.log(`[BACKEND] Restoring soft-deleted product: ${name}`);
        const files = req.files || [];
        try {
          const parsedVariants = typeof variants === 'string' ? JSON.parse(variants) : variants;
          if (!parsedVariants || parsedVariants.length === 0) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Variants required." });
          }

          let fileCursor = 0;
          const processedVariants = [];

          for (let vIndex = 0; vIndex < parsedVariants.length; vIndex++) {
            const v = parsedVariants[vIndex];
            const processedImages = [];
            for (let i = 0; i < 3; i++) {
              const file = files[fileCursor++];
              if (!file) throw new Error(`Image missing for variant ${vIndex + 1}`);
              const buffer = await sharp(file.path).resize(500, 500, { fit: "cover" }).jpeg({ quality: 80 }).toBuffer();
              await fs.writeFile(file.path, buffer);
              processedImages.push({ url: `/uploads/products/${file.filename}`, isPrimary: i === 0 });
            }
            processedVariants.push({
              size: v.size, color: v.color, quantity: parseInt(v.quantity) || 0,
              images: processedImages, isActive: v.isActive !== false
            });
          }

          existingProduct.description = description;
          existingProduct.price = price;
          existingProduct.category = category;
          existingProduct.images = processedVariants[0].images;
          existingProduct.showOnHome = showOnHome === "true" || showOnHome === true;
          existingProduct.isActive = isActive === "true" || isActive === true || isActive === undefined;
          existingProduct.variants = processedVariants;
          existingProduct.isDeleted = false;
          await existingProduct.save();

          return res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: "Product restored successfully.",
            data: existingProduct
          });
        } catch (e) {
          return res.status(400).json({ success: false, message: e.message });
        }
      }
    }
    const files = req.files || [];
    console.log(`[BACKEND] Creating Product: "${name}", Files Received: ${files.length}`);

    if (!name || !description || !price || !category) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Required fields are missing.",
      });
    }

    if (variants) {
      try {
        variants = typeof variants === 'string' ? JSON.parse(variants) : variants;
      } catch (e) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Invalid variants format." });
      }
    } else {
      variants = [];
    }

    let fileCursor = 0;
    const processedVariants = [];

    for (let vIndex = 0; vIndex < variants.length; vIndex++) {
      const v = variants[vIndex];
      const processedImages = [];
      const vImages = v.images || []; // Array of URLs or "__NEW_FILE__"

      // We expect exactly 3 image slots per variant
      for (let i = 0; i < 3; i++) {
        const item = vImages[i];

        if (item === "__NEW_FILE__") {
          const file = files[fileCursor++];
          if (!file) {
            throw new Error(`Variant ${vIndex + 1}: Image file expected for slot ${i + 1} but not received.`);
          }

          const inputPath = file.path;
          const buffer = await sharp(inputPath)
            .resize(500, 500, { fit: "cover" })
            .jpeg({ quality: 80 })
            .toBuffer();
          await fs.writeFile(inputPath, buffer);

          processedImages.push({
            url: `/uploads/products/${file.filename}`,
            isPrimary: i === 0,
          });
        } else if (item && typeof item === 'string') {
          processedImages.push({
            url: item,
            isPrimary: i === 0,
          });
        }
      }

      if (processedImages.length < 3) {
        throw new Error(`Variant ${vIndex + 1} (${v.size}/${v.color}) must have exactly 3 images.`);
      }

      processedVariants.push({
        size: v.size,
        color: v.color,
        quantity: parseInt(v.quantity) || 0,
        images: processedImages,
        isActive: v.isActive === "true" || v.isActive === true || v.isActive === undefined
      });
    }

    if (processedVariants.length === 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "At least one variant with 3 images is required.",
      });
    }

    // Set the product's top-level images as the first variant's images (for backward compatibility/legacy views)
    const productImages = processedVariants[0].images;

    const product = new Product({
      name,
      description,
      price,
      category,
      images: productImages,
      showOnHome: showOnHome === 'true' || showOnHome === true,
      isActive: isActive === 'true' || isActive === true || isActive === undefined,
      variants: processedVariants,
    });

    await product.save();

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: "Product created successfully.",
      data: product,
    });
  } catch (error) {
    console.error("Create Product Error:", error);
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: error.message || MESSAGES.INTERNAL_SERVER_ERROR,
    });
  }
};

// Update product
exports.updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product || product.isDeleted) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: "Product not found.",
      });
    }

    let { name, description, price, category, images, isActive, showOnHome, variants } = req.body;

    if (name) {
      const nameRegex = /^[a-zA-Z0-9\s]+$/;
      if (!nameRegex.test(name.trim())) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: "Product name can only contain letters and numbers.",
        });
      }

      const nameConflict = await Product.findOne({
        name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
        _id: { $ne: req.params.id },
        isDeleted: false
      });
      if (nameConflict) {
        return res.status(HTTP_STATUS.CONFLICT).json({
          success: false,
          message: "Another product already uses this name.",
        });
      }
      product.name = name;
    }
    if (description) product.description = description;
    if (price) product.price = price;
    if (category) product.category = category;
    if (typeof showOnHome !== "undefined") product.showOnHome = showOnHome === "true" || showOnHome === true;
    if (typeof isActive !== "undefined") product.isActive = isActive === "true" || isActive === true;
    const files = req.files || [];

    if (variants) {
      try {
        const parsedVariants = typeof variants === 'string' ? JSON.parse(variants) : variants;
        console.log(`[BACKEND] Updating Product ID: ${req.params.id}, Files Received: ${files.length}, Variants: ${parsedVariants.length}`);
        let fileCursor = 0;
        const processedVariants = [];

        for (let vIndex = 0; vIndex < parsedVariants.length; vIndex++) {
          const v = parsedVariants[vIndex];
          const processedImages = [];
          const vImages = v.images || [];

          for (let i = 0; i < 3; i++) {
            const item = vImages[i];

            if (item === "__NEW_FILE__") {
              const file = files[fileCursor++];
              if (!file) {
                throw new Error(`Variant ${vIndex + 1} image missing for update.`);
              }
              const inputPath = file.path;
              // Optimize
              const b = await sharp(inputPath).resize(500, 500, { fit: "cover" }).jpeg({ quality: 80 }).toBuffer();
              await fs.writeFile(inputPath, b);

              processedImages.push({
                url: `/uploads/products/${file.filename}`,
                isPrimary: i === 0,
              });
            } else if (item && typeof item === 'string') {
              processedImages.push({
                url: item,
                isPrimary: i === 0,
              });
            }
          }
          if (processedImages.length < 3) {
            throw new Error(`Variant ${vIndex + 1} incomplete after update logic.`);
          }
          processedVariants.push({
            size: v.size,
            color: v.color,
            quantity: parseInt(v.quantity) || 0,
            images: processedImages,
            isActive: v.isActive === "true" || v.isActive === true || v.isActive === undefined
          });
        }
        product.variants = processedVariants;
        // Also update product.images to the first variant's images for home display
        if (processedVariants.length > 0) {
          product.images = processedVariants[0].images;
        }
      } catch (e) {
        console.error("Variant Processing Error:", e);
        return res.status(400).json({ success: false, message: e.message || "Invalid variants data." });
      }
    }

    await product.save();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Product updated successfully.",
      data: product,
    });
  } catch (error) {
    console.error("Update Product Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: MESSAGES.INTERNAL_SERVER_ERROR,
    });
  }
};

// Soft delete product

exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: "Product not found.",
      });
    }

    product.isDeleted = true;
    await product.save();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Product deleted successfully.",
    });
  } catch (error) {
    console.error("Delete Product Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: MESSAGES.INTERNAL_SERVER_ERROR,
    });
  }
};

// --- USER SIDE METHODS ---

//List products for shop with filters, search, sort

exports.userListProducts = async (req, res) => {
  try {
    const { search, category, brand, minPrice, maxPrice, sort, size, page = 1, limit = 12 } = req.query;

    // Get all active, non-deleted categories to filter products
    const activeCategories = await Category.find({ isActive: true, isDeleted: false }, "_id").lean();
    const activeCategoryIds = activeCategories.map(cat => cat._id);

    const query = {
      isDeleted: false,
      isActive: true,
      category: { $in: activeCategoryIds }
    };

    // Search by name
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    // Filter by Category
    let validatedCategory = category;
    if (category && category !== "all") {
      let categoryArray = Array.isArray(category) ? category : [category];
      // Filter out categories that are not active or deleted
      categoryArray = categoryArray.filter(catId =>
        activeCategoryIds.some(id => id.toString() === catId.toString())
      );

      if (categoryArray.length > 0) {
        query.category = { $in: categoryArray };
        validatedCategory = categoryArray;
      } else {
        // If no valid categories remain, default back to all active categories
        validatedCategory = 'all';
      }
    }

    // Filter by Brand
    if (brand && brand !== "all") {
      query.brand = brand;
    }

    // Filter by Price Range
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseInt(minPrice);
      if (maxPrice) query.price.$lte = parseInt(maxPrice);
    }

    // Filter by Size (within variants)
    const variantQuery = {
      isActive: true
    };
    if (size) {
      const sizeArray = Array.isArray(size) ? size : [size];
      const sizeRegexes = sizeArray.map(s => new RegExp(`^${s}$|^UK ${s}$`, "i"));
      variantQuery.size = { $in: sizeRegexes };
    }

    query.variants = { $elemMatch: variantQuery };

    // Sorting
    let sortOptions = { createdAt: -1 };
    if (sort === "priceLowHigh") sortOptions = { price: 1 };
    else if (sort === "priceHighLow") sortOptions = { price: -1 };
    else if (sort === "nameAZ") sortOptions = { name: 1 };
    else if (sort === "newest") sortOptions = { createdAt: -1 };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const totalProducts = await Product.countDocuments(query);
    const products = await Product.find(query)
      .populate("category")
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const offerService = require("../services/offerService");
    await offerService.populateProductOffers(products);

    // Get user's wishlist product IDs if logged in
    let wishlistProductIds = [];
    const currentUser = req.user || req.session.user;
    if (currentUser) {
      const wishlist = await Wishlist.findOne({ userId: currentUser._id });
      if (wishlist) {
        wishlistProductIds = wishlist.products.map(p => p.toString());
      }
    }

    const categories = await Category.find({ isActive: true, isDeleted: false }).lean();
    const brands = await Product.distinct("brand", { isDeleted: false, isActive: true });

    const data = {
      title: "KAVOX - Shop",
      products,
      categories,
      brands,
      totalProducts,
      totalPages: Math.ceil(totalProducts / parseInt(limit)),
      currentPage: parseInt(page),
      sort: sort || 'newest',
      currentCategory: Array.isArray(validatedCategory) ? validatedCategory : (validatedCategory && validatedCategory !== 'all' ? [validatedCategory] : []),
      currentBrand: brand || 'all',
      currentSize: Array.isArray(size) ? size : (size ? [size] : []),
      minPrice: minPrice || '',
      maxPrice: maxPrice || '',
      searchQuery: search || '',
      wishlistProductIds // Pass to view
    };

    if (req.query.ajax === 'true') {
      return res.render("user/partials/shop-grid", data, (err, html) => {
        if (err) {
          console.error("AJAX Render Error:", err);
          return res.status(500).json({ success: false, message: "Render error" });
        }
        res.json({
          success: true,
          html,
          totalProducts: data.totalProducts,
          currentPage: data.currentPage,
          totalPages: data.totalPages,
          wishlistProductIds: data.wishlistProductIds // Also pass to AJAX if needed
        });
      });
    }

    if (req.xhr || req.headers.accept.includes("application/json")) {
      return res.json({ success: true, ...data });
    }

    res.render("user/shop", data);
  } catch (error) {
    console.error("User List Products Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render("user/error", {
      message: "Failed to load shop products."
    });
  }
};

//Get detailed product view

exports.userGetProductDetails = async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, isDeleted: false })
      .populate("category")
      .lean();

    if (!product || !product.category) {
      return res.redirect("/shop");
    }

    const isBlocked = !product.isActive || !product.category.isActive || product.category.isDeleted;

    const offerService = require("../services/offerService");
    await offerService.populateProductOffers(product);

    // Fetch related products from the same category
    let relatedProducts = await Product.find({
      category: product.category._id,
      _id: { $ne: product._id },
      isDeleted: false,
      isActive: true
    }).populate("category").limit(3).lean();

    // Fallback: If no related products in the same category, fetch from other categories
    if (!relatedProducts || relatedProducts.length === 0) {
      relatedProducts = await Product.find({
        _id: { $ne: product._id },
        isDeleted: false,
        isActive: true
      }).populate("category").limit(3).lean();
    }

    if (relatedProducts && relatedProducts.length > 0) {
      await offerService.populateProductOffers(relatedProducts);
    }

    // Check if product is in wishlist if user is logged in
    let isInWishlist = false;
    let wishlistProductIds = [];
    const currentUser = req.user || req.session.user;
    if (currentUser) {
      const wishlist = await Wishlist.findOne({ userId: currentUser._id });
      if (wishlist) {
        isInWishlist = wishlist.products.some(pId => pId.toString() === product._id.toString());
        wishlistProductIds = wishlist.products.map(pId => pId.toString());
      }
    }

    // Calculate total stock for initial display
    const totalStock = product.variants.reduce((acc, v) => acc + (v.quantity || 0), 0);
    const stockText = totalStock > 0 ? (totalStock < 10 ? `Only ${totalStock} Left!` : 'In Stock') : 'Out of Stock';
    const stockClass = totalStock > 0 ? (totalStock < 10 ? 'stock-low' : 'stock-in') : 'stock-out';

    res.render("user/product-details", {
      title: `${product.name} - KAVOX`,
      product,
      relatedProducts,
      isInWishlist,
      wishlistProductIds,
      isBlocked,
      stockText,
      stockClass
    });
  } catch (error) {
    console.error("User Get Product Details Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render("user/error", {
      message: "An error occurred while fetching product details."
    });
  }
};

//Check if product is still active/available (for real-time user-side checks)

exports.checkProductStatus = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate("category");
    if (!product || product.isDeleted || !product.isActive || !product.category || !product.category.isActive || product.category.isDeleted) {
      return res.status(HTTP_STATUS.OK).json({
        success: true,
        isActive: false,
        message: "Product is no longer available."
      });
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      isActive: true
    });
  } catch (error) {
    console.error("Check Product Status Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Error checking product status."
    });
  }
};

/**
 * GET: Product Variants for Add-to-Cart Modal
 */
exports.userGetProductVariants = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findOne({ _id: id, isDeleted: false, isActive: true })
      .populate("category")
      .lean();

    if (!product || !product.category || !product.category.isActive || product.category.isDeleted) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: "Product not found or unavailable."
      });
    }

    // Filter active variants
    const activeVariants = product.variants.filter(v => v.isActive);

    // Calculate final price (respecting offers)
    const offerService = require("../services/offerService");
    await offerService.populateProductOffers(product);
    const { finalPrice } = offerService.getDiscountedPrice(product);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        id: product._id,
        name: product.name,
        basePrice: product.price,
        finalPrice,
        variants: activeVariants
      }
    });
  } catch (error) {
    console.error("Get Variants Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to load variant data."
    });
  }
};

