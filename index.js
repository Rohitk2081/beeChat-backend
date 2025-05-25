// server.js - Backend for BeeChat application with MongoDB Atlas integration
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);

// Enable CORS
app.use(cors());

// Initialize Socket.IO with CORS settings
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins in development
    methods: ["GET", "POST"],
    credentials: true
  }
});

// MongoDB Connection
// Replace this URI with your MongoDB Atlas connection string (should be in .env file)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://rohitkumar00n:NjeOs4EnBfzjAA1B@cluster0.hh4wozl.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0';

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB Atlas');
    // Create index for better performance
    await createIndexes();
  })
  .catch(err => console.error('MongoDB connection error:', err));

// Define Message Schema
const messageSchema = new mongoose.Schema({
  user: { type: String, required: true },
  msg: { type: String, required: false },
  img: { type: String, required: false }, // Store base64 encoded images
  timestamp: { type: Date, default: Date.now }
});

// Add index to the schema for better performance
messageSchema.index({ timestamp: -1 });

// Create Message model
const Message = mongoose.model('Message', messageSchema);

// Function to create necessary indexes
async function createIndexes() {
  try {
    await Message.createIndexes();
    console.log('Database indexes created successfully');
  } catch (error) {
    console.error('Error creating indexes:', error);
  }
}

// Keep track of connected users and their status
let connectedUsers = 0;

// Object to store incomplete image transfers
const imageTransfers = {};

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('A user connected');
  connectedUsers++;
  
  // Broadcast to everyone that a user is online
  io.emit('user status', { online: connectedUsers > 1 });
  
  // Load and send chat history when user connects
  sendChatHistory(socket);
  
  // Handle chat messages
  socket.on('chat message', async (data) => {
    try {
      // Save message to database
      const newMessage = new Message({
        user: data.user,
        msg: data.msg
      });
      
      await newMessage.save();
      console.log('Message saved to database');
      
      // Broadcast message to all clients except sender
      socket.broadcast.emit('chat message', data);
    } catch (error) {
      console.error('Error saving message:', error);
    }
  });
  
  // Handle image transfers
  
  // First: receive image metadata
  socket.on('image-metadata', (metadata) => {
    const { fileId, totalChunks, user } = metadata;
    
    // Initialize a new image transfer
    imageTransfers[fileId] = {
      chunks: new Array(totalChunks),
      receivedChunks: 0,
      totalChunks: totalChunks,
      user: user
    };
    
    console.log(`Starting image transfer: ${fileId}, chunks: ${totalChunks}`);
  });
  
  // Next: receive image chunks
  socket.on('image-chunk', async (data) => {
    const { fileId, chunkIndex, chunk, last } = data;
    const transfer = imageTransfers[fileId];
    
    // If we don't have this transfer in progress, ignore the chunk
    if (!transfer) {
      console.error(`Received chunk for unknown transfer: ${fileId}`);
      return;
    }
    
    // Store this chunk
    transfer.chunks[chunkIndex] = chunk;
    transfer.receivedChunks++;
    
    console.log(`Received chunk ${chunkIndex + 1}/${transfer.totalChunks} for ${fileId}`);
    
    // If this is the last chunk or we've received all chunks, process the image
    if (last || transfer.receivedChunks === transfer.totalChunks) {
      // Combine all chunks to form the complete image
      const completeImage = transfer.chunks.join('');
      
      try {
        // Save the image to database
        const newImageMessage = new Message({
          user: transfer.user,
          img: completeImage
        });
        
        await newImageMessage.save();
        console.log('Image saved to database');
        
        // Broadcast image to all clients except sender
        socket.broadcast.emit('image-complete', {
          user: transfer.user,
          imageData: completeImage
        });
        
        // Clean up the transfer data
        delete imageTransfers[fileId];
      } catch (error) {
        console.error('Error saving image:', error);
      }
    }
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected');
    connectedUsers--;
    
    // Broadcast user status update
    io.emit('user status', { online: connectedUsers > 1 });
  });
});

// Function to send chat history to newly connected users
async function sendChatHistory(socket) {
  try {
    // Get the last 50 messages from the database with optimized query
    const messages = await Message.find()
      .sort({ timestamp: -1 })
      .limit(50)
      .allowDiskUse(true) // Allow disk usage for large sorts
      .lean()
      .exec();
    
    // Send messages in chronological order
    const chronologicalMessages = messages.reverse();
    
    // Send each message to the newly connected client
    chronologicalMessages.forEach(message => {
      if (message.msg) {
        // Send text message
        socket.emit('chat message', {
          user: message.user,
          msg: message.msg
        });
      } else if (message.img) {
        // Send image message
        socket.emit('image-complete', {
          user: message.user,
          imageData: message.img
        });
      }
    });
    
    console.log(`Sent ${chronologicalMessages.length} messages from history`);
  } catch (error) {
    console.error('Error fetching chat history:', error);
    
    // Fallback: try to get recent messages without sorting if the above fails
    try {
      console.log('Attempting fallback query...');
      const fallbackMessages = await Message.find()
        .limit(20) // Reduce limit for fallback
        .lean()
        .exec();
      
      // Send fallback messages
      fallbackMessages.forEach(message => {
        if (message.msg) {
          socket.emit('chat message', {
            user: message.user,
            msg: message.msg
          });
        } else if (message.img) {
          socket.emit('image-complete', {
            user: message.user,
            imageData: message.img
          });
        }
      });
      
      console.log(`Sent ${fallbackMessages.length} messages from fallback query`);
    } catch (fallbackError) {
      console.error('Fallback query also failed:', fallbackError);
    }
  }
}

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
