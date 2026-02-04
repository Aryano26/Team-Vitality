const express = require("express");
const router = express.Router();
const passport = require("passport");
const { googleCallback } = require("../controllers/auth");

// Initiates Google OAuth - redirects to Google
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// Google callback - receives user from Google, creates/finds user, issues JWT, redirects to frontend
router.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  googleCallback
);

module.exports = router;
