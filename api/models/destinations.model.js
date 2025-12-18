import mongoose from "mongoose";

const destinationSchema = new mongoose.Schema(
    {
        cityname:{
            type: String,
            required: true,
        },
        description:{
            type: String,
            required: true,
        },
        address:{
            type: String,
            required: true,
        },
        thingToDo:{
            type: Array,
            required: true,
        },
        tourAttraction:{
            type: Array,
            required: true,
        },
        imageUrls:{
            type: Array,
            required: true,
        },
        reviewsTitle:{
            type: Array,
            required: true,
        },
        reviewsDescription:{
            type: Array,
            required: true,
        }
    },
    {timestamps : true}
)


const Destination = mongoose.model('Destination', destinationSchema);

export default Destination;


// {
//     "name": "digvijay",
//    "description": "testing",
//    "address": "hello",
//    "regularPrice":40,
//    "discountPrice":20,
//    "packageType":"regular",
//    "quantity":40,
//    "highlights": ["hhe","fjej"],
//    "offer": true,
//    "imageUrls": ["hhe","fjej"],
//    "userRef": "hello"
//   }