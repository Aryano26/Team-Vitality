const { Event, Expense, Wallet, Transaction, AuthorizationRule } = require("../models");
const finternet = require("../services/finternet");

async function getEventForUser(eventId, userId) {
  return Event.findOne({
    _id: eventId,
    $or: [{ createdBy: userId }, { "participants.userId": userId }],
  });
}

/**
 * Make a payment from the shared wallet to pay an approved expense.
 * Checks authorization rules, deducts from wallet, links expense to transaction.
 * DUMMY API ENDPOINT: POST /api/v1/events/:eventId/payments
 */
const makePayment = async (req, res) => {
  const { eventId } = req.params;
  const { expenseId, amount } = req.body;
  const userId = req.user.id;

  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ msg: "Valid amount is required" });
  }

  const event = await getEventForUser(eventId, userId);
  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  // Check authorization
  const authRule = await AuthorizationRule.findOne({ eventId, status: "active" });
  if (authRule) {
    const authorizedUser = authRule.authorizedUsers.find(
      (au) => au.userId.toString() === userId.toString()
    );

    if (!authorizedUser) {
      return res.status(403).json({
        msg: "You are not authorized to make payments from this event",
      });
    }

    if (authorizedUser.spendingLimit && amount > authorizedUser.spendingLimit) {
      return res.status(403).json({
        msg: `Amount exceeds your spending limit of ${authorizedUser.spendingLimit}`,
      });
    }

    if (amount > authRule.approvalThreshold && !authorizedUser.requiresApproval) {
      return res.status(403).json({
        msg: `Amount exceeds approval threshold. Requires approval.`,
      });
    }
  }

  // Get wallet
  const wallet = await Wallet.findOne({ eventId });
  if (!wallet) {
    return res.status(404).json({ msg: "Wallet not found" });
  }

  if (wallet.balance < amount) {
    return res.status(400).json({
      msg: "Insufficient wallet balance",
      required: amount,
      available: wallet.balance,
    });
  }

  // Get expense if provided
  let expense = null;
  if (expenseId) {
    expense = await Expense.findOne({ _id: expenseId, eventId });
    if (!expense) {
      return res.status(404).json({ msg: "Expense not found" });
    }

    if (expense.status !== "approved") {
      return res.status(400).json({
        msg: "Only approved expenses can be paid",
      });
    }

    if (expense.amount !== amount) {
      return res.status(400).json({
        msg: "Payment amount must match expense amount",
      });
    }
  }

  // Create payment transaction
  const tx = await Transaction.create({
    eventId,
    type: "expense",
    amount,
    currency: event.currency,
    userId, // The person making the payment
    description: `Payment from basket for expense ${expenseId || "unlinked"}`,
    status: "completed",
    metadata: {
      expenseId,
      paidFrom: "sharedBasket",
    },
  });

  // Deduct from wallet
  wallet.balance -= amount;
  await wallet.save();

  // Update expense if linked
  if (expense) {
    expense.status = "paid";
    expense.relatedTransactionId = tx._id;
    expense.participants.forEach((p) => {
      p.paid = true;
    });
    await expense.save();
  }

  return res.status(201).json({
    transaction: tx,
    wallet: {
      eventId: wallet.eventId,
      balance: wallet.balance,
      currency: wallet.currency,
    },
    message: "Payment completed from shared basket",
  });
};

/**
 * Get payment history for an event.
 * DUMMY API ENDPOINT: GET /api/v1/events/:eventId/payments
 */
const getPaymentHistory = async (req, res) => {
  const { eventId } = req.params;
  const userId = req.user.id;

  const event = await getEventForUser(eventId, userId);
  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  const payments = await Transaction.find({ eventId, type: "expense" })
    .populate("userId", "name email")
    .sort({ createdAt: -1 })
    .lean();

  return res.status(200).json({ payments });
};

/**
 * Get payment summary for event.
 * DUMMY API ENDPOINT: GET /api/v1/events/:eventId/payments/summary
 */
const getPaymentSummary = async (req, res) => {
  const { eventId } = req.params;
  const userId = req.user.id;

  const event = await getEventForUser(eventId, userId);
  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  const wallet = await Wallet.findOne({ eventId });
  const deposits = await Transaction.find({ eventId, type: "deposit", status: "completed" });
  const payments = await Transaction.find({ eventId, type: "expense", status: "completed" });

  const totalDeposited = deposits.reduce((sum, d) => sum + d.amount, 0);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

  return res.status(200).json({
    summary: {
      totalDeposited,
      totalPaid,
      remainingInBasket: wallet?.balance || 0,
      paymentCount: payments.length,
      depositCount: deposits.length,
    },
  });
};

/**
 * Get payment authorization status and limits for current user.
 * DUMMY API ENDPOINT: GET /api/v1/events/:eventId/payments/my-authorization
 */
const getMyAuthorization = async (req, res) => {
  const { eventId } = req.params;
  const userId = req.user.id;

  const event = await getEventForUser(eventId, userId);
  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  const authRule = await AuthorizationRule.findOne({ eventId, status: "active" })
    .populate("authorizedUsers.userId")
    .lean();

  if (!authRule) {
    return res.status(200).json({
      authorization: {
        authorized: false,
        reason: "No active authorization rules",
      },
    });
  }

  const authorizedUser = authRule.authorizedUsers.find(
    (au) => au.userId._id?.toString() === userId.toString()
  );

  if (!authorizedUser) {
    return res.status(200).json({
      authorization: {
        authorized: false,
        reason: "You are not in the authorized users list",
      },
    });
  }

  return res.status(200).json({
    authorization: {
      authorized: true,
      spendingLimit: authorizedUser.spendingLimit,
      requiresApproval: authorizedUser.requiresApproval,
      approvalThreshold: authRule.approvalThreshold,
    },
  });
};

module.exports = {
  makePayment,
  getPaymentHistory,
  getPaymentSummary,
  getMyAuthorization,
};
