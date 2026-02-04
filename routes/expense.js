const express = require("express");
const router = express.Router({ mergeParams: true });
const authMiddleware = require("../middleware/auth");
const { createExpense, approveExpense, settleEvent, getEventSummary, listExpenses } = require("../controllers/expense");

router.use(authMiddleware);

// Real-time summary for an event (balances, per-participant view, recent txs)
router.get("/:id/summary", getEventSummary);

// List expenses (pending + paid) for approval UI and activity
router.get("/:id/expenses", listExpenses);

// Create a new expense from the shared wallet (rule-based; may be PENDING if approval required)
router.post("/:id/expenses", createExpense);

// Approve a pending expense (deduct wallet, lock participants)
router.post("/:id/expenses/:expenseId/approve", approveExpense);

// Run settlement for the event (creator only; fair-share from locked participants)
router.post("/:id/settle", settleEvent);

module.exports = router;
