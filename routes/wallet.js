const express = require("express");
const router = express.Router({ mergeParams: true });
const authMiddleware = require("../middleware/auth");
const { getWallet, deposit, listTransactions } = require("../controllers/wallet");

router.use(authMiddleware);

router.get("/", getWallet);
router.post("/deposits", deposit);
router.get("/transactions", listTransactions);

module.exports = router;
