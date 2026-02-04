const express = require("express");
const router = express.Router({ mergeParams: true });
const authMiddleware = require("../middleware/auth");
const {
  createAuthorizationRules,
  getAuthorizationRules,
  authorizeUser,
  removeAuthorization,
  addApprover,
  checkAuthorization,
} = require("../controllers/authorization");

router.use(authMiddleware);

router.post("/", createAuthorizationRules);
router.get("/", getAuthorizationRules);
router.patch("/authorize/:targetUserId", authorizeUser);
router.delete("/authorize/:targetUserId", removeAuthorization);
router.patch("/approvers", addApprover);
router.get("/check/:targetUserId", checkAuthorization);

module.exports = router;
