import React, { useState, useEffect, useRef } from 'react';
import { Send, Paperclip, Plus, Settings, Copy, Trash2, Bot, User, Loader2, Wrench, History, Clock } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import toast from 'react-hot-toast';
import {
  createConversation,
  getConversations,
  getConversation,
  sendMessageStream,
  deleteConversation as deleteConv
} from '../services/conversationService';

const ChatPanel = () => {
  // Conversation management
  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  
  // Messages
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [model, setModel] = useState('gemini-2.5-flash');
  
  // UI states
  const [initializing, setInitializing] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [reasoningMessage, setReasoningMessage] = useState('');
  const [currentToolCall, setCurrentToolCall] = useState(null);
  
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when messages change
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, reasoningMessage, currentToolCall]);

  // Initialize session on mount
  useEffect(() => {
    const initializeSession = async () => {
      try {
        const sid = await initSession();
        setSessionId(sid);
        setMessages([
          {
            id: '1',
            content: 'Xin chào! Tôi là trợ lý tài chính AI. Tôi có thể giúp bạn phân tích thị trường, cổ phiếu, và cung cấp thông tin tài chính. Bạn muốn tìm hiểu về điều gì?',
            sender: 'bot',
            timestamp: new Date().toLocaleTimeString('vi-VN', {
              hour: '2-digit',
              minute: '2-digit'
            })
          }
        ]);
      } catch (error) {
        console.error('Failed to initialize session:', error);
        toast.error('Không thể kết nối với AI Agent. Vui lòng kiểm tra server.');
      } finally {
        setInitializing(false);
      }
    };

    initializeSession();
    chatStreamerRef.current = new ChatStreamer();

    return () => {
      if (chatStreamerRef.current) {
        chatStreamerRef.current.cancel();
      }
    };
  }, []);

  const handleSend = async () => {
    if (!input.trim() || !sessionId || isStreaming) return;

    const userMessage = {
      id: String(Date.now()),
      content: input,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit'
      })
    };

    setMessages(prev => [...prev, userMessage]);
    const botMessage = {
      id: String(Date.now() + 1),
      content: '',
      sender: 'bot',
      timestamp: new Date().toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit'
      })
    };
    setMessages(prev => [...prev, botMessage]);
    
    setInput('');
    setIsStreaming(true);
    setReasoningMessage('');
    setCurrentToolCall(null);

    try {
      await chatStreamerRef.current.streamChat(
        sessionId,
        userMessage.content,
        model,
        (event) => {
          switch (event.type) {
            case 'start':
              setReasoningMessage(event.message || 'Đang xử lý yêu cầu...');
              break;

            case 'reasoning':
              setReasoningMessage(event.message || 'Đang phân tích câu hỏi...');
              break;

            case 'tool_call':
              setCurrentToolCall({
                tool: event.tool || '',
                question: event.question || ''
              });
              break;

            case 'tool_complete':
              // Keep showing tool until content arrives
              break;

            case 'content':
              setMessages(prev => {
                const newMessages = [...prev];
                if (newMessages.length > 0) {
                  newMessages[newMessages.length - 1].content = event.content || '';
                }
                return newMessages;
              });
              if (event.content) {
                setCurrentToolCall(null);
                setReasoningMessage('');
              }
              break;

            case 'done':
              setMessages(prev => {
                const newMessages = [...prev];
                if (newMessages.length > 0) {
                  newMessages[newMessages.length - 1].content = event.final_report || '';
                  newMessages[newMessages.length - 1].answered_subquestions = event.answered_subquestions;
                }
                return newMessages;
              });
              setIsStreaming(false);
              setCurrentToolCall(null);
              setReasoningMessage('');
              break;

            case 'error':
              console.error('Stream error:', event.error);
              toast.error(`Lỗi: ${event.error}`);
              setMessages(prev => {
                const newMessages = [...prev];
                if (newMessages.length > 0) {
                  newMessages[newMessages.length - 1].content = `Đã xảy ra lỗi: ${event.error}`;
                }
                return newMessages;
              });
              setIsStreaming(false);
              setCurrentToolCall(null);
              setReasoningMessage('');
              break;
          }
        }
      );
    } catch (error) {
      console.error('Failed to send message:', error);
      toast.error('Không thể gửi tin nhắn. Vui lòng thử lại.');
      setIsStreaming(false);
      setCurrentToolCall(null);
      setReasoningMessage('');
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Đã sao chép!');
  };

  const handleDelete = (id) => {
    setMessages(prev => prev.filter(msg => msg.id !== id));
    toast.success('Đã xóa tin nhắn!');
  };

  const handleNewChat = () => {
    setMessages([
      {
        id: String(Date.now()),
        content: 'Xin chào! Tôi là trợ lý tài chính AI. Tôi có thể giúp bạn phân tích thị trường, cổ phiếu, và cung cấp thông tin tài chính. Bạn muốn tìm hiểu về điều gì?',
        sender: 'bot',
        timestamp: new Date().toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit'
        })
      }
    ]);
    toast.success('Đã tạo cuộc trò chuyện mới!');
  };

  return (
    <div className="w-full bg-white h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 space-y-3">
        <div className="flex items-center justify-between">
          <select 
            value={model} 
            onChange={e => setModel(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#875cf5] disabled:opacity-50"
            disabled={isStreaming || initializing}
          >
            <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
            <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
          </select>
          <div className="flex gap-2">
            <button 
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
              onClick={handleNewChat}
              disabled={isStreaming || initializing}
              title="Cuộc trò chuyện mới"
            >
              <Plus className="w-5 h-5 text-gray-600" />
            </button>
            <button 
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              title="Cài đặt"
            >
              <Settings className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>
      </div>
      
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {initializing ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-[#875cf5] animate-spin mx-auto mb-2" />
              <p className="text-sm text-gray-500">Đang khởi tạo phiên...</p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message, index) => (
              <div 
                key={message.id} 
                className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'} group`}
              >
                {message.sender === 'user' ? (
                  <div className="flex items-start gap-3 flex-row-reverse max-w-[85%]">
                    <div className="w-8 h-8 bg-[#875cf5] rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-white" />
                    </div>
                    <div className="relative">
                      <div className="bg-[#ece5ff] text-gray-800 rounded-2xl px-4 py-3">
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        <span className="text-xs text-gray-500 mt-2 block">{message.timestamp}</span>
                      </div>
                      <div className="absolute top-0 right-full mr-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <button 
                          onClick={() => handleCopy(message.content)}
                          className="p-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm"
                          title="Sao chép"
                        >
                          <Copy className="w-4 h-4 text-gray-600" />
                        </button>
                        <button 
                          onClick={() => handleDelete(message.id)}
                          className="p-1.5 bg-white border border-gray-200 rounded-lg hover:bg-red-50 shadow-sm"
                          title="Xóa"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 max-w-[85%]">
                    <div className="w-8 h-8 bg-gradient-to-br from-[#875cf5] to-[#7049d0] rounded-full flex items-center justify-center flex-shrink-0">
                      <Bot className="w-5 h-5 text-white" />
                    </div>
                    <div className="relative flex-1">
                      {index === messages.length - 1 && isStreaming && !message.content && (reasoningMessage || currentToolCall) ? (
                        <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 space-y-2">
                          {reasoningMessage && (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Loader2 className="w-4 h-4 animate-spin text-[#875cf5]" />
                              <span>{reasoningMessage}</span>
                            </div>
                          )}
                          {currentToolCall && (
                            <div className="flex items-start gap-2 text-sm bg-purple-50 px-3 py-2 rounded-lg">
                              <Wrench className="w-4 h-4 text-[#875cf5] mt-0.5 flex-shrink-0" />
                              <div>
                                <span className="font-semibold text-[#875cf5]">{currentToolCall.tool}</span>
                                {currentToolCall.question && (
                                  <p className="text-gray-600 mt-1">{currentToolCall.question}</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
                          {message.content ? (
                            <>
                              <div className="prose prose-sm max-w-none text-sm text-gray-800">
                                <ReactMarkdown remarkPlugins={[remarkBreaks]}>
                                  {message.content}
                                </ReactMarkdown>
                              </div>
                              <span className="text-xs text-gray-500 mt-2 block">{message.timestamp}</span>
                            </>
                          ) : (
                            <div className="flex gap-1">
                              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                            </div>
                          )}
                        </div>
                      )}
                      {message.content && (
                        <div className="absolute top-0 left-full ml-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                          <button 
                            onClick={() => handleCopy(message.content)}
                            className="p-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm"
                            title="Sao chép"
                          >
                            <Copy className="w-4 h-4 text-gray-600" />
                          </button>
                          <button 
                            onClick={() => handleDelete(message.id)}
                            className="p-1.5 bg-white border border-gray-200 rounded-lg hover:bg-red-50 shadow-sm"
                            title="Xóa"
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>
      
      {/* Input Area */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-2 border border-gray-200 focus-within:ring-2 focus-within:ring-[#875cf5]">
          <button 
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
            disabled={isStreaming || initializing}
            title="Đính kèm file"
          >
            <Paperclip className="w-5 h-5 text-gray-500" />
          </button>
          <input 
            type="text" 
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={
              initializing 
                ? "Đang khởi tạo..." 
                : isStreaming 
                ? "AI đang xử lý..." 
                : "Nhập tin nhắn của bạn..."
            }
            className="flex-1 bg-transparent outline-none text-sm disabled:opacity-50"
            disabled={isStreaming || initializing}
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || isStreaming || initializing}
            className="p-2 bg-[#875cf5] hover:bg-[#7049d0] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isStreaming ? (
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            ) : (
              <Send className="w-5 h-5 text-white" />
            )}
          </button>
        </div>
        <p className="text-xs text-gray-400 text-center mt-2">
          {initializing 
            ? "Đang kết nối với AI Agent..." 
            : "Nhấn Enter để gửi tin nhắn"}
        </p>
      </div>
    </div>
  );
};

export default ChatPanel;