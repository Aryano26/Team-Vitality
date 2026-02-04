const express = require("express");
const router = express.Router({ mergeParams: true });
const authMiddleware = require("../middleware/auth");
const { createExpense, settleEvent, getEventSummary } = require("../controllers/expense");

router.use(authMiddleware);

// Real-time summary for an event (balances, per-participant view, recent txs)
router.get("/:id/summary", getEventSummary);

// Create a new expense from the shared wallet
router.post("/:id/expenses", createExpense);

// Run settlement for the event (creator only)
router.post("/:id/settle", settleEvent);

module.exports = router;
