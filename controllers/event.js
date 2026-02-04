const { Event, Wallet } = require("../models");
const finternet = require("../services/finternet");

/**
 * Create a new event and its Finternet-backed shared wallet.
 * Creator is automatically added as first participant.
 */
const createEvent = async (req, res) => {
  const { name, type, description, startDate, endDate } = req.body;
  const userId = req.user.id;

  if (!name || !name.trim()) {
    return res.status(400).json({ msg: "Event name is required" });
  }

  const event = await Event.create({
    name: name.trim(),
    type: type || "other",
    description: description || "",
    createdBy: userId,
    participants: [{ userId, role: "creator" }],
    categories: [],
    startDate: startDate || null,
    endDate: endDate || null,
    status: "active",
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
 * Join an existing event by ID.
 * User must be authenticated; after joining they become a participant (role: member).
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

  event.participants.push({ userId, role: "member" });
  await event.save();

  const populated = await Event.findById(event._id)
    .populate("createdBy", "name email")
    .populate("participants.userId", "name email")
    .lean();

  return res.status(200).json({ event: populated });
};

module.exports = {
  createEvent,
  listEvents,
  getEvent,
  joinEvent,
};
