const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGO_URI = 'mongodb+srv://harshadbargaje_1205:quizapp1234@cluster0.6joa4y7.mongodb.net/quiz_db?retryWrites=true&w=majority&appName=Cluster0';

async function resetAdmin() {
    try {
        console.log('Connecting to MongoDB Atlas...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected.');

        const db = mongoose.connection.db;

        // Hash the password manually exactly ONCE
        const plainPassword = 'AdminPassword@123';
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(plainPassword, salt);

        // Direct update to MongoDB collection (bypasses any Mongoose double-hashing hooks)
        await db.collection('admins').deleteMany({});
        await db.collection('admins').insertOne({
            name: 'Master Administrator',
            email: 'admin@college.edu.in',
            password: hashedPassword,
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // Test the password immediately to prove it matches
        const savedAdmin = await db.collection('admins').findOne({ email: 'admin@college.edu.in' });
        const testMatch = await bcrypt.compare(plainPassword, savedAdmin.password);

        console.log('\n=========================================');
        console.log('🎉 ADMIN CREDENTIALS REBUILT SUCCESSFULLY');
        console.log('Password Self-Test Passed:', testMatch ? '✅ YES' : '❌ NO');
        console.log('Email:    admin@college.edu.in');
        console.log('Password: AdminPassword@123');
        console.log('=========================================\n');

        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
}

resetAdmin();