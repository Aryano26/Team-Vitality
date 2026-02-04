require("dotenv").config();
require("express-async-errors");

const connectDB = require("./db/connect");
const express = require("express");
const cors = require("cors");
const passport = require("passport");
const app = express();
const mainRouter = require("./routes/user");
const authRouter = require("./routes/auth");

require("./config/passport");

app.use(express.json());
app.use(cors());
app.use(passport.initialize());

app.use("/api/v1", mainRouter);
app.use("/api/v1/auth", authRouter);

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

