const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * Initiates Google OAuth - redirects user to Google consent screen.
 * Handled by passport middleware.
 */

/**
 * Callback after Google OAuth - creates/finds user, issues JWT, redirects to frontend with token.
 */
const googleCallback = async (req, res) => {
  try {
    const profile = req.user;
    const { id: googleId, displayName: name, emails } = profile;
    const email = emails?.[0]?.value;

    if (!email) {
      return res.redirect(
        `${process.env.FRONTEND_URL || "http://localhost:5173"}/login?error=no_email`
      );
    }

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name: name || email.split("@")[0],
        email,
        password: null,
      });
    }

    const token = jwt.sign(
      { id: user._id, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    res.redirect(`${frontendUrl}/login?token=${token}`);
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    res.redirect(`${frontendUrl}/login?error=oauth_failed`);
  }
};

module.exports = { googleCallback };
