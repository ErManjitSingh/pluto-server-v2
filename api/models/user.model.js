import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    username : {
        type: String,
        required: true,
        unique: true,
    },
    email : {
        type: String,
        required: true,
        unique: true,
    },
hotelId: { 
        type: String,
       
    },
    userType: { 
        type: String,
       
    },
    phone : {
        type: String,
        required: true,
        unique: true,
        validate: {
            validator: function(v) {
                return /^\d{10}$/.test(v);  // Validates 10-digit phone numbers
            },
            message: props => `${props.value} is not a valid phone number!`
        }
    },
    password : {
        type: String,
        required: true,
    },
    avatar : {
        type: String,
        default: "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png",
    },
}, { timestamps : true});


const User = mongoose.model('User', userSchema);

export default User;
