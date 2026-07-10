import './config/env.js';
import { warmupFirebase } from './config/firebase.js';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bodyParser from 'body-parser';
import { createServer } from 'http';
import compression from "compression";   // ✅ ADD THIS
import { initializeSocket } from './socket/socket.js';
import { initializeScheduledTasks } from './utils/scheduledTasks.js';
// ROUTES IMPORTS
import userRouter from './routes/user.route.js'; 
import authRouter from './routes/auth.route.js';
import guestAuthRouter from './routes/guestauth.route.js';
import listingRouter from './routes/listing.route.js';
import activityRouter from './routes/activity.route.js';
import cookieParser  from 'cookie-parser';
import destinationRouter from './routes/destination.route.js';
import packageRouter from './routes/packages.route.js';
import razorpayRouter from './routes/razorpay.route.js';
import countryRouter from './routes/country.route.js';
import statesRouter from './routes/states.route.js';
import citiesRouter from './routes/cities.route.js';
import placesRouter from './routes/places.route.js';
import iteneraryRouter from './routes/itenerary.route.js';
import cabsRouter from './routes/cabs.route.js';
import propertyRouter from './routes/properties.route.js';
import bookingRouter from './routes/booking.route.js';
import orderRoute from './routes/order.route.js';
import cityRouter from './routes/city.route.js';
import galleryRouter from './routes/gallery.route.js';
import agentRouter from './routes/agent.route.js';
import formRouter from './routes/form.route.js';
import makerRouter from './routes/maker.route.js';
import paymentRouter from './routes/payment.route.js';
import addRouter from './routes/add.route.js';
import leadRouter from './routes/lead.route.js';
import packageMakerRouter from './routes/packagemaker.route.js';
import hotelFormRouter from './routes/hotelform.route.js';
import packageApprovalRouter from './routes/packageApproval.route.js';
import marginRouter from './routes/margin.route.js';
import finalcostingRouter from './routes/finalcosting.route.js';
import updateHotelRouter from './routes/updatehotel.route.js';
import hotelBookingRouter from './routes/hotelbooking.route.js';
import cabUserRouter from './routes/cabuser.route.js';
import cabBookingRouter from './routes/cabbookingdata.route.js';
import packageTrackerRouter from './routes/packagetracker.route.js';
import demandRouter from './routes/demand.route.js';
import cabLoginRouter from './routes/cablogin.route.js';
import globalMasterRouter from './routes/globalmaster.route.js';
import bankAccountDetailRouter from './routes/bankaccountdetail.route.js';
import bankTransactionsRouter from './routes/banktransactions.route.js';
import chatRouter from './routes/chat.route.js';
import activityUserRouter from './routes/activityuser.route.js';
import webmailRouter from './routes/webmail.route.js';
import googleCalendarRouter from './routes/googleCalendar.route.js';
import customerRouter from './routes/customer.route.js';
import paymentPolicyRouter from './routes/paymentpolicy.route.js';
import whatsappWebhookRouter from './routes/whatsapp-webhook.route.js';
import whatsappWebhookDemandRouter from './routes/whatsapp_webhook_demand.route.js';
import privacyPolicyRouter from './routes/privacy-policy.route.js';
import googleRouter from './routes/google.route.js';
import stateExpenseListsRouter from './routes/stateexpenselists.route.js';
import targetManagementRouter from './routes/targetmanagement.route.js';
import inventoryBookingRouter from './routes/inventorybooking.route.js';
import razorpayDemandRouter from './routes/razorpayDemand.route.js';
import seoListingRouter from './routes/seoListing.route.js';
import attendanceRouter from './routes/attendance.route.js';

warmupFirebase();

const port = process.env.PORT || 3000;
const mongoUri = process.env.MONGO;

// Check DB connection string
if (!mongoUri) {
  console.error("❌ MongoDB URI missing in .env");
  process.exit(1);
}

// Connect MongoDB
mongoose
  .connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log("✅ MongoDB connected");
    // Initialize scheduled tasks after MongoDB connection
    initializeScheduledTasks();
  })
  .catch((err) => console.error("❌ MongoDB connection error:", err));

const app = express();
const server = createServer(app);

// Initialize Socket.IO
initializeSocket(server);


// -------------------------------------------------------------
//  ✅ GLOBAL COMPRESSION MIDDLEWARE (BOOSTS SPEED 40–90%)
// -------------------------------------------------------------
app.use(
  compression({
    level: 6,          // good balance of speed + compression
    threshold: 0,      // compress all responses
    filter: (req, res) => {
      if (req.headers["x-no-compression"]) return false;
      return compression.filter(req, res);
    },
  })
);


// -------------------------------------------------------------
//  ENABLE CORS (credentials require explicit origins, not "*")
// -------------------------------------------------------------
const defaultCorsOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "https://testting-website.vercel.app",
];
const corsOrigins = [
  ...defaultCorsOrigins,
  ...(process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["Content-Disposition", "Content-Range", "X-Content-Range"],
  })
);

app.use(bodyParser.json({ limit: "30mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "30mb" }));
app.use(express.json());
app.use(cookieParser());


// -------------------------------------------------------------
//  ROUTES
// -------------------------------------------------------------
app.use("/api/privacy-policy", privacyPolicyRouter);
app.use("/api/google", googleRouter);
app.use("/api/google-calendar", googleCalendarRouter);
app.use("/api/razorpay-demand", razorpayDemandRouter);
app.use("/api/seo-listing", seoListingRouter);

app.use("/api/whatsapp", whatsappWebhookRouter);
app.use("/api/whatsapp-demand", whatsappWebhookDemandRouter);
app.use("/api/user", userRouter);
app.use("/api/auth", authRouter);
app.use("/api/auth/guest", guestAuthRouter);
app.use("/api/listing", listingRouter);
app.use("/api/activity", activityRouter);
app.use("/api/destination", destinationRouter);
app.use("/api/packages", packageRouter);
app.use("/api/razorpay", razorpayRouter);
app.use("/api/country", countryRouter);
app.use("/api/states", statesRouter);
app.use("/api/cities", citiesRouter);
app.use("/api/places", placesRouter);
app.use("/api/itinerary", iteneraryRouter);
app.use("/api/cabs", cabsRouter);
app.use("/api/property", propertyRouter);
app.use("/api/booking", bookingRouter);
app.use("/api/orders", orderRoute);
app.use("/api/city", cityRouter);
app.use("/api/gallery", galleryRouter);
app.use("/api/agents", agentRouter);
app.use("/api/form", formRouter);
app.use("/api/maker", makerRouter);
app.use("/api/add", addRouter);
app.use("/api/leads", leadRouter);
app.use("/api/packagemaker", packageMakerRouter);
app.use("/api/payment", paymentRouter);
app.use("/api/hotelform", hotelFormRouter);
app.use("/api/packageapproval", packageApprovalRouter);
app.use("/api/margin", marginRouter);
app.use("/api/finalcosting", finalcostingRouter);
app.use("/api/updatehotel", updateHotelRouter);
app.use("/api/hotelbooking", hotelBookingRouter);
app.use("/api/cabuser", cabUserRouter);
app.use("/api/cabbooking", cabBookingRouter);
app.use("/api/packagetracker", packageTrackerRouter);
app.use("/api/demand", demandRouter);
app.use("/api/cablogin", cabLoginRouter);
app.use("/api/globalmaster", globalMasterRouter);
app.use("/api/bankaccountdetail", bankAccountDetailRouter);
app.use("/api/banktransactions", bankTransactionsRouter);
app.use("/api/chat", chatRouter);
app.use("/api/activityuser", activityUserRouter);
app.use("/api/webmail", webmailRouter);
app.use("/api/customerdata", customerRouter);
app.use("/api/paymentpolicy", paymentPolicyRouter);
app.use("/api/state-expense-lists", stateExpenseListsRouter);
app.use("/api/targetmanagement", targetManagementRouter);
app.use("/api/inventorybooking", inventoryBookingRouter);
app.use("/api/attendance", attendanceRouter);


// -------------------------------------------------------------
//  GLOBAL ERROR HANDLER
// -------------------------------------------------------------
app.use((err, req, res, next) => {
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

// -------------------------------------------------------------
//  START SERVER
// -------------------------------------------------------------
server.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`💬 Socket.IO ready`);
});
