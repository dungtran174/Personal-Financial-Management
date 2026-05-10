const express = require("express");
const {
    addIncome,
    getAllIncome,
    deleteIncome,
    downloadIncomeExcel,
    updateIncome,
    getUniqueSources,
} = require("../controllers/incomeController");
const { getIncomeByTime } = require("../controllers/incomeSearch");

const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/add", protect, addIncome);
router.get("/get", protect, getAllIncome);
router.get("/sources", protect, getUniqueSources);
router.get("/search", protect, getIncomeByTime);
router.get("/downloadexcel", protect, downloadIncomeExcel);
router.put("/:id", protect, updateIncome);
router.delete("/:id", protect, deleteIncome);

module.exports = router;