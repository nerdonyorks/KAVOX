const express = require("express");
const router = express.Router();
const reportController = require("../controllers/reportController");
const { isAdmin, setNoCache } = require("../middleware/authMiddleware");

// Admin Sales Report Routes
router.get("/admin/report", isAdmin, setNoCache, reportController.renderReportDashboard);
router.get("/admin/reports/summary", isAdmin, setNoCache, reportController.getReportSummaryAPI);
router.get("/admin/reports/sales", isAdmin, setNoCache, reportController.getReportSalesAPI);
router.get("/admin/reports/download/pdf", isAdmin, setNoCache, reportController.downloadPdfReport);
router.get("/admin/reports/download/excel", isAdmin, setNoCache, reportController.downloadExcelReport);

module.exports = router;
