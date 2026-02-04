const { Event, AuthorizationRule } = require("../models");

async function getEventForUser(eventId, userId) {
  return Event.findOne({
    _id: eventId,
    $or: [{ createdBy: userId }, { "participants.userId": userId }],
  });
}

/**
 * Create or update authorization rules for an event.
 * Only event creator can set rules.
 * DUMMY API ENDPOINT: POST /api/v1/events/:eventId/authorization-rules
 */
const createAuthorizationRules = async (req, res) => {
  const { eventId } = req.params;
  const {
    authorizedUsers, // [{ userId, spendingLimit?, requiresApproval? }]
    approvalThreshold,
    approvers, // [userId]
    maxParticipantShare,
  } = req.body;
  const userId = req.user.id;

  const event = await getEventForUser(eventId, userId);
  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  const isCreator = event.createdBy.toString() === userId.toString();
  if (!isCreator) {
    return res.status(403).json({
      msg: "Only event creator can set authorization rules",
    });
  }

  let rule = await AuthorizationRule.findOne({ eventId });

  if (!rule) {
    rule = await AuthorizationRule.create({
      eventId,
      createdBy: userId,
      authorizedUsers: authorizedUsers || [],
      approvalThreshold: approvalThreshold || 500,
      approvers: approvers || [userId],
      maxParticipantShare: maxParticipantShare || null,
    });
  } else {
    if (authorizedUsers) rule.authorizedUsers = authorizedUsers;
    if (approvalThreshold) rule.approvalThreshold = approvalThreshold;
    if (approvers) rule.approvers = approvers;
    if (maxParticipantShare !== undefined) rule.maxParticipantShare = maxParticipantShare;
    await rule.save();
  }

  const populated = await AuthorizationRule.findById(rule._id)
    .populate("createdBy", "name email")
    .populate("authorizedUsers.userId", "name email")
    .populate("approvers", "name email")
    .lean();

  return res.status(201).json({
    rule: populated,
    message: "Authorization rules created/updated",
  });
};

/**
 * Get authorization rules for an event.
 * DUMMY API ENDPOINT: GET /api/v1/events/:eventId/authorization-rules
 */
const getAuthorizationRules = async (req, res) => {
  const { eventId } = req.params;
  const userId = req.user.id;

  const event = await getEventForUser(eventId, userId);
  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  const rule = await AuthorizationRule.findOne({ eventId })
    .populate("createdBy", "name email")
    .populate("authorizedUsers.userId", "name email")
    .populate("approvers", "name email")
    .lean();

  if (!rule) {
    return res.status(200).json({
      rule: null,
      message: "No authorization rules defined for this event",
    });
  }

  return res.status(200).json({ rule });
};

/**
 * Add authorized user or update their spending limit.
 * DUMMY API ENDPOINT: PATCH /api/v1/events/:eventId/authorization-rules/authorize/:targetUserId
 */
const authorizeUser = async (req, res) => {
  const { eventId, targetUserId } = req.params;
  const { spendingLimit, requiresApproval } = req.body;
  const userId = req.user.id;

  const event = await getEventForUser(eventId, userId);
  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  const isCreator = event.createdBy.toString() === userId.toString();
  if (!isCreator) {
    return res.status(403).json({
      msg: "Only event creator can manage authorization rules",
    });
  }

  let rule = await AuthorizationRule.findOne({ eventId });
  if (!rule) {
    rule = await AuthorizationRule.create({
      eventId,
      createdBy: userId,
      authorizedUsers: [{ userId: targetUserId, spendingLimit, requiresApproval }],
      approvers: [userId],
    });
  } else {
    const existingIndex = rule.authorizedUsers.findIndex(
      (au) => au.userId.toString() === targetUserId
    );

    if (existingIndex >= 0) {
      if (spendingLimit !== undefined) rule.authorizedUsers[existingIndex].spendingLimit = spendingLimit;
      if (requiresApproval !== undefined) rule.authorizedUsers[existingIndex].requiresApproval = requiresApproval;
    } else {
      rule.authorizedUsers.push({
        userId: targetUserId,
        spendingLimit: spendingLimit || null,
        requiresApproval: requiresApproval || false,
      });
    }
    await rule.save();
  }

  const populated = await AuthorizationRule.findById(rule._id)
    .populate("authorizedUsers.userId", "name email")
    .lean();

  return res.status(200).json({
    rule: populated,
    message: "User authorization updated",
  });
};

/**
 * Remove user from authorized list.
 * DUMMY API ENDPOINT: DELETE /api/v1/events/:eventId/authorization-rules/authorize/:targetUserId
 */
const removeAuthorization = async (req, res) => {
  const { eventId, targetUserId } = req.params;
  const userId = req.user.id;

  const event = await getEventForUser(eventId, userId);
  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  const isCreator = event.createdBy.toString() === userId.toString();
  if (!isCreator) {
    return res.status(403).json({
      msg: "Only event creator can manage authorization rules",
    });
  }

  const rule = await AuthorizationRule.findOne({ eventId });
  if (!rule) {
    return res.status(404).json({ msg: "No authorization rules found" });
  }

  rule.authorizedUsers = rule.authorizedUsers.filter(
    (au) => au.userId.toString() !== targetUserId
  );
  await rule.save();

  return res.status(200).json({
    rule,
    message: "User authorization removed",
  });
};

/**
 * Add approver to the rules.
 * DUMMY API ENDPOINT: PATCH /api/v1/events/:eventId/authorization-rules/approvers
 */
const addApprover = async (req, res) => {
  const { eventId } = req.params;
  const { approverId } = req.body;
  const userId = req.user.id;

  const event = await getEventForUser(eventId, userId);
  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  const isCreator = event.createdBy.toString() === userId.toString();
  if (!isCreator) {
    return res.status(403).json({
      msg: "Only event creator can manage approvers",
    });
  }

  let rule = await AuthorizationRule.findOne({ eventId });
  if (!rule) {
    rule = await AuthorizationRule.create({
      eventId,
      createdBy: userId,
      approvers: [approverId],
    });
  } else {
    if (!rule.approvers.some((a) => a.toString() === approverId)) {
      rule.approvers.push(approverId);
      await rule.save();
    }
  }

  const populated = await AuthorizationRule.findById(rule._id)
    .populate("approvers", "name email")
    .lean();

  return res.status(200).json({
    rule: populated,
    message: "Approver added",
  });
};

/**
 * Check if user can make a payment (is authorized, within limits).
 * DUMMY API ENDPOINT: GET /api/v1/events/:eventId/authorization-rules/check/:targetUserId
 */
const checkAuthorization = async (req, res) => {
  const { eventId, targetUserId } = req.params;
  const { amount } = req.query;
  const userId = req.user.id;

  const event = await getEventForUser(eventId, userId);
  if (!event) {
    return res.status(404).json({ msg: "Event not found" });
  }

  const rule = await AuthorizationRule.findOne({ eventId });

  if (!rule || rule.status !== "active") {
    return res.status(200).json({
      authorized: false,
      reason: "No active authorization rules",
    });
  }

  const authorizedUser = rule.authorizedUsers.find(
    (au) => au.userId.toString() === targetUserId
  );

  if (!authorizedUser) {
    return res.status(200).json({
      authorized: false,
      reason: "User is not in authorized list",
    });
  }

  if (authorizedUser.spendingLimit && amount && parseFloat(amount) > authorizedUser.spendingLimit) {
    return res.status(200).json({
      authorized: false,
      reason: `Amount exceeds spending limit of ${authorizedUser.spendingLimit}`,
      spendingLimit: authorizedUser.spendingLimit,
    });
  }

  const requiresApproval = authorizedUser.requiresApproval || (amount && parseFloat(amount) > rule.approvalThreshold);

  return res.status(200).json({
    authorized: true,
    requiresApproval,
    spendingLimit: authorizedUser.spendingLimit,
    approvalThreshold: rule.approvalThreshold,
  });
};

module.exports = {
  createAuthorizationRules,
  getAuthorizationRules,
  authorizeUser,
  removeAuthorization,
  addApprover,
  checkAuthorization,
};
