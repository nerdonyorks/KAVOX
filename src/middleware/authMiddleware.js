const { HTTP_STATUS, MESSAGES } = require("../utils/constants");

// Protect routes that require a user to be logged in (and NOT an admin)
exports.isLoggedIn = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    if (req.user && req.user.role === 'admin') {
        return res.redirect("/admin/dashboard");
    }
    // Check if user is active
    if (req.user && !req.user.isActive) {
        req.logout((err) => {
            if (err) return next(err);
            req.session.destroy(() => {
                res.clearCookie('user_sid');
                return res.redirect("/login?error=suspended");
            });
        });
        return;
    }
    return next();
  }
  res.redirect("/login");
};

// Protect routes that should not be visible to logged in users (e.g., /login, /signup)
exports.isLoggedOut = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    if (req.user && req.user.role === 'admin') {
        return res.redirect("/admin/dashboard");
    }
    return res.redirect("/");
  }
  next();
};

// Set cache control headers
exports.setNoCache = (req, res, next) => {
  res.set("Cache-Control", "no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
};

// Protect admin routes
exports.isAdmin = (req, res, next) => {
  const isAuth = req.isAuthenticated && req.isAuthenticated();
  const hasUser = req.user !== undefined && req.user !== null;
  const isRoleAdmin = hasUser && req.user.role === 'admin';

  if (!isAuth) {
    if (!req.path.includes('.')) console.log(`[AUTH] Refused access to ${req.path}: Not authenticated`);
    return res.redirect("/admin/login");
  }

  if (!hasUser) {
    console.log(`[AUTH] Refused access to ${req.path}: Authenticated but User object is missing`);
    return res.redirect("/admin/login");
  }

  if (!isRoleAdmin) {
    console.log(`[AUTH] Refused access to ${req.path}: User role is ${req.user.role}, not admin`);
    return res.redirect("/admin/login");
  }

  // Check if admin is active
  if (!req.user.isActive) {
      req.logout((err) => {
          if (err) return next(err);
          req.session.destroy(() => {
              res.clearCookie('admin_sid');
              return res.redirect("/admin/login?error=suspended");
          });
      });
      return;
  }

  return next();
};
