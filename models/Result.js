const mongoose = require('mongoose');

const resultSchema = new mongoose.Schema(
    {
        studentName: {
            type: String,
            required: true,
            trim: true
        },
        studentEmail: {
            type: String,
            lowercase: true,
            trim: true
        },
        rollNo: {
            type: String,
            trim: true
        },
        quiz: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Quiz',
            required: true
        },
        score: {
            type: Number,
            required: true
        },
        totalQuestions: {
            type: Number,
            required: true
        },
        submissionReason: {
            type: String,
            default: 'Normal Submission'
        },
        submittedAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: true // Automatically maintains createdAt and updatedAt
    }
);

module.exports = mongoose.model('Result', resultSchema);