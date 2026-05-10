import React, { useState, useEffect } from 'react'
import Input from '../Inputs/Input'
import EmojiPickerPopup from '../EmojiPickerPopup'

const EditExpenseForm = ({expenseData, onUpdateExpense}) => {
    const [expense, setExpense] = useState({
        category: "",
        amount: "",
        date: "",
        icon: "",
    })

    useEffect(() => {
        if (expenseData) {
            setExpense({
                category: expenseData.category || "",
                amount: expenseData.amount || "",
                date: expenseData.date ? new Date(expenseData.date).toISOString().split('T')[0] : "",
                icon: expenseData.icon || "",
            })
        }
    }, [expenseData])

    const handleChange = (key, value) => setExpense({...expense, [key]: value})
    
    return (
        <div>
            <EmojiPickerPopup
                icon = {expense.icon}
                onSelect={(selectedIcon) => handleChange("icon", selectedIcon)}
            />

            <Input
                value={expense.category}
                onChange={({target}) => handleChange("category", target.value)}
                label="Danh mục chi tiêu"
                placeholder="Ăn uống, Quần áo, v.v."
                type="text"
            />

            <Input 
                value={expense.amount}
                onChange={({target}) => handleChange("amount", target.value)}
                label="Số tiền"
                placeholder=""
                type="number"
            />

            <Input
                value={expense.date}
                onChange={({target}) => handleChange("date", target.value)}
                label="Ngày"
                placeholder=""
                type="date"
            />

            <div className='flex justify-end mt-6'>
                <button
                    type="button"
                    className = "add-btn add-btn-fill"
                    onClick={()=>onUpdateExpense(expense)}
                >
                    Hoàn tất chỉnh sửa
                </button>
            </div>
        </div>
    )
}

export default EditExpenseForm
