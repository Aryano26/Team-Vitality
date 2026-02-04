const express = require("express");
const router = express.Router();
const { finternetWebhook } = require("../controllers/webhook");

router.post(
  "/finternet",
  express.raw({ type: "application/json" }),
  (req, res, next) => {
    req.rawBody = req.body && typeof req.body.toString === "function" ? req.body.toString("utf8") : "";
    try {
      req.body = req.rawBody ? JSON.parse(req.rawBody) : {};
    } catch {
      req.body = {};
    }
    next();
  },
  finternetWebhook
);

module.exports = router;
