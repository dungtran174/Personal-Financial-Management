const Income = require("../models/Income");
const Expense = require("../models/Expense");
const {isValidObjectId, Types} = require("mongoose");

exports.getDashboardData = async (req, res) => {
 try{
        const userId = req.user.id;
        const userObjectId = new Types.ObjectId(String(userId));

        // Fetch total income and expenses
        const totalIncome = await Income.aggregate([
            { $match: {userId: userObjectId} },
            { $group: { _id: null, total: { $sum: "$amount"} } },
        ]);
        
        console.log("totalIncome", {totalIncome, userId: isValidObjectId(userId)});

        const totalExpense = await Expense.aggregate([
            { $match: {userId: userObjectId} },
            { $group: { _id: null, total: { $sum: "$amount"} } },
        ])

        // get income transactions in the last 30 days
        const last30DaysIncomeTransactions = await Income.find({
            userId,
            date: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        }).sort( {date: -1} );

        // get total income last 30 days
        const incomeLast30Days = last30DaysIncomeTransactions.reduce(
            (sum, transaction) => sum + transaction.amount,
            0
        );

        // get Expenses transactions in the last 30 days
        const last30DaysExpensesTransactions = await Expense.find({
            userId,
            date: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        }).sort( {date: -1} );

        // get total Expenses last 30 days
        const expensesLast30Days = last30DaysExpensesTransactions.reduce(
            (sum, transaction) => sum + transaction.amount,
            0
        );

        // fetch 10 last transactions (income + expenses)
        const lastTransactions = [
            ...(await Income.find ({ userId }).sort( {date: -1}).limit(10)).map(
                (txn) => ({
                    ...txn.toObject(),
                    type: "income"
                })
            ),
            ...(await Expense.find ({ userId }).sort( {date: -1}).limit(10)).map(
                (txn) => ({
                    ...txn.toObject(),
                    type: "expense"
                })
            ),
        ].sort((a,b) => b.date - a.date); // sort latest first

        // Final response
        res.json({
            totalBalance:
                (totalIncome[0]?.total || 0) - (totalExpense[0]?.total || 0),
            totalIncome: totalIncome[0]?.total || 0,
            totalExpenses: totalExpense[0]?.total || 0,
            last30DaysExpenses: {
                total: expensesLast30Days,
                transactions: last30DaysExpensesTransactions,
            },
            last30DaysIncome: {
                total: incomeLast30Days,
                transactions: last30DaysIncomeTransactions,
            },
            recentTransactions: lastTransactions,
        });
    } catch (error){
        res.status(500).json({message: "Server Error", error});
    }
}