const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const { createEvent, listEvents, getEvent, joinEvent, closeEvent } = require("../controllers/event");

router.use(authMiddleware);

router.post("/", createEvent);
router.get("/", listEvents);
router.post("/:id/join", joinEvent);
router.get("/:id", getEvent);
router.patch("/:id/close", closeEvent);

module.exports = router;
