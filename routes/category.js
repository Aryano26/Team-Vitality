const express = require("express");
const router = express.Router({ mergeParams: true });
const authMiddleware = require("../middleware/auth");
const {
  createCategory,
  joinCategory,
  leaveCategory,
  updateCategory,
  listCategories,
} = require("../controllers/category");

router.use(authMiddleware);

router.get("/", listCategories);
router.post("/", createCategory);
router.put("/:categoryId/join", joinCategory);
router.put("/:categoryId/leave", leaveCategory);
router.patch("/:categoryId", updateCategory);

module.exports = router;
