const express = require("express");
const router = express.Router({ mergeParams: true });
const authMiddleware = require("../middleware/auth");
const {
  calculateSettlement,
  executeSettlement,
  processRefund,
  getSettlementStatus,
  completeSettlement,
} = require("../controllers/settlement");

router.use(authMiddleware);

router.get("/calculate", calculateSettlement);
router.get("/", getSettlementStatus);
router.post("/execute", executeSettlement);
router.post("/refund/:participantId", processRefund);
router.patch("/complete", completeSettlement);

module.exports = router;
