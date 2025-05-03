const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());

let onlineUsers = 0;

io.on("connection", (socket) => {
  onlineUsers++;
  console.log("User connected:", socket.id);
  io.emit("user status", { online: onlineUsers > 1 });

  socket.on("chat message", (msg) => {
    socket.broadcast.emit("chat message", msg);
  });
  socket.on("chat image", (data) => {
    socket.broadcast.emit("chat image", data);
  });

  socket.on("disconnect", () => {
    onlineUsers--;
    console.log("User disconnected:", socket.id);
    io.emit("user status", { online: onlineUsers > 1 });
  });
});

app.get("/", (req, res) => {
  res.send("Chat backend running on localhost.");
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
