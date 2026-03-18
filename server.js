require("dotenv").config();

const app = require("./src/app");
const connectDB = require("./src/config/database");
const createAdmin = require("./src/utils/createAdmin");

const startServer = async () => {
  try {

    await connectDB();
    await createAdmin();
    
    const PORT = process.env.PORT || 3000;
    console.log("ENV TEST:", process.env.MONGO_URI ? "LOADED" : "UNDEFINED");
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });

  } catch (error) {
    console.error("Server startup failed:", error);
  }
};

startServer();