import { Server } from "socket.io";
import ChatMessage from "../models/chat.model.js";
import Maker from "../models/maker.model.js";

let ioInstance = null;

// Helper function to generate conversation ID
const getConversationId = (userId1, userId2) => {
  return [userId1, userId2].sort().join("_");
};

export const initializeSocket = (server) => {
  const io = new Server(server, {
    transports: ["websocket"],     // ✅ force websocket only
    allowUpgrades: false,          // ✅ disable polling
    cors: {
      origin: [
        "https://packagemakerbackend.demandsetutours.com",
        "https://crm.ptwholidays.in",
        "https://packagemaker.demandsetutours.com",
        "http://localhost:5173",
      ],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("New client connected:", socket.id);

    // User connects
    socket.on("user:connect", async (userId) => {
      try {
        console.log(`User ${userId} connected`);

        const user = await Maker.findById(userId);
        if (!user) {
          socket.emit("error", { message: "User not found" });
          return;
        }

        socket.userId = userId;

        // ✅ Join user-specific room
        socket.join(`user:${userId}`);

        socket.emit("user:connected", {
          userId,
          message: "Successfully connected to chat",
        });

        // Broadcast online status (best-effort in cluster)
        io.emit("user:online", { userId });

      } catch (error) {
        console.error("User connect error:", error);
        socket.emit("error", { message: "Connection failed" });
      }
    });

    // Send message
    socket.on("message:send", async (data) => {
      try {
        const { senderId, receiverId, message, messageType = "text" } = data;

        if (!senderId || !receiverId || !message) {
          socket.emit("error", { message: "Invalid message data" });
          return;
        }

        const [sender, receiver] = await Promise.all([
          Maker.findById(senderId),
          Maker.findById(receiverId),
        ]);

        if (!sender || !receiver) {
          socket.emit("error", { message: "User not found" });
          return;
        }

        const conversationId = getConversationId(senderId, receiverId);

        const newMessage = await ChatMessage.create({
          senderId,
          receiverId,
          message,
          messageType,
          conversationId,
        });

        const populatedMessage = await ChatMessage.findById(newMessage._id)
          .populate("senderId", "firstName lastName email")
          .populate("receiverId", "firstName lastName email");

        // ✅ Emit to receiver room (cluster-safe)
        io.to(`user:${receiverId}`).emit(
          "message:received",
          populatedMessage
        );

        // Confirm to sender
        socket.emit("message:sent", populatedMessage);

      } catch (error) {
        console.error("Send message error:", error);
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    // Typing indicator
    socket.on("typing:start", ({ senderId, receiverId }) => {
      io.to(`user:${receiverId}`).emit("typing:started", {
        userId: senderId,
      });
    });

    socket.on("typing:stop", ({ senderId, receiverId }) => {
      io.to(`user:${receiverId}`).emit("typing:stopped", {
        userId: senderId,
      });
    });

    // Mark messages as read
    socket.on("messages:read", async ({ conversationId, userId }) => {
      try {
        await ChatMessage.updateMany(
          {
            conversationId,
            receiverId: userId,
            isRead: false,
          },
          {
            isRead: true,
            readAt: new Date(),
          }
        );

        const [userId1, userId2] = conversationId.split("_");
        const otherUserId = userId1 === userId ? userId2 : userId1;

        // ✅ Notify other user via room
        io.to(`user:${otherUserId}`).emit("messages:read", {
          conversationId,
          readBy: userId,
        });

        socket.emit("messages:marked-read", { conversationId });

      } catch (error) {
        console.error("Mark as read error:", error);
        socket.emit("error", { message: "Failed to mark messages as read" });
      }
    });

    // Disconnect
    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);

      if (socket.userId) {
        socket.leave(`user:${socket.userId}`);
        io.emit("user:offline", { userId: socket.userId });
      }
    });

    // Manual disconnect
    socket.on("user:disconnect", (userId) => {
      socket.leave(`user:${userId}`);
      io.emit("user:offline", { userId });
    });
  });

  ioInstance = io;
  console.log("Socket.IO initialized");
  return io;
};

export const getIO = () => ioInstance;
