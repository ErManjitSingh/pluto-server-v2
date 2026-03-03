import { Server } from "socket.io";
import mongoose from "mongoose";
import ChatMessage from "../models/chat.model.js";
import Maker from "../models/maker.model.js";
import Lead from "../models/lead.model.js";
import WhatsappMessage from "../models/whatsappMessage.model.js";

let ioInstance = null;

const isValidObjectId = (id) => {
  if (!id || typeof id !== "string") return false;
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;
};

// Helper function to generate conversation ID
const getConversationId = (userId1, userId2) => {
  return [userId1, userId2].sort().join("_");
};

const getUserModel = (userType) => {
  return userType === "Lead" ? Lead : Maker;
};

const userSelect = "firstName lastName email name mobile leadId";

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
    socket.on("user:connect", async (payload) => {
      try {
        const { userId, userType = "Maker" } =
          typeof payload === "object" && payload !== null
            ? payload
            : { userId: payload, userType: "Maker" };

        console.log(`User ${userId} connected`);

        const UserModel = getUserModel(userType);
        const user = await UserModel.findById(userId);
        if (!user) {
          socket.emit("error", { message: "User not found" });
          return;
        }

        socket.userId = userId;
        socket.userType = userType;

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
        const {
          senderId,
          receiverId,
          message,
          messageType = "text",
          senderModel = "Maker",
          receiverModel = "Maker",
           managerid,
          managername,
          teamleaderid,
          teamleadername,
        } = data;

        if (!senderId || !receiverId || !message) {
          socket.emit("error", { message: "Invalid message data" });
          return;
        }

        const SenderModel = getUserModel(senderModel);
        const ReceiverModel = getUserModel(receiverModel);

        const [sender, receiver] = await Promise.all([
          SenderModel.findById(senderId),
          ReceiverModel.findById(receiverId),
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
          senderModel,
          receiverModel,
           managerid,
          managername,
          teamleaderid,
          teamleadername,
        });

        const populatedMessage = await ChatMessage.findById(newMessage._id)
          .populate("senderId", userSelect)
          .populate("receiverId", userSelect);

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

    // WhatsApp CRM: join room to receive real-time new messages (incoming + outgoing)
    socket.on("whatsapp:subscribe", () => {
      socket.join("whatsapp");
      socket.emit("whatsapp:subscribed", { room: "whatsapp" });
    });

    socket.on("whatsapp:unsubscribe", () => {
      socket.leave("whatsapp");
    });

    // Real-time list: all messages — initial snapshot + live updates via whatsapp:message:new
    socket.on("whatsapp:subscribe:all", async () => {
      try {
        socket.join("whatsapp:all");
        const messages = await WhatsappMessage.find()
          .sort({ createdAt: -1 })
          .populate("assignedTo", "name email")
          .lean();
        socket.emit("whatsapp:list:all", messages);
      } catch (err) {
        console.error("whatsapp:subscribe:all error:", err);
        socket.emit("error", { message: "Failed to load messages" });
      }
    });

    // Real-time list: messages by phone — initial snapshot + live updates for this phone
    socket.on("whatsapp:subscribe:by-phone", async (payload) => {
      try {
        const phone = payload?.phone;
        if (!phone) {
          socket.emit("error", { message: "phone required" });
          return;
        }
        const raw = String(phone).replace(/\D/g, "");
        if (!raw) {
          socket.emit("error", { message: "Invalid phone" });
          return;
        }
        const normalized = raw.length <= 10 && !raw.startsWith("91") ? "91" + raw : raw;
        const query =
          raw.length <= 10 && !raw.startsWith("91")
            ? { $or: [{ phone: raw }, { phone: "91" + raw }] }
            : { phone: raw };
        const messages = await WhatsappMessage.find(query)
          .sort({ createdAt: 1 })
          .populate("assignedTo", "name email")
          .lean();
        socket.join(`whatsapp:by-phone:${normalized}`);
        if (normalized !== raw) socket.join(`whatsapp:by-phone:${raw}`);
        socket.emit("whatsapp:list:by-phone", messages);
      } catch (err) {
        console.error("whatsapp:subscribe:by-phone error:", err);
        socket.emit("error", { message: "Failed to load messages" });
      }
    });

    // Real-time list: unassigned messages — initial snapshot + live updates when new unassigned
    socket.on("whatsapp:subscribe:unassigned", async () => {
      try {
        socket.join("whatsapp:unassigned");
        const messages = await WhatsappMessage.find({ assignedTo: null })
          .sort({ createdAt: -1 })
          .populate("assignedTo", "name email")
          .lean();
        socket.emit("whatsapp:list:unassigned", messages);
      } catch (err) {
        console.error("whatsapp:subscribe:unassigned error:", err);
        socket.emit("error", { message: "Failed to load unassigned messages" });
      }
    });

    // Real-time list: messages by assigned executive — initial snapshot + live updates
    socket.on("whatsapp:subscribe:by-assigned", async (payload) => {
      try {
        const executiveId = payload?.executiveId;
        if (!executiveId || !isValidObjectId(executiveId)) {
          socket.emit("error", { message: "Valid executiveId required" });
          return;
        }
        socket.join(`whatsapp:by-assigned:${executiveId}`);
        const messages = await WhatsappMessage.find({ assignedTo: executiveId })
          .sort({ createdAt: -1 })
          .populate("assignedTo", "name email")
          .lean();
        socket.emit("whatsapp:list:by-assigned", messages);
      } catch (err) {
        console.error("whatsapp:subscribe:by-assigned error:", err);
        socket.emit("error", { message: "Failed to load messages" });
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
