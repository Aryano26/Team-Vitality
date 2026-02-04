const express = require("express");
const router = express.Router({ mergeParams: true });
const authMiddleware = require("../middleware/auth");
const {
  createExpense,
  listExpenses,
  getExpense,
  approveExpense,
  updateExpense,
  deleteExpense,
  getExpenseSummary,
} = require("../controllers/expense");

router.use(authMiddleware);

router.post("/", createExpense);
router.get("/", listExpenses);
router.get("/summary", getExpenseSummary);
router.get("/:expenseId", getExpense);
router.patch("/:expenseId", updateExpense);
router.patch("/:expenseId/approve", approveExpense);
router.delete("/:expenseId", deleteExpense);

module.exports = router;
