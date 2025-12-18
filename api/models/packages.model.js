import mongoose from "mongoose";

const packageSchema = new mongoose.Schema(
    {
        agentPackage: {
            type: String,
            required: false,
        },
        amenities: {
            type: Array,
            required: false,
        },
        customizablePackage: {
            type: Boolean,
            required: false,
        },
        defaultHotelPackage: {
            type: String,
            required: false,
        },
        defaultVehicle: {
            type: String,
            required: false,
        },
        displayOrder: {
            type: String,
            required: false,
        },
        dropLocation: {
            type: String,
            required: false,
        },
        duration: {
            type: String,
            required: false,
        },
        hotelCategory: {
            type: String,
            required: false,
        },
        initialAmount: {
            type: String,
            required: false,
        },
        packageCategory: {
            type: String,
            required: false,
        },
        packageDescription: {
            type: String,
            required: false,
        },
        packageExclusions: {
            type: String,
            required: true,
        },
        packageImages: {
            type: Array,
            required: false,
        },
        packageInclusions: {
            type: String,
            required: false,
        },
        packageName: {
            type: String,
            required: false,
        },
        packagePlaces: [
            {
                placeCover: {
                    type: String,
                    required: false,
                },
                nights: {
                    type: String,
                    required: false,
                },
                transfer: {
                    type: Boolean,
                    required: false,
                }
            }
        ],
        packageType: {
            type: String,
            required: false,
        },
        pickupLocation: {
            type: String,
            required: false,
        },
        pickupTransfer: {
            type: Boolean,
            required: false,
        },
        priceTag: {
            type: String,
            required: false,
        },
        status: {
            type: String,
            required: false,
        },
        tags: {
            type: Array,
            required: false,
        },
        themes: {
            type: Array,
            required: false,
        },
        tourBy: {
            type: String,
            required: false,
        },
        userRef: {
            type: String,
            required: false,
        },
        validTill: {
            type: String,
            required: false,
        },
        travelPrices: {
            prices: {
                type: Map,
                of: {
                    onSeasonPrice: { type: String, required: false },
                    offSeasonPrice: { type: String, required: false },
                },
                required: false,
            },
            travelInfo: {
                type: [[String]], // Allows an array of arrays of strings
                required: false,
            },
            cabs: [
                {
                    cabType: { type: String, required: false },
                    cabName: { type: String, required: false },
                    cabImages: { type: [String], required: false },
                    cabSeatingCapacity: { type: String, required: false },
                    cabLuggage: { type: String, required: false },
                }
            ]
        },
        hotels: [{
            day: String,
            city: String,
            hotelName: String
        }]
    },
    { timestamps: true }
);

const Packages = mongoose.model('Packages', packageSchema);

export default Packages;
