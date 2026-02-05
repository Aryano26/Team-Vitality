const express = require("express");
const router = express.Router({ mergeParams: true });
const authMiddleware = require("../middleware/auth");
const { uploadReceipt } = require("../middleware/upload");
const { scanReceipt, processReceipt } = require("../controllers/receipt");

router.use(authMiddleware);

router.post("/scan", uploadReceipt.single("receipt"), scanReceipt);
router.post("/process", uploadReceipt.single("receipt"), processReceipt);

module.exports = router;
