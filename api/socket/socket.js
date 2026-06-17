import { Server } from "socket.io";
import mongoose from "mongoose";
import ChatMessage from "../models/chat.model.js";
import Maker from "../models/maker.model.js";
import Lead from "../models/lead.model.js";
import WhatsappMessage from "../models/whatsappMessage.model.js";
import WhatsappMessageDemand from "../models/whatsappMessageDemand.model.js";

let ioInstance = null;

const isValidObjectId = (id) => {
  if (!id || typeof id !== "string") return false;
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;
};

const normalizePhone = (phone) => {
  if (!phone) return "";
  return String(phone).replace(/\D/g, "").slice(-10);
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

    // Executive real-time notifications (incoming customer messages).
    // Frontend should call `whatsapp:exec-notifications:subscribe` after `user:connect`.
    socket.on("whatsapp:exec-notifications:subscribe", () => {
      if (!socket.userId) {
        socket.emit("error", { message: "Connect using user:connect first" });
        return;
      }
      const room = `whatsapp:exec-notifications:${socket.userId}`;
      socket.join(room);
      socket.emit("whatsapp:exec-notifications:subscribed", { room });
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

    // Real-time list: first message per phone where assignedTo is null (GET /messages/unassigned/first)
    socket.on("whatsapp:subscribe:unassigned:first", async () => {
      try {
        socket.join("whatsapp:unassigned:first");
        const messages = await WhatsappMessage.find({ assignedTo: null })
          .sort({ createdAt: 1 })
          .populate("assignedTo", "name email")
          .lean();
        const seenPhones = new Set();
        const result = [];
        for (const msg of messages) {
          const normPhone = normalizePhone(msg.phone);
          if (!normPhone || seenPhones.has(normPhone)) continue;
          seenPhones.add(normPhone);
          result.push(msg);
        }
        result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        socket.emit("whatsapp:list:unassigned:first", result);
      } catch (err) {
        console.error("whatsapp:subscribe:unassigned:first error:", err);
        socket.emit("error", { message: "Failed to load first unassigned per phone" });
      }
    });

    // Real-time list: filtered unassigned (GET /message/unassigned) — exclude lead phones, first message per phone only
    socket.on("whatsapp:subscribe:unassigned:filtered", async () => {
      try {
        socket.join("whatsapp:unassigned:filtered");
        const leads = await Lead.find({ mobile: { $exists: true, $ne: null } })
          .select("mobile")
          .lean();
        const leadPhoneSet = new Set(
          leads.map((l) => normalizePhone(l.mobile)).filter(Boolean)
        );
        const messages = await WhatsappMessage.find({
          assignedTo: null,
          direction: "incoming",
        })
          .sort({ createdAt: 1 })
          .populate("assignedTo", "name email")
          .lean();
        const seenPhones = new Set();
        const result = [];
        for (const msg of messages) {
          const normPhone = normalizePhone(msg.phone);
          if (!normPhone || leadPhoneSet.has(normPhone) || seenPhones.has(normPhone)) continue;
          seenPhones.add(normPhone);
          result.push(msg);
        }
        result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        socket.emit("whatsapp:list:unassigned:filtered", result);
      } catch (err) {
        console.error("whatsapp:subscribe:unassigned:filtered error:", err);
        socket.emit("error", { message: "Failed to load filtered unassigned messages" });
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

    // WhatsApp Demand line — separate collection + rooms (see whatsapp_webhook_demand.route.js)
    socket.on("whatsapp-demand:subscribe", () => {
      socket.join("whatsapp:demand");
      socket.emit("whatsapp-demand:subscribed", { room: "whatsapp:demand" });
    });
    socket.on("whatsapp-demand:unsubscribe", () => {
      socket.leave("whatsapp:demand");
    });

    socket.on("whatsapp-demand:subscribe:all", async () => {
      try {
        socket.join("whatsapp:demand:all");
        const messages = await WhatsappMessageDemand.find()
          .sort({ createdAt: -1 })
          .populate("assignedTo", "name email")
          .lean();
        socket.emit("whatsapp-demand:list:all", messages);
      } catch (err) {
        console.error("whatsapp-demand:subscribe:all error:", err);
        socket.emit("error", { message: "Failed to load demand messages" });
      }
    });

    socket.on("whatsapp-demand:subscribe:by-phone", async (payload) => {
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
        const messages = await WhatsappMessageDemand.find(query)
          .sort({ createdAt: 1 })
          .populate("assignedTo", "name email")
          .lean();
        socket.join(`whatsapp:demand:by-phone:${normalized}`);
        if (normalized !== raw) socket.join(`whatsapp:demand:by-phone:${raw}`);
        socket.emit("whatsapp-demand:list:by-phone", messages);
      } catch (err) {
        console.error("whatsapp-demand:subscribe:by-phone error:", err);
        socket.emit("error", { message: "Failed to load demand messages" });
      }
    });

    socket.on("whatsapp-demand:subscribe:unassigned", async () => {
      try {
        socket.join("whatsapp:demand:unassigned");
        const messages = await WhatsappMessageDemand.find({ assignedTo: null })
          .sort({ createdAt: -1 })
          .populate("assignedTo", "name email")
          .lean();
        socket.emit("whatsapp-demand:list:unassigned", messages);
      } catch (err) {
        console.error("whatsapp-demand:subscribe:unassigned error:", err);
        socket.emit("error", { message: "Failed to load unassigned demand messages" });
      }
    });

    socket.on("whatsapp-demand:subscribe:unassigned:first", async () => {
      try {
        socket.join("whatsapp:demand:unassigned:first");
        const messages = await WhatsappMessageDemand.find({ assignedTo: null })
          .sort({ createdAt: 1 })
          .populate("assignedTo", "name email")
          .lean();
        const seenPhones = new Set();
        const result = [];
        for (const msg of messages) {
          const normPhone = normalizePhone(msg.phone);
          if (!normPhone || seenPhones.has(normPhone)) continue;
          seenPhones.add(normPhone);
          result.push(msg);
        }
        result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        socket.emit("whatsapp-demand:list:unassigned:first", result);
      } catch (err) {
        console.error("whatsapp-demand:subscribe:unassigned:first error:", err);
        socket.emit("error", { message: "Failed to load first unassigned per phone (demand)" });
      }
    });

    socket.on("whatsapp-demand:subscribe:unassigned:filtered", async () => {
      try {
        socket.join("whatsapp:demand:unassigned:filtered");
        const leads = await Lead.find({ mobile: { $exists: true, $ne: null } })
          .select("mobile")
          .lean();
        const leadPhoneSet = new Set(
          leads.map((l) => normalizePhone(l.mobile)).filter(Boolean)
        );
        const messages = await WhatsappMessageDemand.find({
          assignedTo: null,
          direction: "incoming",
        })
          .sort({ createdAt: 1 })
          .populate("assignedTo", "name email")
          .lean();
        const seenPhones = new Set();
        const result = [];
        for (const msg of messages) {
          const normPhone = normalizePhone(msg.phone);
          if (!normPhone || leadPhoneSet.has(normPhone) || seenPhones.has(normPhone)) continue;
          seenPhones.add(normPhone);
          result.push(msg);
        }
        result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        socket.emit("whatsapp-demand:list:unassigned:filtered", result);
      } catch (err) {
        console.error("whatsapp-demand:subscribe:unassigned:filtered error:", err);
        socket.emit("error", { message: "Failed to load filtered unassigned demand messages" });
      }
    });

    socket.on("whatsapp-demand:subscribe:by-assigned", async (payload) => {
      try {
        const executiveId = payload?.executiveId;
        if (!executiveId || !isValidObjectId(executiveId)) {
          socket.emit("error", { message: "Valid executiveId required" });
          return;
        }
        socket.join(`whatsapp:demand:by-assigned:${executiveId}`);
        const messages = await WhatsappMessageDemand.find({ assignedTo: executiveId })
          .sort({ createdAt: -1 })
          .populate("assignedTo", "name email")
          .lean();
        socket.emit("whatsapp-demand:list:by-assigned", messages);
      } catch (err) {
        console.error("whatsapp-demand:subscribe:by-assigned error:", err);
        socket.emit("error", { message: "Failed to load demand messages" });
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
