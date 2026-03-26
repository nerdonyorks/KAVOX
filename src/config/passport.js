const passport = require("passport")
const GoogleStrategy = require("passport-google-oauth20").Strategy
const User = require("../models/userModel")

passport.use(new GoogleStrategy({

  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "http://localhost:3000/api/auth/google/callback"

}, async (accessToken, refreshToken, profile, done) => {

  try {

    const email = profile.emails?.[0]?.value

    if (!email) {
      return done(new Error("No email found"), null)
    }

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name: profile.displayName,
        email: email,
        googleId: profile.id
      });
    }

    if (user && !user.isActive) {
      return done(null, false, { message: "suspended" });
    }

    return done(null, user)

  } catch (err) {
    return done(err, null)
  }

}))
