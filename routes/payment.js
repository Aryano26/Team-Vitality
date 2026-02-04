const express = require("express");
const router = express.Router({ mergeParams: true });
const authMiddleware = require("../middleware/auth");
const {
  makePayment,
  getPaymentHistory,
  getPaymentSummary,
  getMyAuthorization,
} = require("../controllers/payment");

router.use(authMiddleware);

router.post("/", makePayment);
router.get("/", getPaymentHistory);
router.get("/summary", getPaymentSummary);
router.get("/my-authorization", getMyAuthorization);

module.exports = router;
