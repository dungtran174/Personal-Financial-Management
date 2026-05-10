const xlsx = require('xlsx');

const Expense = require("../models/Expense");


exports.addExpense = async (req, res) => {
    userId = req.user.id

    try{
        const {icon, category, amount, date} = req.body;

        if (!category || ! amount || !date ){
            res.status(400).json({message: "All fields are required"})
        }

        const newExpense = new Expense({
            userId,
            icon,
            category,
            amount,
            date: new Date(date)
        });

        await newExpense.save()
        res.status(200).json(newExpense);
    } catch (error){
        res.status(500).json("Server Error")
    }
}

exports.getAllExpense = async (req, res) => {
    const userId = req.user.id;
    try{
        const expense = await Expense.find( {userId} ).sort( {date: -1} );
        res.status(200).json(expense);
    } catch (error){
        res.status(500).json({message: "Server Error"});
    }
}

exports.deleteExpense = async (req, res) => {
    try{
        const expenseId = req.params.id;
        await Expense.findByIdAndDelete(expenseId);
        res.status(200).json({message: "Expense deleted"});
    } catch (error) {
        res.status(500).json("Server Error");
    }
}

exports.updateExpense = async (req, res) => {
    const userId = req.user.id;
    const expenseId = req.params.id;

    try {
        const { icon, category, amount, date } = req.body;

        // Validation: check for missing fields
        if (!category || !amount || !date) {
            return res.status(400).json({ message: "All fields are required" });
        }

        // Find expense and check ownership
        const expense = await Expense.findById(expenseId);
        if (!expense) {
            return res.status(404).json({ message: "Expense not found" });
        }

        if (expense.userId.toString() !== userId) {
            return res.status(403).json({ message: "Not authorized to update this expense" });
        }

        // Update expense
        expense.icon = icon;
        expense.category = category;
        expense.amount = amount;
        expense.date = new Date(date);

        await expense.save();
        res.status(200).json(expense);
    } catch (error) {
        console.error("Update expense error:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

exports.downloadExpenseExcel = async (req, res) => {
    const userId = req.user.id;

    try{
        const expense = await Expense.find( {userId} ).sort( {date:-1} );
        const data = expense.map((item) => ({
            Category: item.category,
            Amount: item.amount,
            Date: item.date,
        }))

        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(data);
        xlsx.utils.book_append_sheet(wb, ws, "Expense");
        xlsx.writeFile(wb, "Expense_details.xlsx");
        res.download("Expense_details.xlsx");
    }  catch (error) {
        res.status(500).json({message: "Server Error"});
    }
}

// get unique expense categories
exports.getUniqueCategories = async (req, res) => {
    const userId = req.user.id;

    try {
        const categories = await Expense.distinct('category', { 
            userId,
            category: { $ne: null, $ne: '' } 
        });
        
        // Sort alphabetically and return
        const sortedCategories = categories.filter(c => c).sort();
        res.status(200).json(sortedCategories);
    } catch (error) {
        console.error("Get unique categories error:", error);
        res.status(500).json({ message: "Server Error" });
    }
};
