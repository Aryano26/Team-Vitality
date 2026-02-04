const { Event, Transaction, User } = require("../models");

async function getEventForUser(eventId, userId) {
  return Event.findOne({
    _id: eventId,
    $or: [{ createdBy: userId }, { "participants.userId": userId }],
  });
}

/**
 * Create a category for an event. Only event participants can create.
 */
const createCategory = async (req, res) => {
  const { id: eventId } = req.params;
  const { name, spendLimit } = req.body;
  const userId = req.user.id;

  if (!name || !name.trim()) {
    return res.status(400).json({ msg: "Category name is required" });
  }

  const event = await getEventForUser(eventId, userId);
  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }
  if (event.status !== "active") {
    return res.status(400).json({ msg: "Cannot add categories to a closed event" });
  }

  const exists = event.categories.some((c) => c.name.toLowerCase() === name.trim().toLowerCase());
  if (exists) {
    return res.status(400).json({ msg: "Category with this name already exists" });
  }

  event.categories.push({
    name: name.trim(),
    participantIds: [],
    spendLimit: spendLimit != null && spendLimit >= 0 ? Number(spendLimit) : null,
  });
  await event.save();

  const category = event.categories[event.categories.length - 1];
  return res.status(201).json({ category });
};

/**
 * Join a category. User must be event participant.
 */
const joinCategory = async (req, res) => {
  const { id: eventId, categoryId } = req.params;
  const userId = req.user.id;

  const event = await getEventForUser(eventId, userId);
  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  const category = event.categories.id(categoryId);
  if (!category) {
    return res.status(404).json({ msg: "Category not found" });
  }

  const userIdStr = userId.toString();
  if (category.participantIds.some((id) => id.toString() === userIdStr)) {
    return res.status(400).json({ msg: "Already in this category" });
  }

  category.participantIds.push(userId);
  await event.save();

  return res.status(200).json({
    category,
    message: "Joined category",
  });
};

/**
 * Leave a category.
 */
const leaveCategory = async (req, res) => {
  const { id: eventId, categoryId } = req.params;
  const userId = req.user.id;

  const event = await getEventForUser(eventId, userId);
  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  const category = event.categories.id(categoryId);
  if (!category) {
    return res.status(404).json({ msg: "Category not found" });
  }

  category.participantIds = category.participantIds.filter(
    (id) => id.toString() !== userId.toString()
  );
  await event.save();

  return res.status(200).json({
    category,
    message: "Left category",
  });
};

/**
 * Update category (e.g. spend limit). Only creator or organizer.
 */
const updateCategory = async (req, res) => {
  const { id: eventId, categoryId } = req.params;
  const { spendLimit } = req.body;
  const userId = req.user.id;

  const event = await getEventForUser(eventId, userId);
  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  const isCreator = event.createdBy.toString() === userId.toString();
  if (!isCreator) {
    return res.status(403).json({ msg: "Only event creator can update categories" });
  }

  const category = event.categories.id(categoryId);
  if (!category) {
    return res.status(404).json({ msg: "Category not found" });
  }

  if (spendLimit != null) {
    category.spendLimit = spendLimit >= 0 ? Number(spendLimit) : null;
  }
  await event.save();

  return res.status(200).json({ category });
};

/**
 * Get categories with current spend (from expenses). Used for display.
 */
const listCategories = async (req, res) => {
  const { id: eventId } = req.params;
  const userId = req.user.id;

  const event = await getEventForUser(eventId, userId);
  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  const categories = event.categories.map((c) => c.toObject());
  const categoryIds = categories.map((c) => c._id);

  const expenseTotals = await Transaction.aggregate([
    { $match: { eventId: event._id, type: "expense", status: "completed", categoryId: { $in: categoryIds } } },
    { $group: { _id: "$categoryId", total: { $sum: "$amount" } } },
  ]);

  const spendByCategory = Object.fromEntries(
    expenseTotals.map((r) => [r._id.toString(), r.total])
  );

  const userIdStr = userId.toString();
  const enriched = await Promise.all(
    categories.map(async (cat) => {
      const currentSpend = spendByCategory[cat._id.toString()] || 0;
      const participants = await User.find({ _id: { $in: cat.participantIds } })
        .select("name email")
        .lean();
      const isParticipant = cat.participantIds.some((id) => id.toString() === userIdStr);
      return {
        ...cat,
        participants,
        currentSpend,
        spendLimit: cat.spendLimit,
        remaining:
          cat.spendLimit != null ? Math.max(0, cat.spendLimit - currentSpend) : null,
        isParticipant,
      };
    })
  );

  return res.status(200).json({ categories: enriched });
};

module.exports = {
  createCategory,
  joinCategory,
  leaveCategory,
  updateCategory,
  listCategories,
};
