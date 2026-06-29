require("dotenv").config();

const app = require("./src/app");
const connectDB = require("./src/config/database");
const createAdmin = require("./src/utils/createAdmin");

const startServer = async () => {
  try {

    await connectDB();
    await createAdmin();
    
    const PORT = process.env.PORT || 3000;
    const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
    console.log("ENV TEST:", process.env.MONGO_URI ? "LOADED" : "UNDEFINED");
    app.listen(PORT, () => {
      console.log(`Server running on ${BASE_URL}`);
    });

  } catch (error) {
    console.error("Server startup failed:", error);
  }
};

startServer();