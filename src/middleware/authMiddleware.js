// Protect routes that require a user to trace (e.g., /account, /profile/edit)
exports.isLoggedIn = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  res.redirect("/login");
};

// Protect routes that should not be visible to logged in users (e.g., /login, /signup)
exports.isLoggedOut = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return res.redirect("/");
  }
  next();
};

// Set cache control headers to prevent back-button showing cached protected pages after logout
exports.setNoCache = (req, res, next) => {
  res.set("Cache-Control", "no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
};

// Protect admin routes
exports.isAdmin = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated() && req.user.role === 'admin') {
    return next();
  }
  res.redirect("/admin/login");
};
