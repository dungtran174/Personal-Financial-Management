require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Income = require('./models/Income');
const Expense = require('./models/Expense');

const resetData = async () => {
    const token = process.env.TEST_AUTH_TOKEN;
    if (!token) {
        console.error('Error: TEST_AUTH_TOKEN not found in .env');
        process.exit(1);
    }

    try {
        // Decode token to get userId
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.id;
        console.log(`Target User ID: ${userId}`);

        // Connect to DB
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');

        // Delete Incomes
        const incomeResult = await Income.deleteMany({ userId: userId });
        console.log(`Deleted ${incomeResult.deletedCount} income records.`);

        // Delete Expenses
        const expenseResult = await Expense.deleteMany({ userId: userId });
        console.log(`Deleted ${expenseResult.deletedCount} expense records.`);

        console.log('Data reset successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Error resetting data:', error);
        process.exit(1);
    }
};

resetData();
