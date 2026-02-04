const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const { createEvent, listEvents, getEvent, joinEvent } = require("../controllers/event");

router.use(authMiddleware);

router.post("/", createEvent);
router.get("/", listEvents);
router.post("/:id/join", joinEvent);
router.get("/:id", getEvent);

module.exports = router;
