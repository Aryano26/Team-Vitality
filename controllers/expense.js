const { Event, Expense, Transaction, AuthorizationRule } = require("../models");
const finternet = require("../services/finternet");

async function getEventForUser(eventId, userId) {
  return Event.findOne({
    _id: eventId,
    $or: [{ createdBy: userId }, { "participants.userId": userId }],
  });
}

/**
 * Create an expense/bill for an event.
 * Supports bill image upload (URL), split types, and optional approval workflow.
 * DUMMY API ENDPOINT: POST /api/v1/events/:eventId/expenses
 */
const createExpense = async (req, res) => {
  const { eventId } = req.params;
  const {
    amount,
    description,
    categoryId,
    participants, // [{ userId, share }]
    splitType, // "equal" | "custom" | "percentage"
    billImageUrl,
    approvalRequired,
  } = req.body;
  const userId = req.user.id;

  // Validation
  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ msg: "Valid amount is required" });
  }

  const event = await getEventForUser(eventId, userId);
  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  if (event.status !== "active") {
    return res.status(400).json({ msg: "Cannot add expenses to a closed event" });
  }

  // Validate category if provided
  if (categoryId) {
    const category = event.categories.id(categoryId);
    if (!category) {
      return res.status(404).json({ msg: "Category not found" });
    }
  }

  // Validate participants
  if (!participants || !Array.isArray(participants) || participants.length === 0) {
    return res.status(400).json({ msg: "At least one participant is required" });
  }

  let expenseParticipants = [];

  if (splitType === "equal") {
    const shareAmount = amount / participants.length;
    expenseParticipants = participants.map((p) => ({
      userId: p.userId,
      share: shareAmount,
      paid: false,
    }));
  } else if (splitType === "custom") {
    const totalShares = participants.reduce((sum, p) => sum + (p.share || 0), 0);
    if (Math.abs(totalShares - amount) > 0.01) {
      return res.status(400).json({
        msg: "Sum of custom shares must equal the total amount",
      });
    }
    expenseParticipants = participants.map((p) => ({
      userId: p.userId,
      share: p.share,
      paid: false,
    }));
  } else if (splitType === "percentage") {
    const totalPercent = participants.reduce((sum, p) => sum + (p.share || 0), 0);
    if (Math.abs(totalPercent - 100) > 0.01) {
      return res.status(400).json({
        msg: "Sum of percentages must equal 100",
      });
    }
    expenseParticipants = participants.map((p) => ({
      userId: p.userId,
      share: (p.share / 100) * amount,
      paid: false,
    }));
  } else {
    return res.status(400).json({ msg: "Invalid split type" });
  }

  const expense = await Expense.create({
    eventId,
    categoryId: categoryId || null,
    amount,
    currency: event.currency,
    description: description || "",
    paidBy: userId,
    participants: expenseParticipants,
    splitType,
    status: approvalRequired ? "pending" : "approved",
    approvalRequired: approvalRequired || false,
    billImage: {
      url: billImageUrl || null,
      uploadedAt: billImageUrl ? new Date() : null,
    },
  });

  const populated = await Expense.findById(expense._id)
    .populate("eventId", "name")
    .populate("paidBy", "name email")
    .populate("participants.userId", "name email")
    .lean();

  return res.status(201).json({
    expense: populated,
    message: approvalRequired ? "Expense created (approval required)" : "Expense created",
  });
};

/**
 * List all expenses for an event.
 * DUMMY API ENDPOINT: GET /api/v1/events/:eventId/expenses
 */
const listExpenses = async (req, res) => {
  const { eventId } = req.params;
  const userId = req.user.id;

  const event = await getEventForUser(eventId, userId);
  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  const expenses = await Expense.find({ eventId })
    .populate("paidBy", "name email")
    .populate("participants.userId", "name email")
    .sort({ createdAt: -1 })
    .lean();

  return res.status(200).json({ expenses });
};

/**
 * Get a single expense by ID.
 * DUMMY API ENDPOINT: GET /api/v1/events/:eventId/expenses/:expenseId
 */
const getExpense = async (req, res) => {
  const { eventId, expenseId } = req.params;
  const userId = req.user.id;

  const event = await getEventForUser(eventId, userId);
  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  const expense = await Expense.findOne({ _id: expenseId, eventId })
    .populate("paidBy", "name email")
    .populate("participants.userId", "name email")
    .lean();

  if (!expense) {
    return res.status(404).json({ msg: "Expense not found" });
  }

  return res.status(200).json({ expense });
};

/**
 * Approve an expense (authorization step).
 * Only event creator or designated approvers can approve.
 * DUMMY API ENDPOINT: PATCH /api/v1/events/:eventId/expenses/:expenseId/approve
 */
const approveExpense = async (req, res) => {
  const { eventId, expenseId } = req.params;
  const userId = req.user.id;

  const event = await getEventForUser(eventId, userId);
  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  // Check authorization
  const isCreator = event.createdBy.toString() === userId.toString();
  if (!isCreator) {
    // Optionally check AuthorizationRule for approver role
    return res.status(403).json({
      msg: "Only event creator or designated approver can approve expenses",
    });
  }

  const expense = await Expense.findOne({ _id: expenseId, eventId });
  if (!expense) {
    return res.status(404).json({ msg: "Expense not found" });
  }

  if (expense.status !== "pending") {
    return res.status(400).json({
      msg: "Only pending expenses can be approved",
    });
  }

  expense.status = "approved";
  expense.approvedBy = userId;
  await expense.save();

  const populated = await Expense.findById(expense._id)
    .populate("paidBy", "name email")
    .populate("participants.userId", "name email")
    .lean();

  return res.status(200).json({
    expense: populated,
    message: "Expense approved",
  });
};

/**
 * Update an expense (before payment).
 * DUMMY API ENDPOINT: PATCH /api/v1/events/:eventId/expenses/:expenseId
 */
const updateExpense = async (req, res) => {
  const { eventId, expenseId } = req.params;
  const { description, billImageUrl, participants, splitType, amount } = req.body;
  const userId = req.user.id;

  const event = await getEventForUser(eventId, userId);
  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  const expense = await Expense.findOne({ _id: expenseId, eventId });
  if (!expense) {
    return res.status(404).json({ msg: "Expense not found" });
  }

  // Only creator or payer can update
  if (expense.paidBy.toString() !== userId.toString() && event.createdBy.toString() !== userId.toString()) {
    return res.status(403).json({ msg: "You cannot update this expense" });
  }

  if (expense.status !== "pending" && expense.status !== "approved") {
    return res.status(400).json({
      msg: "Only pending or approved expenses can be updated",
    });
  }

  if (description) expense.description = description;
  if (billImageUrl) {
    expense.billImage.url = billImageUrl;
    expense.billImage.uploadedAt = new Date();
  }

  // Recalculate splits if provided
  if (participants && splitType) {
    if (splitType === "equal") {
      const shareAmount = amount / participants.length;
      expense.participants = participants.map((p) => ({
        userId: p.userId,
        share: shareAmount,
        paid: false,
      }));
    } else if (splitType === "custom") {
      expense.participants = participants.map((p) => ({
        userId: p.userId,
        share: p.share,
        paid: false,
      }));
    } else if (splitType === "percentage") {
      expense.participants = participants.map((p) => ({
        userId: p.userId,
        share: (p.share / 100) * amount,
        paid: false,
      }));
    }
    expense.splitType = splitType;
  }

  if (amount) {
    expense.amount = amount;
  }

  await expense.save();

  const populated = await Expense.findById(expense._id)
    .populate("paidBy", "name email")
    .populate("participants.userId", "name email")
    .lean();

  return res.status(200).json({ expense: populated });
};

/**
 * Delete an expense (only if not paid).
 * DUMMY API ENDPOINT: DELETE /api/v1/events/:eventId/expenses/:expenseId
 */
const deleteExpense = async (req, res) => {
  const { eventId, expenseId } = req.params;
  const userId = req.user.id;

  const event = await getEventForUser(eventId, userId);
  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  const expense = await Expense.findOne({ _id: expenseId, eventId });
  if (!expense) {
    return res.status(404).json({ msg: "Expense not found" });
  }

  if (expense.paidBy.toString() !== userId.toString() && event.createdBy.toString() !== userId.toString()) {
    return res.status(403).json({ msg: "You cannot delete this expense" });
  }

  if (expense.status === "paid") {
    return res.status(400).json({
      msg: "Cannot delete an already paid expense",
    });
  }

  await Expense.deleteOne({ _id: expenseId });

  return res.status(200).json({
    message: "Expense deleted",
  });
};

/**
 * Get expense summary for event (total spent, by category, etc).
 * DUMMY API ENDPOINT: GET /api/v1/events/:eventId/expenses/summary
 */
const getExpenseSummary = async (req, res) => {
  const { eventId } = req.params;
  const userId = req.user.id;

  const event = await getEventForUser(eventId, userId);
  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  const expenses = await Expense.find({ eventId }).lean();

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const approvedExpenses = expenses.filter((e) => e.status === "approved" || e.status === "paid");
  const totalApproved = approvedExpenses.reduce((sum, e) => sum + e.amount, 0);

  const byCategory = {};
  expenses.forEach((e) => {
    const catId = e.categoryId?.toString() || "uncategorized";
    if (!byCategory[catId]) byCategory[catId] = 0;
    byCategory[catId] += e.amount;
  });

  const byPaidBy = {};
  expenses.forEach((e) => {
    const userId = e.paidBy.toString();
    if (!byPaidBy[userId]) byPaidBy[userId] = 0;
    byPaidBy[userId] += e.amount;
  });

  return res.status(200).json({
    summary: {
      totalExpenses,
      totalApproved,
      pendingExpenses: totalExpenses - totalApproved,
      byCategory,
      byPaidBy,
      expenseCount: expenses.length,
    },
  });
};

module.exports = {
  createExpense,
  listExpenses,
  getExpense,
  approveExpense,
  updateExpense,
  deleteExpense,
  getExpenseSummary,
};
