import React, { useState, useRef, useEffect } from 'react'

const ComboboxInput = ({ value, onChange, label, placeholder, suggestions = [] }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [filteredSuggestions, setFilteredSuggestions] = useState([])
  const containerRef = useRef(null)

  // Filter suggestions based on input value
  useEffect(() => {
    if (isOpen) {
      const filtered = suggestions.filter((suggestion) =>
        suggestion.toLowerCase().includes(value.toLowerCase())
      )
      setFilteredSuggestions(filtered)
    }
  }, [value, suggestions, isOpen])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleInputFocus = () => {
    setIsOpen(true)
  }

  const handleSelectSuggestion = (suggestion) => {
    onChange({ target: { value: suggestion } })
    setIsOpen(false)
  }

  const handleInputChange = (e) => {
    onChange(e)
    if (!isOpen) {
      setIsOpen(true)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="text-[13px] text-slate-800">{label}</label>
      <div className="input-box">
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          className="w-full bg-transparent outline-none"
          autoComplete="off"
        />
      </div>

      {/* Dropdown */}
      {isOpen && filteredSuggestions.length > 0 && (
        <div className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-[200px] overflow-y-auto scroll-thin">
          {filteredSuggestions.map((suggestion, index) => (
            <div
              key={index}
              onClick={() => handleSelectSuggestion(suggestion)}
              className="px-4 py-2.5 text-sm text-slate-700 hover:bg-purple-50 hover:text-purple-600 cursor-pointer transition-colors duration-150 border-b border-slate-100 last:border-b-0"
            >
              {suggestion}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ComboboxInput
