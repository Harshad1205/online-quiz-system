const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const facultySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },
        password: {
            type: String,
            required: true
        },
        role: {
            type: String,
            enum: ['faculty', 'admin'],
            default: 'faculty'
        },
        isApproved: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true
    }
);

// Method to verify password during login
facultySchema.methods.comparePassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('Faculty', facultySchema);