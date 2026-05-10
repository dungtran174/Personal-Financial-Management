/**
 * Conversation Service - Handle all conversation-related API calls
 * Uses backend proxy instead of direct AI agent calls
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

/**
 * Get auth token from localStorage
 */
const getAuthToken = () => {
    const token = localStorage.getItem('token');
    if (!token) {
        throw new Error('No authentication token found. Please login.');
    }
    return token;
};

/**
 * Create headers with authentication
 */
const getAuthHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getAuthToken()}`
});

/**
 * Create a new conversation
 * @param {string} title - Optional conversation title
 * @returns {Promise<Object>} Created conversation object
 */
export const createConversation = async (title = null) => {
    try {
        const response = await fetch(`${API_BASE_URL}/conversations`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ title })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to create conversation');
        }

        const data = await response.json();
        return data.conversation;
    } catch (error) {
        console.error('Create conversation error:', error);
        throw error;
    }
};

/**
 * Get all conversations for current user
 * @param {Object} params - Query parameters
 * @param {string} params.status - 'active' or 'archived'
 * @param {number} params.page - Page number
 * @param {number} params.limit - Items per page
 * @returns {Promise<Object>} { conversations, pagination }
 */
export const getConversations = async ({ status = 'active', page = 1, limit = 20 } = {}) => {
    try {
        const queryParams = new URLSearchParams({ status, page, limit });
        const response = await fetch(`${API_BASE_URL}/conversations?${queryParams}`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            throw new Error('Failed to fetch conversations');
        }

        return await response.json();
    } catch (error) {
        console.error('Get conversations error:', error);
        throw error;
    }
};

/**
 * Get single conversation with messages
 * @param {string} conversationId - Conversation ID
 * @param {number} messageLimit - Max messages to load
 * @returns {Promise<Object>} { conversation, messages }
 */
export const getConversation = async (conversationId, messageLimit = 50) => {
    try {
        const response = await fetch(
            `${API_BASE_URL}/conversations/${conversationId}?messageLimit=${messageLimit}`,
            { headers: getAuthHeaders() }
        );

        if (!response.ok) {
            throw new Error('Failed to fetch conversation');
        }

        return await response.json();
    } catch (error) {
        console.error('Get conversation error:', error);
        throw error;
    }
};

/**
 * Update conversation title
 * @param {string} conversationId - Conversation ID
 * @param {string} title - New title
 * @returns {Promise<Object>} Updated conversation
 */
export const updateConversationTitle = async (conversationId, title) => {
    try {
        const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ title })
        });

        if (!response.ok) {
            throw new Error('Failed to update conversation');
        }

        const data = await response.json();
        return data.conversation;
    } catch (error) {
        console.error('Update conversation error:', error);
        throw error;
    }
};

/**
 * Archive or unarchive conversation
 * @param {string} conversationId - Conversation ID
 * @param {string} status - 'active' or 'archived'
 * @returns {Promise<Object>} Updated conversation
 */
export const archiveConversation = async (conversationId, status = 'archived') => {
    try {
        const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}/archive`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({ status })
        });

        if (!response.ok) {
            throw new Error('Failed to archive conversation');
        }

        const data = await response.json();
        return data.conversation;
    } catch (error) {
        console.error('Archive conversation error:', error);
        throw error;
    }
};

/**
 * Delete conversation
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<void>}
 */
export const deleteConversation = async (conversationId) => {
    try {
        const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            throw new Error('Failed to delete conversation');
        }
    } catch (error) {
        console.error('Delete conversation error:', error);
        throw error;
    }
};

/**
 * Send message (non-streaming)
 * @param {string} conversationId - Conversation ID
 * @param {string} content - Message content
 * @param {string} model - AI model to use
 * @returns {Promise<Object>} { userMessage, assistantMessage, conversation }
 */
export const sendMessage = async (conversationId, content, model = 'gemini-2.5-flash') => {
    try {
        const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}/messages`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ content, model })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to send message');
        }

        return await response.json();
    } catch (error) {
        console.error('Send message error:', error);
        throw error;
    }
};

/**
 * Send message with streaming (SSE)
 * @param {string} conversationId - Conversation ID
 * @param {string} content - Message content
 * @param {string} model - AI model to use
 * @param {Function} onEvent - Callback for each SSE event
 * @returns {Promise<void>}
 */
export const sendMessageStream = async (conversationId, content, model, onEvent) => {
    try {
        const response = await fetch(
            `${API_BASE_URL}/conversations/${conversationId}/messages/stream`,
            {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ content, model })
            }
        );

        if (!response.ok) {
            throw new Error('Failed to start streaming');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });

            // Process complete events from buffer
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data.trim()) {
                        try {
                            const event = JSON.parse(data);
                            onEvent(event);
                        } catch (e) {
                            console.error('Failed to parse event:', e, data);
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('Stream message error:', error);
        onEvent({
            type: 'error',
            error: error.message
        });
    }
};

/**
 * Get messages for conversation (with pagination)
 * @param {string} conversationId - Conversation ID
 * @param {number} limit - Max messages to load
 * @param {string} before - Message ID to load before (for pagination)
 * @returns {Promise<Object>} { messages, hasMore }
 */
export const getMessages = async (conversationId, limit = 50, before = null) => {
    try {
        const params = new URLSearchParams({ limit });
        if (before) params.append('before', before);

        const response = await fetch(
            `${API_BASE_URL}/conversations/${conversationId}/messages?${params}`,
            { headers: getAuthHeaders() }
        );

        if (!response.ok) {
            throw new Error('Failed to fetch messages');
        }

        return await response.json();
    } catch (error) {
        console.error('Get messages error:', error);
        throw error;
    }
};

/**
 * Delete a message
 * @param {string} conversationId - Conversation ID
 * @param {string} messageId - Message ID
 * @returns {Promise<void>}
 */
export const deleteMessage = async (conversationId, messageId) => {
    try {
        const response = await fetch(
            `${API_BASE_URL}/conversations/${conversationId}/messages/${messageId}`,
            {
                method: 'DELETE',
                headers: getAuthHeaders()
            }
        );

        if (!response.ok) {
            throw new Error('Failed to delete message');
        }
    } catch (error) {
        console.error('Delete message error:', error);
        throw error;
    }
};