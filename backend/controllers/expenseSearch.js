const Expense = require("../models/Expense");
const { Types } = require("mongoose");

exports.getExpenseByTime = async (req, res) => {
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

    // Fetch total expense using aggregate
    const totalExpenseResult = await Expense.aggregate([
      { $match: { userId: userObjectId, date: { $gte: start, $lte: end } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    // Get expense transactions in the specified time range
    const expenseTransactions = await Expense.find({
      userId,
      date: { $gte: start, $lte: end },
    }).sort({ date: -1 });

    const totalExpense = totalExpenseResult[0]?.total || 0;

    // Final response
    res.json({
      timeRange: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
      totalExpense,
      count: expenseTransactions.length,
      transactions: expenseTransactions,
    });
  } catch (error) {
    console.error("Expense search error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};
