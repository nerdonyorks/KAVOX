const User = require("../models/userModel");

exports.handleGoogleAuth = async (profile) => {
    const email = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null;
    
    if (!email) {
      throw new Error("No primary email found on Google Account.");
    }

    let user = await User.findOne({ email });

    // Existing user found
    if (user) {
        return { user, isNew: false };
    }

    // Register a brand new google OAuth profile
    user = await User.create({
        name: profile.displayName,
        email: email,
        googleId: profile.id
    });

    return { user, isNew: true };
};
