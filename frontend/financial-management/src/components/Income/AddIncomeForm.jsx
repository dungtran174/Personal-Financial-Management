import React, { useState } from 'react'
import Input from '../Inputs/Input'
import ComboboxInput from '../Inputs/ComboboxInput'
import EmojiPickerPopup from '../EmojiPickerPopup'

const AddIncomeForm = ({onAddIncome, incomeSources = []}) => {
    const today = new Date().toISOString().split('T')[0]; // Lấy ngày hôm nay theo định dạng YYYY-MM-DD
    
    const [income, setIncome] = useState({
        source: "",
        amount: "",
        date: today,
        icon: "",
    })

    const handleChange = (key, value) => setIncome({...income, [key]: value})
  return (
    <div>
      <EmojiPickerPopup
        icon = {income.icon}
        onSelect={(selectedIcon) => handleChange("icon", selectedIcon)}
      />

      <ComboboxInput
        value={income.source}
        onChange={({target}) => handleChange("source", target.value)}
        label="Income Source"
        placeholder="Lương, kinh doanh,..."
        suggestions={incomeSources}
      />

      <Input 
        value={income.amount}
        onChange={({target}) => handleChange("amount", target.value)}
        label="Amount"
        placeholder="Nhập số tiền"
        type="text"
      />

      <Input
        value={income.date}
        onChange={({target}) => handleChange("date", target.value)}
        label="Date"
        placeholder=""
        type="date"
      />

      <div className='flex justify-end mt-6'>
        <button
          type="button"
          className = "add-btn add-btn-fill"
          onClick={()=>onAddIncome(income)}
        >
          Add Income
        </button>
      </div>
    </div>
  )
}

export default AddIncomeForm
