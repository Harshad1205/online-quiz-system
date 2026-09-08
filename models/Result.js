const mongoose = require('mongoose');

const studentAnswerSchema = new mongoose.Schema(
    {
        questionIndex: {
            type: Number,
            required: true
        },
        questionText: {
            type: String,
            required: true
        },
        options: {
            type: [String],
            required: true
        },
        selectedOption: {
            type: Number,
            default: null // null if the student skipped the question
        },
        correctOption: {
            type: Number,
            required: true
        },
        isCorrect: {
            type: Boolean,
            required: true
        }
    },
    { _id: false }
);

const resultSchema = new mongoose.Schema(
    {
        studentName: {
            type: String,
            required: true,
            trim: true
        },
        studentEmail: {
            type: String,
            required: true,
            trim: true,
            lowercase: true
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
        answers: {
            type: [studentAnswerSchema],
            default: []
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
        timestamps: true
    }
);

module.exports = mongoose.model('Result', resultSchema);