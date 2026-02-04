const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
require("express-async-errors");

const connectDB = require("./db/connect");
const express = require("express");
const cors = require("cors");
const passport = require("passport");
const app = express();
const mainRouter = require("./routes/user");
const authRouter = require("./routes/auth");
const eventRouter = require("./routes/event");
const walletRouter = require("./routes/wallet");
const categoryRouter = require("./routes/category");
const expenseRouter = require("./routes/expense");

require("./config/passport");

app.use(cors());
app.use(passport.initialize());

app.use("/api/v1/webhooks", require("./routes/webhook"));
app.use(express.json());

app.use("/api/v1", mainRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/events", eventRouter);
app.use("/api/v1/events/:id/wallet", walletRouter);
app.use("/api/v1/events/:id/categories", categoryRouter);
app.use("/api/v1/events", expenseRouter);
app.use("/api/v1/events/:eventId/settlement", require("./routes/settlement"));

const port = process.env.PORT || 3000;

const start = async () => {

    try {        
        await connectDB(process.env.MONGO_URI);
        app.listen(port, () => {
            console.log(`Server is listening on port ${port}`);
        })

    } catch (error) {
       console.log(error); 
    }
}

start();

