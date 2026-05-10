const xlsx = require('xlsx');

const Income = require("../models/Income");

// add income source
exports.addIncome = async (req, res) => {
    const userId = req.user.id;

    try{
        const { icon, source, amount, date} = req.body;

        // validation: check for missing fields
        if(!source || !amount || !date){
            return res.status(400).json({message: "All fields are required"});
        }

        const newIncome = new Income({
            userId,
            icon,
            source,
            amount,
            date: new Date(date)
        }) ;

        await newIncome.save();
        res.status(200).json(newIncome);
    } catch (error) {
        res.status(500).json({message: "Server Error"});
    }
};

// get all income
exports.getAllIncome = async (req, res) => {
    const userId = req.user.id;

    try{
        const income = await Income.find( {userId} ).sort( {date: -1} );
        res.json(income);
    } catch (error) {
        res.status(500).json({message: "Server Error"});
    }
};

// delete income
exports.deleteIncome = async (req, res) => {
    try{
        await Income.findByIdAndDelete(req.params.id);
        res.json({message: "Income deleted successfully"})
    } catch (error){
        res.status(500).json({message: "Server Error"})
    }
};

// update income
exports.updateIncome = async (req, res) => {
    const userId = req.user.id;
    const incomeId = req.params.id;

    try {
        const { icon, source, amount, date } = req.body;

        // Validation: check for missing fields
        if (!source || !amount || !date) {
            return res.status(400).json({ message: "All fields are required" });
        }

        // Find income and check ownership
        const income = await Income.findById(incomeId);
        if (!income) {
            return res.status(404).json({ message: "Income not found" });
        }

        if (income.userId.toString() !== userId) {
            return res.status(403).json({ message: "Not authorized to update this income" });
        }

        // Update income
        income.icon = icon;
        income.source = source;
        income.amount = amount;
        income.date = new Date(date);

        await income.save();
        res.status(200).json(income);
    } catch (error) {
        console.error("Update income error:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// download income excel
exports.downloadIncomeExcel = async (req, res) => {
    const userId = req.user.id;

    try{
        const income = await Income.find( {userId} ).sort( {date: -1} );
        // prepare date for Excel
        const data = income.map((item) => ({
            Source: item.source,
            Amount: item.amount,
            Date: item.date,
        }));

        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(data);
        xlsx.utils.book_append_sheet(wb, ws, "Income");
        xlsx.writeFile(wb, 'income_details.xlsx');
        res.download('income_details.xlsx');
    } catch (error){
        res.status(500).json({message: "Server Error"})
    }
}

// get unique income sources
exports.getUniqueSources = async (req, res) => {
    const userId = req.user.id;

    try {
        const sources = await Income.distinct('source', { 
            userId,
            source: { $ne: null, $ne: '' } 
        });
        
        // Sort alphabetically and return
        const sortedSources = sources.filter(s => s).sort();
        res.status(200).json(sortedSources);
    } catch (error) {
        console.error("Get unique sources error:", error);
        res.status(500).json({ message: "Server Error" });
    }
};
