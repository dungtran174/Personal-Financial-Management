import React, { useState } from 'react';
import { Send, Paperclip, Plus, Settings, Copy, Trash2, X } from 'lucide-react';

const ChatPanel = ({ onClose }) => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      text: 'Xin chào! Tôi có thể giúp gì cho bạn về thị trường tài chính hôm nay?',
      sender: 'bot',
      timestamp: '10:30'
    }
  ]);
  const [input, setInput] = useState('');
  const [model, setModel] = useState('GPT-4');
  const [isTyping, setIsTyping] = useState(false);

  const handleSend = () => {
    if (!input.trim()) return;
    
    const newMessage = {
      id: messages.length + 1,
      text: input,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit'
      })
    };
    
    setMessages([...messages, newMessage]);
    setInput('');
    setIsTyping(true);
    
    setTimeout(() => {
      setIsTyping(false);
      setMessages(prev => [...prev, {
        id: prev.length + 1,
        text: 'Dựa trên dữ liệu thị trường hiện tại, VN-Index đang có xu hướng tích cực...',
        sender: 'bot',
        timestamp: new Date().toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit'
        })
      }]);
    }, 1500);
  };

  return (
    <div className="w-[28rem] bg-white border border-gray-200 rounded-3xl shadow-2xl flex flex-col h-[36rem] max-h-[85vh] overflow-hidden">
      <div className="p-4 border-b border-gray-200 space-y-3">
        <div className="flex items-center justify-between">
          <select 
            value={model} 
            onChange={e => setModel(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#875cf5]"
          >
            <option>GPT-4</option>
            <option>Gemini</option>
            <option>Claude</option>
          </select>
          <div className="flex gap-2">
            <button className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <Plus className="w-5 h-5 text-gray-600" />
            </button>
            <button className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <Settings className="w-5 h-5 text-gray-600" />
            </button>
            {onClose && (
              <button 
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(message => (
          <div 
            key={message.id} 
            className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'} group`}
          >
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
              message.sender === 'user' 
                ? 'bg-[#ece5ff] text-gray-800' 
                : 'bg-white border border-gray-200 text-gray-800'
            }`}>
              <p className="text-sm">{message.text}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-500">{message.timestamp}</span>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                  <button className="text-gray-400 hover:text-gray-600">
                    <Copy className="w-3 h-3" />
                  </button>
                  <button className="text-gray-400 hover:text-red-500">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
        
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-2 border border-gray-200 focus-within:ring-2 focus-within:ring-[#875cf5]">
          <button className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
            <Paperclip className="w-5 h-5 text-gray-500" />
          </button>
          <input 
            type="text" 
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && handleSend()}
            placeholder="Nhập tin nhắn..." 
            className="flex-1 bg-transparent outline-none text-sm" 
          />
          <button 
            onClick={handleSend}
            className="p-2 bg-[#875cf5] hover:bg-[#7049d0] rounded-lg transition-colors"
          >
            <Send className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;
