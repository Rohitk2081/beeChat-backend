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
  },
  maxHttpBufferSize: 5e6 // 5MB buffer size for individual chunks
});

app.use(cors());

// Store chunks until a complete file is received
const imageChunks = {};
let onlineUsers = 0;

io.on("connection", (socket) => {
  onlineUsers++;
  console.log("User connected:", socket.id);
  io.emit("user status", { online: onlineUsers > 1 });

  // Regular text messages
  socket.on("chat message", (msg) => {
    socket.broadcast.emit("chat message", msg);
  });

  // Legacy image handling (keep for backward compatibility)
  socket.on("chat image", (data) => {
    socket.broadcast.emit("chat image", data);
  });

  // Handle image metadata for chunked transfer
  socket.on('image-metadata', (metadata) => {
    const { fileId, totalChunks, user } = metadata;
    
    // Initialize storage for this file
    imageChunks[fileId] = {
      totalChunks: totalChunks,
      chunks: new Array(totalChunks),
      receivedChunks: 0,
      user: user
    };
    
    console.log(`Starting to receive image ${fileId} from ${user} with ${totalChunks} chunks`);
  });
  
  // Handle image chunks
  socket.on('image-chunk', (data) => {
    const { fileId, chunkIndex, chunk, last } = data;
    
    // Store the chunk
    if (imageChunks[fileId]) {
      imageChunks[fileId].chunks[chunkIndex] = chunk;
      imageChunks[fileId].receivedChunks += 1;
      
      // Log progress for large files
      if (imageChunks[fileId].totalChunks > 10 && chunkIndex % 10 === 0) {
        const progress = Math.floor((imageChunks[fileId].receivedChunks / imageChunks[fileId].totalChunks) * 100);
        console.log(`Image ${fileId} progress: ${progress}%`);
      }
      
      // Check if all chunks received
      if (imageChunks[fileId].receivedChunks === imageChunks[fileId].totalChunks) {
        // Combine all chunks
        const completeImage = imageChunks[fileId].chunks.join('');
        const user = imageChunks[fileId].user;
        
        // Broadcast the complete image to all clients except sender
        socket.broadcast.emit('image-complete', {
          fileId: fileId,
          imageData: completeImage,
          user: user
        });
        
        // Clean up
        delete imageChunks[fileId];
        console.log(`Image ${fileId} from ${user} received completely and broadcast to all clients`);
      }
    }
  });

  socket.on("disconnect", () => {
    onlineUsers--;
    console.log("User disconnected:", socket.id);
    io.emit("user status", { online: onlineUsers > 1 });
    
    // Clean up any incomplete transfers from this user
    for (const fileId in imageChunks) {
      if (imageChunks[fileId].socketId === socket.id) {
        console.log(`Cleaning up incomplete transfer ${fileId} due to user disconnect`);
        delete imageChunks[fileId];
      }
    }
  });
});

// Clean up stale transfers periodically (those older than 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const fileId in imageChunks) {
    if (fileId.startsWith('img_')) {
      const timestamp = parseInt(fileId.split('_')[1]);
      if (now - timestamp > 10 * 60 * 1000) { // 10 minutes
        console.log(`Cleaning up stale transfer ${fileId}`);
        delete imageChunks[fileId];
      }
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

app.get("/", (req, res) => {
  res.send("Chat backend running on localhost.");
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
