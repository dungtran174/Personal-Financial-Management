const Income = require("../models/Income");
const Expense = require("../models/Expense");
const { Types } = require("mongoose");

exports.getDashboardDataByTime = async (req, res) => {
  try {
    const userId = req.user.id;
    const userObjectId = new Types.ObjectId(String(userId));
    
    // Get time range from query params
    const { startDate, endDate } = req.query;
    
    // Validate dates
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        message: "startDate and endDate are required" 
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ 
        message: "Invalid date format. Use ISO 8601 format (e.g., 2025-01-01)" 
      });
    }

    if (start > end) {
      return res.status(400).json({ 
        message: "startDate must be before endDate" 
      });
    }

    // Fetch total income and expenses in the specified time range
    const totalIncome = await Income.aggregate([
      { $match: { userId: userObjectId, date: { $gte: start, $lte: end } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const totalExpense = await Expense.aggregate([
      { $match: { userId: userObjectId, date: { $gte: start, $lte: end } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    // Get income transactions in the specified time range
    const rangeIncomeTransactions = await Income.find({
      userId,
      date: { $gte: start, $lte: end },
    }).sort({ date: -1 });

    // Get total income in time range
    const incomeInRange = rangeIncomeTransactions.reduce(
      (sum, transaction) => sum + transaction.amount,
      0
    );

    // Get expense transactions in the specified time range
    const rangeExpensesTransactions = await Expense.find({
      userId,
      date: { $gte: start, $lte: end },
    }).sort({ date: -1 });

    // Get total expenses in time range
    const expensesInRange = rangeExpensesTransactions.reduce(
      (sum, transaction) => sum + transaction.amount,
      0
    );

    // Fetch 10 last transactions (income + expenses) in time range
    const lastTransactions = [
      ...(await Income.find({ 
        userId,
        date: { $gte: start, $lte: end }
      })
        .sort({ date: -1 })
        .limit(10)
      ).map((txn) => ({
        ...txn.toObject(),
        type: "income",
      })),
      ...(await Expense.find({ 
        userId,
        date: { $gte: start, $lte: end }
      })
        .sort({ date: -1 })
        .limit(10)
      ).map((txn) => ({
        ...txn.toObject(),
        type: "expense",
      })),
    ].sort((a, b) => b.date - a.date); // sort latest first

    // Final response
    res.json({
      totalBalance:
        (totalIncome[0]?.total || 0) - (totalExpense[0]?.total || 0),
      totalIncome: totalIncome[0]?.total || 0,
      totalExpenses: totalExpense[0]?.total || 0,
      timeRange: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
      rangeIncome: {
        total: incomeInRange,
        transactions: rangeIncomeTransactions,
      },
      rangeExpenses: {
        total: expensesInRange,
        transactions: rangeExpensesTransactions,
      },
      recentTransactions: lastTransactions,
    });
  } catch (error) {
    console.error("Dashboard search error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};
