import React, { useState, useEffect } from 'react'
import Input from '../Inputs/Input'
import EmojiPickerPopup from '../EmojiPickerPopup'

const EditIncomeForm = ({incomeData, onUpdateIncome}) => {
    const [income, setIncome] = useState({
        source: "",
        amount: "",
        date: "",
        icon: "",
    })

    useEffect(() => {
        if (incomeData) {
            setIncome({
                source: incomeData.source || "",
                amount: incomeData.amount || "",
                date: incomeData.date ? new Date(incomeData.date).toISOString().split('T')[0] : "",
                icon: incomeData.icon || "",
            })
        }
    }, [incomeData])

    const handleChange = (key, value) => setIncome({...income, [key]: value})
    
    return (
        <div>
            <EmojiPickerPopup
                icon = {income.icon}
                onSelect={(selectedIcon) => handleChange("icon", selectedIcon)}
            />

            <Input
                value={income.source}
                onChange={({target}) => handleChange("source", target.value)}
                label="Nguồn thu nhập"
                placeholder="Freelance, Lương, v.v."
                type="text"
            />

            <Input 
                value={income.amount}
                onChange={({target}) => handleChange("amount", target.value)}
                label="Số tiền"
                placeholder=""
                type="number"
            />

            <Input
                value={income.date}
                onChange={({target}) => handleChange("date", target.value)}
                label="Ngày"
                placeholder=""
                type="date"
            />

            <div className='flex justify-end mt-6'>
                <button
                    type="button"
                    className = "add-btn add-btn-fill"
                    onClick={()=>onUpdateIncome(income)}
                >
                    Hoàn tất chỉnh sửa
                </button>
            </div>
        </div>
    )
}

export default EditIncomeForm
