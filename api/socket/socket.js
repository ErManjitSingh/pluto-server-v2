import { Server } from 'socket.io';
import ChatMessage from '../models/chat.model.js';
import Maker from '../models/maker.model.js';

// Store active users and their socket IDs
const activeUsers = new Map();

// Helper function to generate conversation ID
const getConversationId = (userId1, userId2) => {
  return [userId1, userId2].sort().join('_');
};

export const initializeSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: [
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:5174',
        'https://pluto-hotel-server-15c83810c41c.herokuapp.com',
        'https://packagemaker.plutotours.com',
        // Add your production frontend URL here
        // 'https://your-frontend-domain.com'
      ],
      methods: ["GET", "POST"],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization']
    }
  });

  io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // User joins/connects
    socket.on('user:connect', async (userId) => {
      try {
        console.log(`User ${userId} connected with socket ${socket.id}`);
        
        // Verify user exists
        const user = await Maker.findById(userId);
        if (!user) {
          socket.emit('error', { message: 'User not found' });
          return;
        }

        // Store user's socket ID
        activeUsers.set(userId, socket.id);
        socket.userId = userId;

        // Notify user of successful connection
        socket.emit('user:connected', { 
          userId, 
          message: 'Successfully connected to chat' 
        });

        // Broadcast user online status to all clients
        io.emit('user:online', { userId });

        // Send list of online users
        const onlineUsers = Array.from(activeUsers.keys());
        socket.emit('users:online', { users: onlineUsers });
      } catch (error) {
        console.error('User connect error:', error);
        socket.emit('error', { message: 'Connection failed' });
      }
    });

    // Send message
    socket.on('message:send', async (data) => {
      try {
        const { senderId, receiverId, message, messageType = 'text' } = data;

        if (!senderId || !receiverId || !message) {
          socket.emit('error', { message: 'Invalid message data' });
          return;
        }

        // Verify both users exist
        const [sender, receiver] = await Promise.all([
          Maker.findById(senderId),
          Maker.findById(receiverId)
        ]);

        if (!sender || !receiver) {
          socket.emit('error', { message: 'User not found' });
          return;
        }

        const conversationId = getConversationId(senderId, receiverId);

        // Save message to database
        const newMessage = await ChatMessage.create({
          senderId,
          receiverId,
          message,
          messageType,
          conversationId
        });

        const populatedMessage = await ChatMessage.findById(newMessage._id)
          .populate('senderId', 'firstName lastName email')
          .populate('receiverId', 'firstName lastName email');

        // Send to receiver if online
        const receiverSocketId = activeUsers.get(receiverId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit('message:received', populatedMessage);
        }

        // Confirm to sender
        socket.emit('message:sent', populatedMessage);

      } catch (error) {
        console.error('Send message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Typing indicator
    socket.on('typing:start', (data) => {
      const { senderId, receiverId } = data;
      const receiverSocketId = activeUsers.get(receiverId);
      
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('typing:started', { userId: senderId });
      }
    });

    socket.on('typing:stop', (data) => {
      const { senderId, receiverId } = data;
      const receiverSocketId = activeUsers.get(receiverId);
      
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('typing:stopped', { userId: senderId });
      }
    });

    // Mark messages as read
    socket.on('messages:read', async (data) => {
      try {
        const { conversationId, userId } = data;

        await ChatMessage.updateMany(
          { 
            conversationId, 
            receiverId: userId,
            isRead: false 
          },
          { 
            isRead: true,
            readAt: new Date()
          }
        );

        // Get the other user in conversation
        const [userId1, userId2] = conversationId.split('_');
        const otherUserId = userId1 === userId ? userId2 : userId1;
        
        const otherUserSocketId = activeUsers.get(otherUserId);
        if (otherUserSocketId) {
          io.to(otherUserSocketId).emit('messages:read', { 
            conversationId, 
            readBy: userId 
          });
        }

        socket.emit('messages:marked-read', { conversationId });
      } catch (error) {
        console.error('Mark as read error:', error);
        socket.emit('error', { message: 'Failed to mark messages as read' });
      }
    });

    // User disconnects
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      
      if (socket.userId) {
        activeUsers.delete(socket.userId);
        
        // Broadcast user offline status
        io.emit('user:offline', { userId: socket.userId });
      }
    });

    // Manual disconnect
    socket.on('user:disconnect', (userId) => {
      activeUsers.delete(userId);
      io.emit('user:offline', { userId });
    });
  });

  console.log('Socket.IO initialized');
  return io;
};
