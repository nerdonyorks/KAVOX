const express = require("express");
const router = express.Router();
const offerController = require("../controllers/offerController");
const { isAdmin, setNoCache } = require("../middleware/authMiddleware");

// Product Offers Management
router.get("/admin/offers/products", isAdmin, setNoCache, offerController.listProductOffers);
router.post("/api/admin/offers/products", isAdmin, offerController.createProductOffer);
router.put("/api/admin/offers/products/:id", isAdmin, offerController.updateProductOffer);
router.delete("/api/admin/offers/products/:id", isAdmin, offerController.deleteProductOffer);

// Category Offers Management
router.get("/admin/offers/categories", isAdmin, setNoCache, offerController.listCategoryOffers);
router.post("/api/admin/offers/categories", isAdmin, offerController.createCategoryOffer);
router.put("/api/admin/offers/categories/:id", isAdmin, offerController.updateCategoryOffer);
router.delete("/api/admin/offers/categories/:id", isAdmin, offerController.deleteCategoryOffer);

module.exports = router;
