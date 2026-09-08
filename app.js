const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const ExcelJS = require('exceljs');

require('dotenv').config();

const Admin = require('./models/Admin');
const Faculty = require('./models/Faculty');
const Quiz = require('./models/Quiz');
const Result = require('./models/Result'); // Fixed case-sensitivity for Linux/Render

const app = express();

// ========================================
// DATABASE CONNECTION & SEED DEFAULT ADMIN
// ========================================
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/quiz_db';

mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log('✅ MongoDB Connected Successfully');
        
        try {
            const adminCount = await Admin.countDocuments();
            if (adminCount === 0) {
                const defaultAdminEmail = (process.env.ADMIN_EMAIL || 'admin@college.edu.in').toLowerCase();
                const defaultAdminPassword = process.env.ADMIN_PASSWORD || 'Admin@2026';
                const hashedPassword = await bcrypt.hash(defaultAdminPassword, 10);

                await Admin.create({
                    name: 'Head of Department (HOD)',
                    email: defaultAdminEmail,
                    password: hashedPassword
                });
                console.log(`👑 Default Master Admin created: ${defaultAdminEmail} / ${defaultAdminPassword}`);
            }
        } catch (adminSeedError) {
            console.error('⚠️ Admin seeding error:', adminSeedError.message);
        }
    })
    .catch((err) => console.error('❌ MongoDB Connection Error:', err.message));

// ========================================
// MIDDLEWARE CONFIGURATION
// ========================================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(
    session({
        secret: process.env.SESSION_SECRET || 'institutionalQuizSecret2026',
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 1000 * 60 * 60 * 24 // 24 hours
        }
    })
);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ========================================
// AUTHENTICATION GUARDS
// ========================================
function isFacultyLoggedIn(req, res, next) {
    if (!req.session || !req.session.facultyId) {
        return res.redirect('/faculty/login');
    }
    next();
}

function isAdminLoggedIn(req, res, next) {
    if (!req.session || !req.session.adminId) {
        return res.redirect('/admin/login');
    }
    next();
}

// ========================================
// HOME / PORTAL SELECTION
// ========================================
app.get('/', (req, res) => {
    res.render('index');
});

// ========================================
// DEDICATED ADMIN PORTAL ROUTES
// ========================================
app.get('/admin/login', (req, res) => {
    res.render('admin-login', { error: null });
});

app.post('/admin/login', async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.render('admin-login', { error: 'Please provide both email and password.' });
        }

        const admin = await Admin.findOne({ email: email.trim().toLowerCase() });
        if (!admin) {
            return res.render('admin-login', { error: 'Invalid Administrator Credentials.' });
        }

        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            return res.render('admin-login', { error: 'Invalid Administrator Credentials.' });
        }

        req.session.adminId = admin._id.toString();
        req.session.adminName = admin.name;

        res.redirect('/admin/approvals');
    } catch (error) {
        next(error);
    }
});

app.get('/admin/approvals', isAdminLoggedIn, async (req, res, next) => {
    try {
        const pendingFaculty = await Faculty.find({ isApproved: false }).sort({ createdAt: -1 }).lean();
        const approvedFaculty = await Faculty.find({ isApproved: true }).sort({ createdAt: -1 }).lean();

        res.render('admin-approvals', {
            pendingFaculty: pendingFaculty || [],
            approvedFaculty: approvedFaculty || [],
            adminName: req.session.adminName || 'Department Head'
        });
    } catch (error) {
        next(error);
    }
});

app.post('/admin/approve-faculty/:id', isAdminLoggedIn, async (req, res, next) => {
    try {
        await Faculty.findByIdAndUpdate(req.params.id, { isApproved: true });
        res.redirect('/admin/approvals');
    } catch (error) {
        next(error);
    }
});

app.post('/admin/reject-faculty/:id', isAdminLoggedIn, async (req, res, next) => {
    try {
        await Faculty.findByIdAndDelete(req.params.id);
        res.redirect('/admin/approvals');
    } catch (error) {
        next(error);
    }
});

app.get('/admin/logout', (req, res) => {
    delete req.session.adminId;
    delete req.session.adminName;
    res.redirect('/admin/login');
});

// ========================================
// FACULTY AUTHENTICATION & ONBOARDING
// ========================================
app.get('/faculty/register', (req, res) => {
    res.render('faculty-register', { error: null });
});

app.post('/faculty/register', async (req, res, next) => {
    try {
        const { name, email, password, secretKey } = req.body;

        if (!name || !email || !password || !secretKey) {
            return res.status(400).render('faculty-register', { 
                error: 'All fields, including the Department Security Passcode, are required.' 
            });
        }

        const configuredKey = process.env.FACULTY_SECRET_KEY || 'CollegeFaculty@2026';
        if (secretKey.trim() !== configuredKey) {
            return res.status(401).render('faculty-register', { 
                error: 'Invalid Faculty Security Passcode. Unauthorized registrations are prohibited.' 
            });
        }

        const cleanEmail = email.trim().toLowerCase();
        const existingFaculty = await Faculty.findOne({ email: cleanEmail });
        if (existingFaculty) {
            return res.status(409).render('faculty-register', { 
                error: `The email "${cleanEmail}" is already registered. Please sign in.` 
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await Faculty.create({
            name: name.trim(),
            email: cleanEmail,
            password: hashedPassword,
            isApproved: false
        });

        return res.render('faculty-login', { 
            error: null, 
            info: 'Registration submitted successfully! Your account is pending HOD/Admin verification. Please login once approved.' 
        });

    } catch (error) {
        next(error);
    }
});

app.get('/faculty/login', (req, res) => {
    res.render('faculty-login', { error: null, info: null });
});

app.post('/faculty/login', async (req, res, next) => {
    try {
        const { email, password } = req.body;

        const cleanEmail = (email || '').trim().toLowerCase();
        const faculty = await Faculty.findOne({ email: cleanEmail });
        if (!faculty) {
            return res.render('faculty-login', { error: 'Invalid email or password.', info: null });
        }

        const passwordMatch = await bcrypt.compare(password, faculty.password);
        if (!passwordMatch) {
            return res.render('faculty-login', { error: 'Invalid email or password.', info: null });
        }

        if (!faculty.isApproved) {
            return res.render('faculty-login', {
                error: 'Account Pending: Awaiting verification and clearance from Department Administrator/HOD.',
                info: null
            });
        }

        req.session.facultyId = faculty._id.toString();
        req.session.facultyName = faculty.name;

        res.redirect('/faculty/dashboard');
    } catch (error) {
        next(error);
    }
});

app.get('/faculty/logout', (req, res) => {
    delete req.session.facultyId;
    delete req.session.facultyName;
    res.redirect('/faculty/login');
});

// ========================================
// FACULTY DASHBOARD & QUIZ MANAGEMENT
// ========================================
app.get('/faculty/dashboard', isFacultyLoggedIn, async (req, res, next) => {
    try {
        const facultyId = req.session.facultyId;

        let query = { faculty: facultyId };
        if (mongoose.Types.ObjectId.isValid(facultyId)) {
            query = {
                $or: [
                    { faculty: facultyId },
                    { faculty: new mongoose.Types.ObjectId(facultyId) }
                ]
            };
        }

        const rawQuizzes = await Quiz.find(query).sort({ createdAt: -1 }).lean();

        const quizzes = (rawQuizzes || []).map(q => ({
            ...q,
            title: q.title || 'Untitled Assessment',
            subject: q.subject || 'General',
            quizCode: q.quizCode || '------',
            duration: q.duration || 10,
            deadline: q.deadline || null,
            questions: Array.isArray(q.questions) ? q.questions : []
        }));

        res.render('dashboard', {
            facultyName: req.session.facultyName || 'Faculty Member',
            quizzes
        });
    } catch (err) {
        next(err);
    }
});

app.get('/faculty/create-quiz', isFacultyLoggedIn, (req, res) => {
    res.render('create-quiz', { error: null });
});

app.post('/faculty/create-quiz', isFacultyLoggedIn, async (req, res, next) => {
    try {
        const {
            title,
            subject,
            duration,
            deadline,
            question,
            option1,
            option2,
            option3,
            option4,
            correctAnswer
        } = req.body;

        if (!title || !subject || !question) {
            return res.status(400).render('create-quiz', {
                error: 'Please provide Title, Subject, and at least one complete Question.'
            });
        }

        let parsedDeadline = null;
        if (deadline && String(deadline).trim() !== '') {
            const tempDate = new Date(deadline);
            if (!isNaN(tempDate.getTime())) {
                parsedDeadline = tempDate;
            }
        }

        const questions = Array.isArray(question) ? question : [question];
        const options1 = Array.isArray(option1) ? option1 : [option1];
        const options2 = Array.isArray(option2) ? option2 : [option2];
        const options3 = Array.isArray(option3) ? option3 : [option3];
        const options4 = Array.isArray(option4) ? option4 : [option4];
        const correctAnswers = Array.isArray(correctAnswer) ? correctAnswer : [correctAnswer];

        const quizQuestions = questions.map((q, index) => {
            const parsedCorrect = Number(correctAnswers[index]);
            return {
                question: String(q).trim(),
                options: [
                    String(options1[index] || '').trim(),
                    String(options2[index] || '').trim(),
                    String(options3[index] || '').trim(),
                    String(options4[index] || '').trim()
                ],
                correctAnswer: Number.isNaN(parsedCorrect) ? 0 : parsedCorrect
            };
        });

        let quizCode;
        let attempts = 0;
        let codeExists = true;

        while (codeExists && attempts < 10) {
            attempts++;
            quizCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            const existingQuiz = await Quiz.findOne({ quizCode });
            codeExists = Boolean(existingQuiz);
        }

        const quiz = new Quiz({
            title: title.trim(),
            subject: subject.trim(),
            duration: Math.max(1, Number(duration) || 10),
            deadline: parsedDeadline,
            quizCode,
            faculty: req.session.facultyId,
            questions: quizQuestions
        });

        await quiz.save();
        res.redirect('/faculty/dashboard');

    } catch (error) {
        next(error);
    }
});

app.get('/faculty/edit-quiz/:id', isFacultyLoggedIn, async (req, res, next) => {
    try {
        const quiz = await Quiz.findOne({
            _id: req.params.id,
            faculty: req.session.facultyId
        }).lean();

        if (!quiz) {
            return res.status(404).send('Assessment not found or unauthorized.');
        }

        res.render('edit-quiz', { quiz });
    } catch (error) {
        next(error);
    }
});

app.post('/faculty/edit-quiz/:id', isFacultyLoggedIn, async (req, res, next) => {
    try {
        const {
            title,
            subject,
            duration,
            deadline,
            question,
            option1,
            option2,
            option3,
            option4,
            correctAnswer
        } = req.body;

        let parsedDeadline = null;
        if (deadline && String(deadline).trim() !== '') {
            const tempDate = new Date(deadline);
            if (!isNaN(tempDate.getTime())) {
                parsedDeadline = tempDate;
            }
        }

        const questions = Array.isArray(question) ? question : [question];
        const options1 = Array.isArray(option1) ? option1 : [option1];
        const options2 = Array.isArray(option2) ? option2 : [option2];
        const options3 = Array.isArray(option3) ? option3 : [option3];
        const options4 = Array.isArray(option4) ? option4 : [option4];
        const correctAnswers = Array.isArray(correctAnswer) ? correctAnswer : [correctAnswer];

        const updatedQuestions = questions.map((q, index) => ({
            question: String(q).trim(),
            options: [
                String(options1[index] || '').trim(),
                String(options2[index] || '').trim(),
                String(options3[index] || '').trim(),
                String(options4[index] || '').trim()
            ],
            correctAnswer: Number(correctAnswers[index]) || 0
        }));

        await Quiz.findOneAndUpdate(
            { _id: req.params.id, faculty: req.session.facultyId },
            {
                title: title.trim(),
                subject: subject.trim(),
                duration: Math.max(1, Number(duration) || 10),
                deadline: parsedDeadline,
                questions: updatedQuestions
            }
        );

        res.redirect('/faculty/dashboard');
    } catch (error) {
        next(error);
    }
});

app.post('/faculty/delete-quiz/:id', isFacultyLoggedIn, async (req, res, next) => {
    try {
        const quiz = await Quiz.findOne({
            _id: req.params.id,
            faculty: req.session.facultyId
        });

        if (!quiz) {
            return res.status(404).send('Quiz not found or unauthorized.');
        }

        await Result.deleteMany({ quiz: quiz._id });
        await Quiz.deleteOne({ _id: quiz._id });

        res.redirect('/faculty/dashboard');
    } catch (error) {
        next(error);
    }
});

// View Submissions and Telemetry
app.get('/faculty/quiz-results/:id', isFacultyLoggedIn, async (req, res, next) => {
    try {
        const quiz = await Quiz.findOne({
            _id: req.params.id,
            faculty: req.session.facultyId
        }).lean();

        if (!quiz) {
            return res.status(404).send('Quiz not found or unauthorized.');
        }

        const rawResults = await Result.find({
            quiz: quiz._id
        }).sort({
            score: -1,
            submittedAt: -1
        }).lean();

        const results = (rawResults || []).map(r => ({
            ...r,
            studentName: r.studentName || 'Student',
            studentEmail: r.studentEmail || 'N/A',
            score: typeof r.score === 'number' ? r.score : 0,
            totalQuestions: r.totalQuestions || (quiz.questions ? quiz.questions.length : 1),
            answers: Array.isArray(r.answers) ? r.answers : []
        }));

        res.render('quiz-results', { quiz, results });
    } catch (error) {
        next(error);
    }
});

// =========================================================
// EXCEL DATABASE EXPORT ROUTE (WITH DETAILED CHOICES)
// =========================================================
app.get('/faculty/export-results/:id', isFacultyLoggedIn, async (req, res, next) => {
    try {
        const quiz = await Quiz.findOne({
            _id: req.params.id,
            faculty: req.session.facultyId
        }).lean();

        if (!quiz) {
            return res.status(404).send('Quiz not found or unauthorized.');
        }

        const results = await Result.find({ quiz: quiz._id }).sort({ score: -1, submittedAt: -1 }).lean();

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Institutional Examination Portal';
        workbook.created = new Date();

        const worksheet = workbook.addWorksheet('Assessment Submissions', {
            views: [{ showGridLines: true }]
        });

        const columns = [
            { header: 'Sr No.', key: 'srNo', width: 8 },
            { header: 'Student Name', key: 'studentName', width: 26 },
            { header: 'Student Email', key: 'studentEmail', width: 32 },
            { header: 'Marks Obtained', key: 'score', width: 16 },
            { header: 'Total Marks', key: 'total', width: 14 },
            { header: 'Percentage', key: 'percentage', width: 14 },
            { header: 'Submission Status', key: 'reason', width: 26 },
            { header: 'Submission Timestamp', key: 'submittedAt', width: 24 }
        ];

        (quiz.questions || []).forEach((q, qIndex) => {
            columns.push({
                header: `Q${qIndex + 1} Choice`,
                key: `q_${qIndex}`,
                width: 25
            });
        });

        worksheet.columns = columns;

        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF1E293B' }
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.height = 25;

        results.forEach((resItem, idx) => {
            const total = resItem.totalQuestions || (quiz.questions ? quiz.questions.length : 1);
            const percentage = ((resItem.score / total) * 100).toFixed(1) + '%';
            const dateStr = resItem.submittedAt ? new Date(resItem.submittedAt).toLocaleString() : 'N/A';

            const rowData = {
                srNo: idx + 1,
                studentName: resItem.studentName,
                studentEmail: resItem.studentEmail,
                score: resItem.score,
                total: total,
                percentage: percentage,
                reason: resItem.submissionReason || 'Normal Submission',
                submittedAt: dateStr
            };

            if (resItem.answers && resItem.answers.length > 0) {
                resItem.answers.forEach((ans, qIndex) => {
                    if (ans.selectedOption !== null && ans.selectedOption !== undefined) {
                        const optLetter = String.fromCharCode(65 + ans.selectedOption);
                        const optVal = ans.options && ans.options[ans.selectedOption] ? ans.options[ans.selectedOption] : '';
                        rowData[`q_${qIndex}`] = `${optLetter}: ${optVal} ${ans.isCorrect ? '(✔ Correct)' : '(✖ Wrong)'}`;
                    } else {
                        rowData[`q_${qIndex}`] = 'Skipped';
                    }
                });
            }

            const row = worksheet.addRow(rowData);
            row.getCell('srNo').alignment = { horizontal: 'center' };
            row.getCell('score').alignment = { horizontal: 'center' };
            row.getCell('total').alignment = { horizontal: 'center' };
            row.getCell('percentage').alignment = { horizontal: 'center' };
            row.getCell('submittedAt').alignment = { horizontal: 'center' };

            if (idx % 2 === 1) {
                row.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFF8FAFC' }
                };
            }
        });

        const safeTitle = (quiz.title || 'Exam').replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `Submissions_${safeTitle}_${quiz.quizCode}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        next(error);
    }
});

// =========================================================
// STUDENT FLOW & ASSESSMENT ROOM
// =========================================================
app.get('/join', (req, res) => {
    res.render('join-quiz', { error: null });
});

app.post('/join', async (req, res, next) => {
    try {
        const { studentName, studentEmail, quizCode } = req.body;
        const email = (studentEmail || '').toLowerCase().trim();

        const quiz = await Quiz.findOne({
            quizCode: (quizCode || '').trim().toUpperCase()
        });

        if (!quiz) {
            return res.render('join-quiz', { error: 'Invalid Quiz Code. Please double check with your instructor.' });
        }

        if (quiz.deadline && new Date() > new Date(quiz.deadline)) {
            return res.render('join-quiz', {
                error: `This assessment expired on ${new Date(quiz.deadline).toLocaleString()}. Submissions are closed.`
            });
        }

        const existingResult = await Result.findOne({
            quiz: quiz._id,
            studentEmail: email
        });

        if (existingResult) {
            return res.render('join-quiz', { error: 'Your attempt has already been submitted and recorded for this quiz.' });
        }

        req.session.studentName = studentName.trim();
        req.session.studentEmail = email;
        req.session.examQuizId = quiz._id.toString();

        res.redirect(`/exam/${quiz._id}`);
    } catch (error) {
        next(error);
    }
});

app.get('/exam/:id', async (req, res, next) => {
    try {
        if (!req.session || !req.session.studentName || req.session.examQuizId !== req.params.id) {
            return res.redirect('/join');
        }

        const quiz = await Quiz.findById(req.params.id).lean();
        if (!quiz) {
            return res.status(404).send('Quiz session not found.');
        }

        if (quiz.deadline && new Date() > new Date(quiz.deadline)) {
            return res.send('The submission deadline for this quiz has expired.');
        }

        res.render('exam', {
            quiz,
            studentName: req.session.studentName
        });
    } catch (error) {
        next(error);
    }
});

app.post('/exam/:id/submit', async (req, res, next) => {
    try {
        if (!req.session || !req.session.studentName) {
            return res.redirect('/join');
        }

        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) {
            return res.status(404).send('Quiz assessment not found.');
        }

        const existingResult = await Result.findOne({
            quiz: quiz._id,
            studentEmail: req.session.studentEmail
        });

        if (existingResult) {
            return res.redirect('/');
        }

        const now = new Date();
        const isPastDeadline = quiz.deadline && now > new Date(quiz.deadline);

        let score = 0;
        const recordedAnswers = [];

        quiz.questions.forEach((q, index) => {
            const rawAnswer = req.body[`question_${index}`];
            const hasAnswered = rawAnswer !== undefined && rawAnswer !== '';
            const selectedOption = hasAnswered ? Number(rawAnswer) : null;
            const isCorrect = selectedOption !== null && selectedOption === q.correctAnswer;

            if (isCorrect) {
                score++;
            }

            recordedAnswers.push({
                questionIndex: index,
                questionText: q.question,
                options: q.options,
                selectedOption: selectedOption,
                correctOption: q.correctAnswer,
                isCorrect: isCorrect
            });
        });

        let submissionReason = req.body.submissionReason || 'Normal Submission';
        if (isPastDeadline) {
            submissionReason = 'Late Submission (Post-Deadline)';
        }

        const submittedAt = req.body.submittedAt ? new Date(req.body.submittedAt) : now;

        const result = new Result({
            studentName: req.session.studentName,
            studentEmail: req.session.studentEmail,
            quiz: quiz._id,
            score,
            totalQuestions: quiz.questions.length,
            answers: recordedAnswers,
            submissionReason,
            submittedAt
        });

        await result.save();

        const studentName = req.session.studentName;
        const studentEmail = req.session.studentEmail;
        delete req.session.examQuizId;

        res.render('result', {
            quiz,
            result,
            score,
            totalQuestions: quiz.questions.length,
            studentName,
            studentEmail,
            submissionReason,
            submittedAt
        });
    } catch (error) {
        next(error);
    }
});

// ========================================
// GLOBAL DIAGNOSTIC ERROR HANDLER
// ========================================
app.use((err, req, res, next) => {
    console.error('🔥 CRITICAL ERROR TRACE:', err);
    res.status(500).send(`
        <div style="font-family: sans-serif; padding: 30px; background: #0f172a; color: #f87171; min-height: 100vh;">
            <h1 style="color: #ef4444; margin-top: 0;">500 — Application Runtime Error</h1>
            <p style="color: #cbd5e1; font-size: 16px;"><strong>Error Message:</strong> ${err.message}</p>
            <p style="color: #94a3b8; font-size: 13px;"><strong>Route:</strong> ${req.method} ${req.originalUrl}</p>
            <pre style="background: #1e293b; color: #38bdf8; padding: 20px; border-radius: 10px; overflow-x: auto; font-size: 13px; line-height: 1.5; border: 1px solid #334155;">${err.stack}</pre>
        </div>
    `);
});

// ========================================
// START SERVER
// ========================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Examination Server running at http://localhost:${PORT}`);
});