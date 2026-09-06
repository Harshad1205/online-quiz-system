const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema(
    {
        question: {
            type: String,
            required: true
        },
        options: {
            type: [String],
            required: true
        },
        correctAnswer: {
            type: Number,
            required: true
        }
    },
    {
        _id: false
    }
);

const quizSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true
        },
        subject: {
            type: String,
            required: true
        },
        quizCode: {
            type: String,
            required: true,
            unique: true
        },
        duration: {
            type: Number,
            required: true,
            default: 10 // Duration in minutes
        },
        deadline: {
            type: Date,
            required: false, // Optional: allows "No Limit" or a specific deadline
            default: null
        },
        faculty: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Faculty',
            required: true
        },
        questions: {
            type: [questionSchema],
            required: true
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model('Quiz', quizSchema);