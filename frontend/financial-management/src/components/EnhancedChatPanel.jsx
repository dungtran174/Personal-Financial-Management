import React, { useState, useEffect, useRef } from 'react';
import { Send, Plus, Copy, Trash2, Bot, User, Loader2, Wrench, Clock, X, Archive, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import toast from 'react-hot-toast';
import {
  createConversation,
  getConversations,
  getConversation,
  sendMessageStream,
  deleteConversation as deleteConv,
  archiveConversation
} from '../services/conversationService';

const EnhancedChatPanel = () => {
  // Conversation management
  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  
  // Messages
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [model, setModel] = useState('google/gemini-2.5-flash');
  
  // UI states
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [reasoningMessage, setReasoningMessage] = useState('');
  const [currentToolCall, setCurrentToolCall] = useState(null);
  
  const messagesEndRef = useRef(null);

  // Auto-scroll
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, reasoningMessage, currentToolCall]);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      setLoadingConversations(true);
      const data = await getConversations({ status: 'active', limit: 20 });
      setConversations(data.conversations || []);
    } catch (error) {
      console.error('Failed to load conversations:', error);
      // Don't show error toast on initial load if not logged in
    } finally {
      setLoadingConversations(false);
    }
  };

  const handleCreateConversation = async () => {
    try {
      const conversation = await createConversation();
      setConversations(prev => [conversation, ...prev]);
      await loadConversationMessages(conversation._id);
      setShowHistory(false);
      toast.success('Tạo cuộc trò chuyện mới!');
    } catch (error) {
      console.error('Failed to create conversation:', error);
      toast.error('Không thể tạo cuộc trò chuyện. Vui lòng đăng nhập.');
    }
  };

  const loadConversationMessages = async (conversationId) => {
    try {
      const data = await getConversation(conversationId, 50);
      setCurrentConversation(data.conversation);
      setMessages(data.messages || []);
    } catch (error) {
      console.error('Failed to load conversation:', error);
      toast.error('Không thể tải cuộc trò chuyện');
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isStreaming) return;

    if (!currentConversation) {
      toast.error('Vui lòng tạo cuộc trò chuyện mới trước');
      return;
    }

    const userMessage = {
      _id: 'temp-user-' + Date.now(),
      role: 'user',
      content: input.trim(),
      createdAt: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    
    const assistantPlaceholder = {
      _id: 'temp-assistant-' + Date.now(),
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString()
    };
    setMessages(prev => [...prev, assistantPlaceholder]);
    
    const messageContent = input;
    setInput('');
    setIsStreaming(true);
    setReasoningMessage('');
    setCurrentToolCall(null);

    try {
      await sendMessageStream(
        currentConversation._id,
        messageContent,
        model,
        (event) => {
          switch (event.type) {
            case 'user_message_saved':
              setMessages(prev => prev.map(msg =>
                msg._id === userMessage._id
                  ? { ...msg, _id: event.message_id }
                  : msg
              ));
              break;

            case 'start':
              setReasoningMessage(event.message || 'Đang xử lý...');
              break;

            case 'reasoning':
              setReasoningMessage(event.message || 'Đang phân tích...');
              break;

            case 'tool_call':
              setCurrentToolCall({
                tool: event.tool || '',
                question: event.question || ''
              });
              break;

            case 'tool_complete':
              break;

            case 'content':
              setMessages(prev => {
                const newMessages = [...prev];
                const lastIndex = newMessages.length - 1;
                if (newMessages[lastIndex]?.role === 'assistant') {
                  newMessages[lastIndex].content = event.content || '';
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
                const lastIndex = newMessages.length - 1;
                if (newMessages[lastIndex]?.role === 'assistant') {
                  newMessages[lastIndex].content = event.final_report || '';
                }
                return newMessages;
              });
              setIsStreaming(false);
              setCurrentToolCall(null);
              setReasoningMessage('');
              
              if (event.conversation) {
                setCurrentConversation(prev => ({
                  ...prev,
                  ...event.conversation
                }));
                // Refresh conversations list
                loadConversations();
              }
              break;

            case 'saved':
              setMessages(prev => {
                const newMessages = [...prev];
                const lastIndex = newMessages.length - 1;
                if (newMessages[lastIndex]?._id?.startsWith('temp-')) {
                  newMessages[lastIndex]._id = event.message_id;
                }
                return newMessages;
              });
              break;

            case 'error':
              console.error('Stream error:', event.error);
              toast.error(`Lỗi: ${event.error}`);
              setMessages(prev => {
                const newMessages = [...prev];
                const lastIndex = newMessages.length - 1;
                if (newMessages[lastIndex]?.role === 'assistant') {
                  newMessages[lastIndex].content = `Đã xảy ra lỗi: ${event.error}`;
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
      toast.error('Không thể gửi tin nhắn');
      setIsStreaming(false);
      setCurrentToolCall(null);
      setReasoningMessage('');
    }
  };

  const handleDeleteConversation = async (conversationId, e) => {
    e.stopPropagation();
    
    if (!confirm('Bạn có chắc muốn xóa cuộc trò chuyện này?')) return;

    try {
      await deleteConv(conversationId);
      setConversations(prev => prev.filter(c => c._id !== conversationId));
      if (currentConversation?._id === conversationId) {
        setCurrentConversation(null);
        setMessages([]);
      }
      toast.success('Đã xóa cuộc trò chuyện');
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      toast.error('Không thể xóa cuộc trò chuyện');
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Đã sao chép!');
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays < 7) return `${diffDays} ngày trước`;
    return date.toLocaleDateString('vi-VN');
  };

  return (
    <div className="fixed bottom-6 right-6 w-full sm:w-[500px] md:w-[550px] lg:w-[600px] h-[85vh] sm:h-[650px] md:h-[700px] bg-white rounded-2xl shadow-2xl border-2 border-[#875cf5] flex flex-col z-50 max-w-[calc(100vw-3rem)]">
      {/* Header */}
      <div className="p-3 sm:p-4 border-b border-gray-200 bg-gradient-to-r from-[#875cf5] to-[#7049d0] rounded-t-2xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <select 
              value={model} 
              onChange={e => setModel(e.target.value)}
              className="px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg border-0 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-white/50 disabled:opacity-50 bg-white/90 text-gray-800 truncate"
              disabled={isStreaming}
            >
              <option value="google/gemini-2.5-flash">Gemini Flash</option>
              <option value="google/gemini-2.5-pro">Gemini Pro</option>
            </select>
            {currentConversation && (
              <span className="text-xs sm:text-sm text-white/90 truncate hidden sm:inline-block max-w-[150px] md:max-w-[200px]">
                {currentConversation.title}
              </span>
            )}
          </div>
          <div className="flex gap-1 sm:gap-2 flex-shrink-0">
            <button 
              className="p-1.5 sm:p-2 rounded-lg hover:bg-white/20 transition-colors relative"
              onClick={() => setShowHistory(!showHistory)}
              title="Lịch sử chat"
            >
              <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              {conversations.length > 0 && (
                <span className="absolute -top-1 -right-1 w-3 h-3 sm:w-4 sm:h-4 bg-red-500 text-white text-[10px] sm:text-xs rounded-full flex items-center justify-center">
                  {conversations.length > 9 ? '9+' : conversations.length}
                </span>
              )}
            </button>
            <button 
              className="p-1.5 sm:p-2 rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50"
              onClick={handleCreateConversation}
              disabled={isStreaming}
              title="Cuộc trò chuyện mới"
            >
              <Plus className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* History Sidebar */}
      {showHistory && (
        <div className="absolute top-16 sm:top-20 right-2 sm:right-4 w-[calc(100vw-4rem)] sm:w-80 max-h-[60vh] sm:max-h-[500px] bg-white rounded-lg shadow-xl border-2 border-[#875cf5] z-50 flex flex-col">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#875cf5]" />
              <h3 className="font-semibold">Lịch sử chat</h3>
            </div>
            <div className="flex gap-1">
              <button
                onClick={loadConversations}
                className="p-1 hover:bg-gray-100 rounded"
                title="Làm mới"
              >
                <RefreshCw className={`w-4 h-4 ${loadingConversations ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setShowHistory(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2">
            {loadingConversations ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-[#875cf5]" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p className="text-sm">Chưa có cuộc trò chuyện nào</p>
              </div>
            ) : (
              conversations.map(conv => (
                <div
                  key={conv._id}
                  onClick={() => {
                    loadConversationMessages(conv._id);
                    setShowHistory(false);
                  }}
                  className={`p-3 mb-2 rounded-lg cursor-pointer group hover:bg-gray-50 ${
                    currentConversation?._id === conv._id ? 'bg-purple-50 border border-[#875cf5]' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm truncate">{conv.title}</h4>
                      <p className="text-xs text-gray-500 truncate mt-1">
                        {conv.last_message_preview}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-gray-400">
                          {conv.message_count} tin nhắn
                        </span>
                        <span className="text-xs text-gray-400">•</span>
                        <span className="text-xs text-gray-400">
                          {formatTime(conv.updatedAt)}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDeleteConversation(conv._id, e)}
                      className="ml-2 p-1 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded transition-opacity"
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4 bg-gradient-to-b from-gray-50 to-white">
        {!currentConversation ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <Bot className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 mb-3 sm:mb-4" />
            <h3 className="text-base sm:text-lg font-semibold text-gray-700 mb-2">
              Chào mừng đến với Trợ lý Tài chính AI
            </h3>
            <p className="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4 max-w-md">
              Tạo cuộc trò chuyện mới hoặc chọn từ lịch sử để bắt đầu phân tích thị trường, cổ phiếu và nhận thông tin tài chính.
            </p>
            <button
              onClick={handleCreateConversation}
              className="px-4 sm:px-6 py-2 sm:py-3 bg-[#875cf5] text-white rounded-lg hover:bg-[#7049d0] flex items-center gap-2 text-sm sm:text-base shadow-lg"
            >
              <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
              Tạo cuộc trò chuyện mới
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 text-[#875cf5] animate-spin" />
          </div>
        ) : (
          <>
            {messages.map((message, index) => (
              <div 
                key={message._id} 
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} group`}
              >
                {message.role === 'user' ? (
                  <div className="flex items-start gap-3 flex-row-reverse max-w-[85%]">
                    <div className="w-8 h-8 bg-[#875cf5] rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-white" />
                    </div>
                    <div className="relative">
                      <div className="bg-[#ece5ff] text-gray-800 rounded-2xl px-4 py-3">
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        <span className="text-xs text-gray-500 mt-2 block">
                          {formatTime(message.createdAt)}
                        </span>
                      </div>
                      <div className="absolute top-0 right-full mr-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <button 
                          onClick={() => handleCopy(message.content)}
                          className="p-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm"
                          title="Sao chép"
                        >
                          <Copy className="w-4 h-4 text-gray-600" />
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
                              <span className="text-xs text-gray-500 mt-2 block">
                                {formatTime(message.createdAt)}
                              </span>
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
      <div className="p-3 sm:p-4 border-t-2 border-[#875cf5]/20 bg-white rounded-b-2xl">
        <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-2 border-2 border-gray-200 focus-within:ring-2 focus-within:ring-[#875cf5] focus-within:border-[#875cf5]">
          <input 
            type="text" 
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyPress={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder={
              !currentConversation
                ? "Tạo cuộc trò chuyện mới để bắt đầu..."
                : isStreaming 
                ? "AI đang xử lý..." 
                : "Nhập tin nhắn của bạn..."
            }
            className="flex-1 bg-transparent outline-none text-xs sm:text-sm disabled:opacity-50 placeholder:text-xs sm:placeholder:text-sm"
            disabled={isStreaming || !currentConversation}
          />
          <button 
            onClick={handleSendMessage}
            disabled={!input.trim() || isStreaming || !currentConversation}
            className="p-1.5 sm:p-2 bg-[#875cf5] hover:bg-[#7049d0] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
          >
            {isStreaming ? (
              <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 text-white animate-spin" />
            ) : (
              <Send className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            )}
          </button>
        </div>
        <p className="text-[10px] sm:text-xs text-gray-400 text-center mt-2">
          {!currentConversation 
            ? "Tạo hoặc chọn cuộc trò chuyện để bắt đầu"
            : "Nhấn Enter để gửi tin nhắn"}
        </p>
      </div>
    </div>
  );
};

export default EnhancedChatPanel;