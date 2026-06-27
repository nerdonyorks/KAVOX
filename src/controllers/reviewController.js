const Review = require("../models/reviewModel");
const Product = require("../models/productModel");
const User = require("../models/userModel");
const reviewService = require("../services/reviewService");
const sharp = require("sharp");
const fs = require("fs").promises;
const path = require("path");
const { HTTP_STATUS } = require("../utils/constants");

exports.createOrUpdateReview = async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId, rating, title, review } = req.body;
    const reviewId = req.params.id;

    if (!productId || !rating || !title || !review) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "All fields (product, rating, title, review text) are required."
      });
    }

    const ratingVal = parseInt(rating);
    if (isNaN(ratingVal) || ratingVal < 1 || ratingVal > 5) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Rating must be an integer between 1 and 5."
      });
    }

    if (title.trim().length > 100) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Review title is too long (maximum 100 characters)."
      });
    }

    if (review.trim().length > 1000) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Review description is too long (maximum 1000 characters)."
      });
    }

    // Verify Purchase history
    const isVerified = await reviewService.verifyUserPurchase(userId, productId);
    if (!isVerified) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: "You can only review products that you have purchased and had successfully delivered."
      });
    }

    // Handle Image Uploads
    const imageUrls = [];
    let keepImages = [];
    if (req.body.keepImages) {
      keepImages = Array.isArray(req.body.keepImages)
        ? req.body.keepImages
        : [req.body.keepImages];
    }
    const newFilesCount = req.files ? req.files.length : 0;

    if (keepImages.length + newFilesCount > 5) {
      if (req.files) {
        for (const file of req.files) {
          await fs.unlink(file.path).catch(() => { });
        }
      }
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "You can upload a maximum of 5 images."
      });
    }

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const destPath = `/uploads/products/${file.filename}`;
        imageUrls.push(destPath);
        // Optimize and resize image using Sharp
        try {
          const buffer = await sharp(file.path)
            .resize(800, 800, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();
          await fs.writeFile(file.path, buffer);
        } catch (sharpError) {
          console.warn("Sharp resizing failed for review image:", sharpError);
        }
      }
    }

    let reviewDoc;
    let isUpdate = false;

    if (reviewId) {
      // Update by Review ID
      reviewDoc = await Review.findOne({ _id: reviewId, userId, isDeleted: false });
      if (!reviewDoc) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: "Review not found or unauthorized to edit."
        });
      }
      isUpdate = true;
    } else {
      // Check if user already submitted a review for this product
      reviewDoc = await Review.findOne({ userId, productId, isDeleted: false });
      if (reviewDoc) {
        isUpdate = true;
      }
    }

    if (isUpdate) {
      if (reviewDoc.images && reviewDoc.images.length > 0) {
        for (const oldImg of reviewDoc.images) {
          if (!keepImages.includes(oldImg)) {
            const oldPath = path.join(__dirname, "../../public", oldImg);
            await fs.unlink(oldPath).catch(() => { });
          }
        }
      }

      reviewDoc.images = [...keepImages, ...imageUrls];
      reviewDoc.rating = ratingVal;
      reviewDoc.title = title.trim();
      reviewDoc.review = review.trim();
      await reviewDoc.save();
    } else {
      // Create new review
      reviewDoc = new Review({
        userId,
        productId,
        rating: ratingVal,
        title: title.trim(),
        review: review.trim(),
        images: imageUrls,
        isVerifiedPurchase: true, // Only buyers get here anyway
        status: "APPROVED"
      });
      await reviewDoc.save();
    }

    // Recalculate average rating
    await reviewService.recalculateProductRating(productId);

    res.status(isUpdate ? HTTP_STATUS.OK : HTTP_STATUS.CREATED).json({
      success: true,
      message: isUpdate ? "Review updated successfully." : "Review submitted successfully.",
      review: reviewDoc
    });

  } catch (error) {
    console.error("Create/Update Review Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An error occurred while saving your review."
    });
  }
};


exports.deleteReview = async (req, res) => {
  try {
    const userId = req.user._id;
    const reviewId = req.params.id;

    const reviewDoc = await Review.findOne({ _id: reviewId, userId, isDeleted: false });
    if (!reviewDoc) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: "Review not found or unauthorized to delete."
      });
    }

    // Soft delete review
    reviewDoc.isDeleted = true;
    await reviewDoc.save();

    // Recalculate average rating
    await reviewService.recalculateProductRating(reviewDoc.productId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Review deleted successfully."
    });

  } catch (error) {
    console.error("Delete Review Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An error occurred while deleting the review."
    });
  }
};


exports.getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const sortOption = req.query.sort || "latest";

    let sortConfig = { createdAt: -1 };
    if (sortOption === "oldest") sortConfig = { createdAt: 1 };
    if (sortOption === "highest") sortConfig = { rating: -1, createdAt: -1 };
    if (sortOption === "lowest") sortConfig = { rating: 1, createdAt: -1 };

    const reviews = await Review.find({ productId, status: "APPROVED", isDeleted: false })
      .populate("userId", "name")
      .sort(sortConfig)
      .lean();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      reviews
    });
  } catch (error) {
    console.error("Get Product Reviews Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Error retrieving reviews."
    });
  }
};

exports.renderAdminReviews = async (req, res) => {
  const isAjax = req.accepts('json') && !req.accepts('html');

  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const filter = { isDeleted: false };
    const { status, rating, search } = req.query;

    if (status && status !== "ALL") {
      filter.status = status;
    }
    if (rating && rating !== "ALL") {
      filter.rating = parseInt(rating);
    }

    if (search) {
      const searchRegex = { $regex: search, $options: "i" };
      const matchingUsers = await User.find({ name: searchRegex }).select("_id");
      const matchingProducts = await Product.find({ name: searchRegex }).select("_id");

      filter.$or = [
        { userId: { $in: matchingUsers.map(u => u._id) } },
        { productId: { $in: matchingProducts.map(p => p._id) } },
        { title: searchRegex },
        { review: searchRegex }
      ];
    }

    const totalReviews = await Review.countDocuments(filter);
    const totalPages = Math.ceil(totalReviews / limit) || 1;

    const reviews = await Review.find(filter)
      .populate("userId", "name email")
      .populate("productId", "name images")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    if (isAjax) {
      return res.status(HTTP_STATUS.OK).json({
        success: true,
        reviews,
        currentPage: page,
        totalPages,
        totalReviews
      });
    }

    res.render("admin/reviews", {
      title: "Review Moderation - KAVOX Admin",
      activePage: "reviews",
      reviews,
      currentPage: page,
      totalPages,
      totalReviews,
      statusFilter: status || "ALL",
      ratingFilter: rating || "ALL",
      searchQuery: search || ""
    });

  } catch (error) {
    console.error("Admin Render Reviews Error:", error);
    if (isAjax) {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Failed to load reviews data."
      });
    }
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send("Failed to load reviews management page.");
  }
};


exports.updateReviewStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["APPROVED", "HIDDEN"].includes(status)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Invalid status value."
      });
    }

    const reviewDoc = await Review.findOne({ _id: id, isDeleted: false });
    if (!reviewDoc) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: "Review not found."
      });
    }

    reviewDoc.status = status;
    await reviewDoc.save();

    // Recalculate average rating for target product
    await reviewService.recalculateProductRating(reviewDoc.productId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Review successfully ${status.toLowerCase()}.`,
      status: reviewDoc.status
    });

  } catch (error) {
    console.error("Update Review Status Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An error occurred while moderating review status."
    });
  }
};


exports.deleteReviewAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const reviewDoc = await Review.findOne({ _id: id, isDeleted: false });
    if (!reviewDoc) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: "Review not found."
      });
    }

    reviewDoc.isDeleted = true;
    await reviewDoc.save();

    // Recalculate average rating
    await reviewService.recalculateProductRating(reviewDoc.productId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Review deleted successfully."
    });

  } catch (error) {
    console.error("Admin Delete Review Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An error occurred while deleting the review."
    });
  }
};
