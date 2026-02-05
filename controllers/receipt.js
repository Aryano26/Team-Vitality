const { Event, Expense, Wallet, Transaction } = require("../models");
const receiptOcr = require("../services/receiptOcr");

async function getEventForUser(eventId, userId) {
  return Event.findOne({
    _id: eventId,
    $or: [{ createdBy: userId }, { "participants.userId": userId }],
  });
}

/**
 * POST /api/v1/events/:id/receipts/scan
 * Upload receipt image, run OCR, return extracted amount and description (no expense created).
 */
const scanReceipt = async (req, res) => {
  const eventId = req.params.id;
  const userId = req.user.id;
  if (!req.file || !req.file.path) {
    return res.status(400).json({ msg: "Receipt image is required" });
  }

  const event = await getEventForUser(eventId, userId);
  if (!event) return res.status(404).json({ msg: "Event not found" });
  if (event.status !== "active") {
    return res.status(400).json({ msg: "Cannot add receipts to a closed event" });
  }

  const categoryNames = (event.categories || []).map((c) => c.name);
  let result;
  try {
    result = await receiptOcr.extractFromImage(req.file.path, { categoryNames });
  } catch (err) {
    return res.status(400).json({ msg: err.message });
  }

  let suggestedCategoryId = null;
  if (result.suggestedCategoryName) {
    const cat = event.categories.find(
      (c) => c.name.toLowerCase() === result.suggestedCategoryName.toLowerCase()
    );
    if (cat) suggestedCategoryId = cat._id.toString();
  }

  return res.status(200).json({
    amount: result.amount,
    description: result.description,
    suggestedCategoryId,
    suggestedCategoryName: result.suggestedCategoryName || undefined,
    filePath: req.file.filename, // so frontend can send same file for process
  });
};

/**
 * POST /api/v1/events/:id/receipts/process
 * Upload receipt (or use previous scan), create expense and deduct from wallet.
 * Body can override: amount, description, categoryId. If file is sent, OCR runs and body overrides OCR.
 */
const processReceipt = async (req, res) => {
  const eventId = req.params.id;
  const userId = req.user.id;
  const { amount: bodyAmount, description: bodyDesc, categoryId: bodyCategoryId } = req.body || {};

  const event = await getEventForUser(eventId, userId);
  if (!event) return res.status(404).json({ msg: "Event not found" });
  if (event.status !== "active") {
    return res.status(400).json({ msg: "Cannot add receipts to a closed event" });
  }

  let amount = bodyAmount != null ? parseFloat(bodyAmount) : null;
  let description = typeof bodyDesc === "string" ? bodyDesc.trim() : null;
  let categoryId = bodyCategoryId || null;
  let billImageUrl = null;

  if (req.file && req.file.path) {
    const categoryNames = (event.categories || []).map((c) => c.name);
    let ocrResult;
    try {
      ocrResult = await receiptOcr.extractFromImage(req.file.path, { categoryNames });
    } catch (err) {
      return res.status(400).json({ msg: err.message });
    }
    if (amount == null) amount = ocrResult.amount;
    if (description == null || description === "") description = ocrResult.description;
    if (!categoryId && ocrResult.suggestedCategoryName) {
      const cat = event.categories.find(
        (c) => c.name.toLowerCase() === ocrResult.suggestedCategoryName.toLowerCase()
      );
      if (cat) categoryId = cat._id.toString();
    }
    billImageUrl = `/uploads/receipts/${req.file.filename}`;
  }

  if (amount == null || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ msg: "Valid amount is required" });
  }
  description = description || "Receipt scan";

  const wallet = await Wallet.findOne({ eventId });
  if (!wallet) return res.status(404).json({ msg: "Wallet not found" });
  const balance = typeof wallet.balance === "number" ? wallet.balance : parseFloat(wallet.balance) || 0;
  if (balance < amount) {
    return res.status(400).json({
      msg: "Insufficient wallet balance",
      required: amount,
      available: balance,
    });
  }

  const participantList = event.participants && event.participants.length > 0
    ? event.participants
    : [{ userId }];
  const shareAmount = amount / participantList.length;
  const expenseParticipants = participantList.map((p) => ({
    userId: p.userId,
    share: Math.round(shareAmount * 100) / 100,
    paid: false,
  }));

  const expense = await Expense.create({
    eventId,
    categoryId: categoryId || null,
    amount,
    currency: event.currency || "USD",
    description,
    paidBy: userId,
    participants: expenseParticipants,
    splitType: "equal",
    status: "approved",
    approvalRequired: false,
    billImage: {
      url: billImageUrl,
      uploadedAt: billImageUrl ? new Date() : null,
    },
  });

  const tx = await Transaction.create({
    eventId,
    type: "expense",
    amount,
    currency: wallet.currency || "USD",
    userId,
    description: `Receipt: ${description}`,
    status: "completed",
    metadata: { expenseId: expense._id, source: "receipt_scan" },
  });

  wallet.balance = Math.round((wallet.balance - amount) * 100) / 100;
  await wallet.save();

  expense.status = "paid";
  expense.relatedTransactionId = tx._id;
  expense.participants.forEach((p) => { p.paid = true; });
  await expense.save();

  const populated = await Expense.findById(expense._id)
    .populate("paidBy", "name email")
    .populate("participants.userId", "name email")
    .lean();

  return res.status(201).json({
    expense: populated,
    transaction: tx,
    wallet: { balance: wallet.balance, currency: wallet.currency },
    message: `Receipt recorded. ${amount} ${wallet.currency || "USD"} deducted from wallet.`,
  });
};

module.exports = {
  scanReceipt,
  processReceipt,
};
