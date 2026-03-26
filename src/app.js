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
  if (req.path.startsWith('/admin')) {
    adminSession(req, res, next);
  } else {
    userSession(req, res, next);
  }
});

// ---------- PASSPORT ----------
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// ---------- GLOBAL LOCALS ----------

// Apply Cache-Control headers globally so browsers don't cache protected pages on back-button
app.use(setNoCache);

// Pass user object to all templates universally
app.use((req, res, next) => {
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