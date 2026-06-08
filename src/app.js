const express = require("express");
const path = require("path");
const morgan = require("morgan");
const passport = require("passport");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const errorHandler = require("./middleware/errorHandler");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const adminRoutes = require("./routes/adminRoutes");
const User = require("./models/userModel");
const { setNoCache } = require("./middleware/authMiddleware");

require("./config/passport");

const app = express();

// ---------- VIEW ENGINE ----------
app.set("views", path.join(__dirname, "../views"));
app.set("view engine", "ejs");


// ---------- MIDDLEWARE ----------
app.use(morgan("dev"));
app.use(express.static(path.join(__dirname, "../public")));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));


// ---------- SESSION ----------
const adminSession = session({
  name: 'admin_sid',
  secret: process.env.SESSION_SECRET || 'fallback_secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.default.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: 'admin_sessions'
  }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 // 1 day
  }
});

const userSession = session({
  name: 'user_sid',
  secret: process.env.SESSION_SECRET || 'fallback_secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.default.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: 'sessions'
  }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 // 1 day
  }
});

app.use((req, res, next) => {
  // Static paths shouldn't log session info to avoid noise
  const isStatic = req.path.includes('.') || req.path.startsWith('/images') || req.path.startsWith('/css') || req.path.startsWith('/js');
  
  if (!isStatic) {
    console.log(`[SESSION] Path: ${req.path}, Cookies: ${JSON.stringify(req.headers.cookie || 'NONE')}`);
  }

  if (req.path.startsWith('/admin') || req.path.startsWith('/api/admin')) {
    if (!isStatic) console.log(`[SESSION] ADMIN session used`);
    adminSession(req, res, next);
  } else {
    if (!isStatic) console.log(`[SESSION] USER session used`);
    userSession(req, res, next);
  }
});

// ---------- PASSPORT ----------
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Immediate Account Suspension Check Middleware
app.use((req, res, next) => {
  if (req.isAuthenticated() && req.user && req.user.role === 'user' && !req.user.isActive) {
    console.log(`[AUTH] Immediate Logout: User ${req.user.email} is suspended.`);
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy(() => {
        res.clearCookie('user_sid');
        return res.redirect("/login?error=suspended");
      });
    });
  } else {
    next();
  }
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    if (!user && !id.includes('.')) console.log(`[AUTH] Deserialize failed for ID: ${id}`);
    done(null, user);
  } catch (err) {
    console.error(`[AUTH] Deserialize ERROR for ID: ${id}:`, err);
    done(err, null);
  }
});

// ---------- ROLE SECURITY LAYER ----------
// Ensure that an admin user in one session doesn't "leak" into the other context
app.use((req, res, next) => {
  if (req.user) {
    const isAdminPath = req.path.startsWith('/admin') || req.path.startsWith('/api/admin');
    
    // If admin is in a USER session context, hide them
    if (req.user.role === 'admin' && !isAdminPath) {
        if (!req.path.includes('.')) console.log(`[AUTH] Hiding Admin user on non-admin path: ${req.path}`);
        req.user = undefined;
    }
    // If a regular user is in an ADMIN session context, hide them
    else if (req.user.role !== 'admin' && isAdminPath) {
        if (!req.path.includes('.')) console.log(`[AUTH] Hiding regular user on admin path: ${req.path}`);
        req.user = undefined;
    }
  }
  next();
});

// ---------- GLOBAL LOCALS ----------

// Apply Cache-Control headers globally so browsers don't cache protected pages on back-button
app.use(setNoCache);

const { HTTP_STATUS, MESSAGES } = require("./utils/constants");

// Pass constants and user object to all templates universally
app.use((req, res, next) => {
  res.locals.HTTP_STATUS = HTTP_STATUS;
  res.locals.MESSAGES = MESSAGES;
  res.locals.user = req.user || null;
  next();
});


// ---------- ROUTES ----------
app.use("/", authRoutes);
app.use("/", userRoutes);
app.use("/", adminRoutes);


// ---------- 404 ----------
app.use((req, res) => {
  res.status(404).render("user/error", {
    title: "404 Not Found",
    message: "The page you are looking for does not exist."
  });
});


// ---------- ERROR HANDLER ----------
app.use(errorHandler);


module.exports = app;