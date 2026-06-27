
const Banner = require("../models/bannerModel");
const sharp = require("sharp");
const fs = require("fs").promises;
const path = require("path");
const { HTTP_STATUS } = require("../utils/constants");

/**
 * Render Banners List view
 */
exports.renderBannersList = async (req, res) => {
  try {
    const banners = await Banner.find({}).sort({ createdAt: -1 }).lean();
    res.render("admin/banners", {
      title: "Banner Management - KAVOX",
      activePage: "banners",
      banners
    });
  } catch (error) {
    console.error("Render Banners Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send("Failed to load banners page.");
  }
};

/**
 * Create a new Banner
 */
exports.createBanner = async (req, res) => {
  try {
    const { title, subtitle, link, isActive, startDate, endDate } = req.body;

    if (!title || !link) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Banner Title and Link redirect URL are required."
      });
    }

    if (!req.file) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Banner Image file is required."
      });
    }

    // Process and optimize image using Sharp (Standardized hero banner format 1200x500)
    const file = req.file;
    const processedUrl = `/uploads/products/${file.filename}`;
    try {
      const buffer = await sharp(file.path)
        .resize(1200, 500, { fit: "cover" })
        .jpeg({ quality: 85 })
        .toBuffer();
      await fs.writeFile(file.path, buffer);
    } catch (sharpError) {
      console.warn("Sharp resizing failed, keeping original upload:", sharpError);
    }

    const newBanner = new Banner({
      title: title.trim(),
      subtitle: subtitle ? subtitle.trim() : "",
      image: processedUrl,
      link: link.trim(),
      isActive: isActive === "true" || isActive === true,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null
    });

    await newBanner.save();

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: "Banner created successfully."
    });
  } catch (error) {
    console.error("Create Banner Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to create banner."
    });
  }
};

/**
 * Update an existing Banner
 */
exports.updateBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, subtitle, link, isActive, startDate, endDate } = req.body;

    if (!title || !link) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Banner Title and Link redirect URL are required."
      });
    }

    const banner = await Banner.findById(id);
    if (!banner) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: "Banner not found."
      });
    }

    let imageUrl = banner.image;

    // Process new uploaded image if available
    if (req.file) {
      const file = req.file;
      imageUrl = `/uploads/products/${file.filename}`;
      try {
        const buffer = await sharp(file.path)
          .resize(1200, 500, { fit: "cover" })
          .jpeg({ quality: 85 })
          .toBuffer();
        await fs.writeFile(file.path, buffer);

        // Delete old image file
        const oldPath = path.join(__dirname, "../../public", banner.image);
        await fs.unlink(oldPath).catch(() => {});
      } catch (sharpError) {
        console.warn("Image update processing failed:", sharpError);
      }
    }

    banner.title = title.trim();
    banner.subtitle = subtitle ? subtitle.trim() : "";
    banner.image = imageUrl;
    banner.link = link.trim();
    banner.isActive = isActive === "true" || isActive === true;
    banner.startDate = startDate ? new Date(startDate) : null;
    banner.endDate = endDate ? new Date(endDate) : null;

    await banner.save();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Banner updated successfully."
    });
  } catch (error) {
    console.error("Update Banner Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to update banner."
    });
  }
};

/**
 * Toggle Banner active status inline
 */
exports.toggleBannerStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const banner = await Banner.findById(id);

    if (!banner) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: "Banner not found."
      });
    }

    banner.isActive = !banner.isActive;
    await banner.save();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: banner.isActive ? "Banner activated successfully." : "Banner deactivated successfully.",
      isActive: banner.isActive
    });
  } catch (error) {
    console.error("Toggle Banner Status Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to toggle status."
    });
  }
};

/**
 * Delete Banner
 */
exports.deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const banner = await Banner.findById(id);

    if (!banner) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: "Banner not found."
      });
    }

    // Attempt to unlink local image file
    const imagePath = path.join(__dirname, "../../public", banner.image);
    await fs.unlink(imagePath).catch(() => {});

    await Banner.findByIdAndDelete(id);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Banner deleted successfully."
    });
  } catch (error) {
    console.error("Delete Banner Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to delete banner."
    });
  }
};
