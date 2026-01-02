import mongoose from "mongoose";
import bcryptjs from 'bcryptjs';
const Schema = mongoose.Schema;

const selectedAmenitiesSchema = new mongoose.Schema({
  Mandatory: {
      type: Map,
      of: String,
  },
  'Popular with Guest': {
      type: Map,
      of: String,
  },
  Bathroom: {
      type: Map,
      of: String,
  },
  'Room Feature': {
      type: Map,
      of: String,
  },
  'Media and Entertainment': {
      type: Map,
      of: String,
  },
  'Food and Drink': {
      type: Map,
      of: String,
  },
  'Kitchen and Appliance': {
      type: Map,
      of: String,
  },
  'Bed and Blanket': {
      type: Map,
      of: String,
  },
  'Safety and Security': {
      type: Map,
      of: String,
  },
  Childcare: {
      type: Map,
      of: String,
  },
  'other Facilities': {
      type: Map,
      of: String,
  }
});

const roomSchema = new mongoose.Schema({
  roomName: { type: String, required: true },
  roomDescription: { type: String, default: '' },
  roomCount: { type: String, required: true },
  mealOption: { type: String, default: '' },
  roomType: { type: String, default: '' },
  bedType: { type: String, default: '' },
  roomSize: { type: String, default: '' },
  roomView: { type: String, default: '' },
  imageUrl: { type: String, default: ''},
  smokingAllowed: { type: String, default: '' },
  extraBed: { type: Boolean, default: false },
  baseAdults: { type: Number, required: true },
  maxAdults: { type: Number, required: true },
  maxChildren: { type: Number, required: true },
  maxOccupancy: { type: Number, required: true },
  startDate: { type: String, default: null },
  endDate: { type: String, default: null },
  baseRate: { type: String, default: '' },
  extraAdultCharge: { type: String, default: '' },
  childCharge: { type: String, default: '' },
  roomsizeinnumber: { type: String, required: true },
  selectedAmenities: { type: selectedAmenitiesSchema, required: true }
});

const roomDataSchema = new mongoose.Schema({
  step: { type: Number, required: true },
  data: { type: [roomSchema], required: true }
});

const photosAndVideosSchema = new mongoose.Schema({
  step: { type: Number, required: false },
  images: [{ type: String, required: true }] // array of photo URLs
});

// Updated Schema for rates
const RateSchema = new mongoose.Schema({
  1: [
    {
      date: { type: Date, required: false },
      value: { type: Number, default: null }, // Single occupancy rates
    },
  ], // Single occupancy rates
  2: [
    {
      date: { type: Date, required: false },
      value: { type: Number, default: null }, // Double occupancy rates
    },
  ], // Double occupancy rates
  3: [
    {
      date: { type: Date, required: false },
      value: { type: Number, default: null }, // Double occupancy rates
    },
  ], // Double occupancy rates
  4: [
    {
      date: { type: Date, required: false },
      value: { type: Number, default: null }, // Double occupancy rates
    },
  ], // Double occupancy rates
});

// Updated Schema for room types
const RoomTypeSchema = new mongoose.Schema({
  availability: [
    {
      date: { type: Date, required: true },
      available: { type: Number, default: 0 }, // Availability count
      sold: { type: Number, default: 0 }, // Sold count
    },
  ],
  rates: {
    EP: { type: RateSchema, default: {} },
    AP: { type: RateSchema, default: {} },
    CP: { type: RateSchema, default: {} },
    MAP: { type: RateSchema, default: {} },
    "extraBed": { type: RateSchema, default: {} },
    "childCharge": { type: RateSchema, default: {} },
  },
});

// Schema for inventory
const InventorySchema = new mongoose.Schema({
  step: { type: Number, required: false }, // Optional step tracking
  b2c: { type: Map, of: RoomTypeSchema, default: {}, required: false },
  b2b: { type: Map, of: RoomTypeSchema, default: {}, required: false },
  website: { type: Map, of: RoomTypeSchema, default: {}, required: false },
});

const PropertySchema = new Schema({
  // Basic Info
  basicInfo: {
    propertyName: { type: String, required: true },
    propertyDescription: { type: String, required: true},
    hotelStarRating: { type: String, required: true },
    propertyBuiltYear: { type: String, required: true },
    propertyType: { type: String, required: true },
    bookingSinceYear: { type: String, required: true },
    channelManager: { type: String, required: false },
    email: { type: String, required: true },
    mobile: { type: String, required: true },
    password: { type: String, required: false, select: false },
    useWhatsApp: { type: Boolean, required: false },
    landline: { type: String, required: false },
    prefered: { type: Boolean, required: false },
    step: { type: String, required: false }
  },

  // Location
  location: {
    address: { type: String, required: false },
    agreeToTerms: { type: Boolean, required: false },
    city: { type: String, required: false },
    state: { type: String, required: false },
    country: { type: String, required: false },
    pincode: { type: String, required: false },
    search: { type: String, required: false },
    step: { type: String, required: false }
  },

  // Amenities
  amenities: {
    step: { type: String, required: false },
    mandatory: {
      "Air Conditioning": { type: String, required: false },
      "Laundry": { type: String, required: false },
      "Newspaper": { type: String, required: false },
      "Parking": { type: String, required: false },
      "Room service": { type: String, required: false },
      "Smoke detector": { type: String, required: false },
      "Smoking rooms": { type: String, required: false },
      "Swimming Pool": { type: String, required: false },
      "Wifi": { type: String, required: false },
      "Lounge": { type: String, required: false },
      "Reception": { type: String, required: false },
      "Bar": { type: String, required: false },
      "Restaurant": { type: String, required: false },
      "Luggage assistance": { type: String, required: false },
      "Wheelchair": { type: String, required: false },
      "Gym/ Fitness centre": { type: String, required: false },
      "CCTV": { type: String, required: false },
      "Fire extinguishers": { type: String, required: false },
      "Airport Transfers": { type: String, required: false },
      "First-aid services": { type: String, required: false },
  },
  basicFacilities: {
      "Elevator/ Lift": { type: String, required: false },
      "Housekeeping": { type: String, required: false },
      "Kitchen/Kitchenette": { type: String, required: false },
      "LAN": { type: String, required: false },
      "Power backup": { type: String, required: false },
      "Refrigerator": { type: String, required: false },
      "Umbrellas": { type: String, required: false },
      "Washing Machine": { type: String, required: false },
      "Laundromat": { type: String, required: false },
      "EV Charging Station": { type: String, required: false },
      "Driver's Accommodation": { type: String, required: false },
  },
  generalServices: {
      "Bellboy service": { type: String, required: false },
      "Caretaker": { type: String, required: false },
      "Concierge": { type: String, required: false },
      "Multilingual Staff": { type: String, required: false },
      "Luggage storage": { type: String, required: false },
      "Specially abled assistance": { type: String, required: false },
      "Wake-up Call / Service": { type: String, required: false },
      "Butler Services": { type: String, required: false },
      "Doctor on call": { type: String, required: false },
      "Medical centre": { type: String, required: false },
      "Pool/ Beach towels": { type: String, required: false },
  },
  outdoorActivitiesAndSports: {
      "Beach": { type: String, required: false },
      "Bonfire": { type: String, required: false },
      "Golf": { type: String, required: false },
      "Kayaks": { type: String, required: false },
      "Canoeing": { type: String, required: false },
      "Outdoor sports": { type: String, required: false },
      "Snorkelling": { type: String, required: false },
      "Telescope": { type: String, required: false },
      "Water sports": { type: String, required: false },
      "Skiing": { type: String, required: false },
      "Jungle Safari": { type: String, required: false },
      "Cycling": { type: String, required: false },
  },
  commonArea: {
      "Balcony/ Terrace": { type: String, required: false },
      "Fireplace": { type: String, required: false },
      "Lawn": { type: String, required: false },
      "Library": { type: String, required: false },
      "Seating Area": { type : String, required: false },
      "Sun Deck": { type: String, required: false },
      "Verandah": { type: String, required: false },
      "Jacuzzi": { type: String, required: false },
  },
  foodAndDrink: {
      "Dining Area": { type: String, required: false },
      "Kitchen": { type: String, required: false },
  },
  healthAndWellness: {
      "Gym": { type: String, required: false },
      "Spa": { type: String, required: false },
      "Sauna": { type: String, required: false },
  },
  businessCenterAndConferences: {
      "Meeting Room": { type: String, required: false },
      "Conference Hall": { type: String, required: false },
  },
  beautyAndSpa: {
      "Beauty Services": { type: String, required: false },
      "Spa Services": { type: String, required: false },
  },
  security: {
      "CCTV": { type: String, required: false },
      "Fire extinguishers": { type: String, required: false },
  },
  transfers: {
      "Airport Transfer": { type: String, required: false },
      "Shuttle Service": { type: String, required: false },
  },
  entertainment: {
      "Game Room": { type: String, required: false },
      "TV": { type: String, required: false },
  },
  shopping: {
      "Gift Shop": { type: String, required: false },
      "Mini Market": { type: String, required: false },
  },
  paymentServices: {
      "Card Payment": { type: String, required: false },
      "Online Payment": { type: String, required: false },
  },
  indoorActivitiesAndSports: {
      "Indoor Pool": { type: String, required: false },
      "Table Tennis": { type: String, required: false },
  },
  familyAndKids: {
      "Kids Play Area": { type: String, required: false },
      "Babysitting": { type: String, required: false },
  },
  petEssentials: {
      "Pet Friendly": { type: String, required: false },
      "Pet Food": { type: String, required: false },
  },
  },
  // Rooms
  rooms: roomDataSchema,

  // Photos and Videos
  photosAndVideos: photosAndVideosSchema,

  // Policies (Updated)
  policies: {
    step: { type: String, required: false },
    cancellationPolicy: { type: String, required: false },
    checkIn: { type: String, required: false }, // e.g., "12:00 pm (noon)"
    checkOut: { type: String, required: false }, // e.g., "12:00 pm (noon)"
    guestProfileAnswers: {
      unmarriedCouples: { type: String, required: false },
      guestsBelow18: { type: String, required: false },
      maleOnlyGroups: { type: String, required: false },
    },
    acceptableIdProof: { type: String, required: false },
    sameCity: { type: String, required: false },
    propertyRestrictions: {
      smoking: { type: String, required: false },
      privateParties: { type: String, required: false },
      outsideVisitors: { type: String, required: false },
      wheelchairAccessible: { type: String, required: false },
    },
    petPolicy: {
      petsAllowed: { type: String, required: false },
      petsLivingOnProperty: { type: String, required: false },
    },
    checkinCheckoutPolicies: {
      twentyFourHourCheckin: { type: String, required: false },
    },
    extraBedPolicies: {
      extraAdults: { type: String, required: false },
      extraKids: { type: String, required: false },
    },
    customPolicy: { type: String, required: false },
    mealRackPrices: {
      breakfast: { type: String, required: false },
      lunch: { type: String, required: false },
      dinner: { type: String, required: false },
    },
  },

  // Finance & Legal
  financeAndLegal: {
    step: { type: Number, required: false },
    ownershipType: { type: String, required: false },
    propertyDocument: { type: String, default: null },
    relationshipDoc: { type: String, default: '' },
    relationshipDocument: { type: String, default: null },
    accountNumber: { type: String, required: false },
    reEnterAccountNumber: { type: String, required: false },
    ifscCode: { type: String, required: false },
    bankName: { type: String, required: false },
    address: { type: String, required: false },
    hasGSTIN: { type: String, required: false },
    gstin: { type: String, default: '' },
    pan: { type: String, required: false },
    acceptGstNoc: { type: Boolean, required: false },
    hasTAN: { type: String, required: false },
    tan: { type: String, default: '' },
    pricingDetails: {
      basePrice: { type: Number, default: 0 },
      taxRate: { type: Number, default: 0 },
      currency: { type: String, default: 'false' }
    },
    legalDocuments: [{ type: String }]
  },

  // Inventory & Rates
  inventory: InventorySchema,

  // Meta Information
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Middleware to update the `updatedAt` field automatically
PropertySchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Middleware to hash password before saving
PropertySchema.pre("save", async function (next) {
  // Auto-generate password from mobile if password is not provided
  if (this.basicInfo && this.basicInfo.mobile) {
    // If password is missing, empty, or null, set it to mobile number
    if (!this.basicInfo.password || 
        (typeof this.basicInfo.password === 'string' && this.basicInfo.password.trim().length === 0)) {
      this.basicInfo.password = this.basicInfo.mobile;
    }
  }

  // Only hash the password if it has been modified (or is new)
  // Check if basicInfo.password is modified or if this is a new document
  if (this.isNew || this.isModified("basicInfo.password") || this.isModified("basicInfo")) {
    if (this.basicInfo && this.basicInfo.password && typeof this.basicInfo.password === 'string' && this.basicInfo.password.length > 0) {
      // Only hash if password is not already hashed (bcrypt hashes start with $2a$, $2b$, or $2y$)
      if (!this.basicInfo.password.startsWith('$2a$') && !this.basicInfo.password.startsWith('$2b$') && !this.basicInfo.password.startsWith('$2y$')) {
        this.basicInfo.password = await bcryptjs.hash(this.basicInfo.password, 10);
      }
    }
  }
  next();
});

const Property = mongoose.model("PackageMaker", PropertySchema);

export default Property;
