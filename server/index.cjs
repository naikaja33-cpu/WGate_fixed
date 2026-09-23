const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

const db = require("./db/database.cjs");
const createVisitorRouter = require("./routes/visitors.cjs");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

app.use(cors());
app.use(express.json());
app.use("/api/visitors", createVisitorRouter(db));

/*
 * Initialize database
 */
const schemaPath = path.join(__dirname, "db", "schema.sql");
const schema = fs.readFileSync(schemaPath, "utf8");

db.exec(schema);

/*
 * Health check
 */
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "WGate local backend is running",
    database: "SQLite",
    time: new Date().toISOString()
  });
});

/*
 * Basic API test
 */
app.get("/api/test", (req, res) => {
  res.json({
    success: true,
    message: "WGate API working"
  });
});

/*
 * Socket.IO
 */
io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("join_room", (room) => {
    socket.join(room);
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`WGate backend running at http://localhost:${PORT}`);
});