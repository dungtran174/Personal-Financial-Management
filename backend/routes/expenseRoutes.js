const express = require("express");
const {
    addExpense,
    getAllExpense,
    deleteExpense,
    downloadExpenseExcel,
    updateExpense,
    getUniqueCategories,
} = require("../controllers/expenseController");
const { getExpenseByTime } = require("../controllers/expenseSearch");

const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/add", protect, addExpense);
router.get("/get", protect, getAllExpense);
router.get("/categories", protect, getUniqueCategories);
router.get("/search", protect, getExpenseByTime);
router.get("/downloadexcel", protect, downloadExpenseExcel);
router.put("/:id", protect, updateExpense);
router.delete("/:id", protect, deleteExpense);

module.exports = router;