const { Event, Wallet } = require("../models");
const finternet = require("../services/finternet");

/**
 * Create a new event and its shared wallet.
 * STEP 1: Event creation with optional startTime, endTime, defaultSpendingRules, settlementTrigger.
 * Wallet is initialized with balance = 0; no money moves. Creator is first participant with depositedAmount = 0.
 */
const createEvent = async (req, res) => {
  const {
    name,
    eventName,
    type,
    description,
    startDate,
    endDate,
    startTime,
    endTime,
    defaultSpendingRules,
    settlementTrigger,
  } = req.body;
  const userId = req.user.id;

  const eventNameFinal = (name || eventName || "").trim();
  if (!eventNameFinal) {
    return res.status(400).json({ msg: "Event name is required" });
  }

  const start = startTime || startDate || null;
  const end = endTime || endDate || null;

  const event = await Event.create({
    name: eventNameFinal,
    type: type || "other",
    description: description || "",
    createdBy: userId,
    participants: [{ userId, role: "creator", depositedAmount: 0 }],
    categories: [],
    startDate: start,
    endDate: end,
    startTime: start,
    endTime: end,
    status: "active",
    defaultSpendingRules: defaultSpendingRules || undefined,
    settlementTrigger: settlementTrigger === "auto" ? "auto" : "manual",
  });

  const finternetResult = await finternet.createWallet(event._id.toString());
  const finternetWalletId = finternetResult.success ? finternetResult.walletId : null;

  await Wallet.create({
    eventId: event._id,
    balance: 0,
    currency: "USD",
    finternetWalletId,
    status: "active",
  });

  return res.status(201).json({ event });
};

/**
 * List events where the user is a participant (created or joined).
 */
const listEvents = async (req, res) => {
  const userId = req.user.id;

  const events = await Event.find({
    $or: [{ createdBy: userId }, { "participants.userId": userId }],
  })
    .populate("createdBy", "name email")
    .populate("participants.userId", "name email")
    .sort({ updatedAt: -1 })
    .lean();

  return res.status(200).json({ events });
};

/**
 * Get a single event by ID (only if user is participant).
 */
const getEvent = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const event = await Event.findOne({
    _id: id,
    $or: [{ createdBy: userId }, { "participants.userId": userId }],
  })
    .populate("createdBy", "name email")
    .populate("participants.userId", "name email")
    .lean();

  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  return res.status(200).json({ event });
};

/**
 * Join an existing event by ID (STEP 2: Participant joining).
 * Stores joinedAt timestamp; initializes depositedAmount = 0. Does NOT charge money or auto-join any category.
 */
const joinEvent = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const event = await Event.findById(id);
  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  if (event.status !== "active") {
    return res.status(400).json({ msg: "Cannot join an inactive event" });
  }

  const userIdStr = userId.toString();
  const alreadyParticipant = event.participants.some(
    (p) => p.userId.toString() === userIdStr
  );
  if (alreadyParticipant) {
    return res.status(400).json({ msg: "You are already a participant in this event" });
  }

  event.participants.push({ userId, role: "member", joinedAt: new Date(), depositedAmount: 0 });
  await event.save();

  const populated = await Event.findById(event._id)
    .populate("createdBy", "name email")
    .populate("participants.userId", "name email")
    .lean();

  return res.status(200).json({ event: populated });
};

/**
 * Close an event: prevent new expenses, trigger settlement, then mark CLOSED.
 * STEP 9/12: Once settlement is done, event is marked closed and records are locked.
 */
const closeEvent = async (req, res) => {
  const { id: eventId } = req.params;
  const userId = req.user.id;

  const event = await Event.findById(eventId);
  if (!event) return res.status(404).json({ msg: "Event not found" });
  if (event.createdBy.toString() !== userId.toString()) {
    return res.status(403).json({ msg: "Only the event creator can close the event" });
  }
  if (event.status === "closed") {
    return res.status(400).json({ msg: "Event is already closed" });
  }

  event.status = "closed";
  await event.save();

  const wallet = await Wallet.findOne({ eventId });
  if (wallet) {
    wallet.status = "closed";
    await wallet.save();
  }

  return res.status(200).json({ event, message: "Event closed" });
};

module.exports = {
  createEvent,
  listEvents,
  getEvent,
  joinEvent,
  closeEvent,
};
