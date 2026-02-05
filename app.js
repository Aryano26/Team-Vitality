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
const authorizationRouter = require("./routes/authorization");
const settlementRouter = require("./routes/settlement");
const paymentRouter = require("./routes/payment");
const receiptRouter = require("./routes/receipt");

require("./config/passport");

app.use(cors());
app.use(passport.initialize());

app.use("/api/v1/webhooks", require("./routes/webhook"));
app.use(express.json());

// Serve uploaded receipt images
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/v1", mainRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/events", eventRouter);
app.use("/api/v1/events/:id/wallet", walletRouter);
app.use("/api/v1/events/:id/categories", categoryRouter);
app.use("/api/v1/events/:id/expenses", expenseRouter);
app.use("/api/v1/events/:id/receipts", receiptRouter);
app.use("/api/v1/events/:id/authorization-rules", authorizationRouter);
app.use("/api/v1/events/:id/settlement", settlementRouter);
app.use("/api/v1/events/:id/payments", paymentRouter);

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

