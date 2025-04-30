const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // allow all origins for testing
    methods: ["GET", "POST"]
  }
});

app.use(cors());

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("new-user-joined", (username) => {
    console.log(username + " has joined");
    // Optionally broadcast a "new user joined" event
    socket.broadcast.emit("user-joined", username);
  });

  socket.on("send", (msg) => {
    // Broadcast to everyone except sender
    socket.broadcast.emit("receive", msg); // Ensure event names match
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
