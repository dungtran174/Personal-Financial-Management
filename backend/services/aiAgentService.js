const axios = require('axios');

// AI Agent (FastAPI) runs on port 8008, not 8000
const AI_AGENT_BASE_URL = process.env.AI_AGENT_URL || 'http://localhost:8008';

class AIAgentService {
    constructor() {
        this.sessions = new Map(); // In-memory session cache
    }

    /**
     * Initialize a new AI agent session
     */
    async initSession() {
        try {
            const response = await axios.post(`${AI_AGENT_BASE_URL}/api/init`, {});
            const sessionId = response.data.session_id;
            this.sessions.set(sessionId, {
                initialized: new Date(),
                lastActivity: new Date()
            });
            return sessionId;
        } catch (error) {
            console.error('Failed to initialize AI agent session:', error.message);
            throw new Error('Could not connect to AI Agent');
        }
    }

    /**
     * Send message to AI agent (non-streaming)
     */
    async sendMessage(sessionId, message, model = 'gemini-2.5-flash', token = null) {
        try {
            const response = await axios.post(`${AI_AGENT_BASE_URL}/api/chat`, {
                session_id: sessionId,
                message: message,
                model: model,
                token: token
            });

            // Update last activity
            if (this.sessions.has(sessionId)) {
                this.sessions.get(sessionId).lastActivity = new Date();
            }

            return response.data;
        } catch (error) {
            console.error('Failed to send message to AI agent:', error.message);
            throw new Error('AI Agent request failed');
        }
    }

    /**
     * Stream message to AI agent
     * Returns axios response for streaming
     */
    async streamMessage(sessionId, message, model = 'gemini-2.5-flash', token = null) {
        try {
            const response = await axios.post(
                `${AI_AGENT_BASE_URL}/api/chat/stream`,
                {
                    session_id: sessionId,
                    message: message,
                    model: model,
                    token: token
                },
                {
                    responseType: 'stream'
                }
            );

            // Update last activity
            if (this.sessions.has(sessionId)) {
                this.sessions.get(sessionId).lastActivity = new Date();
            }

            return response;
        } catch (error) {
            console.error('Failed to stream message from AI agent:', error.message);
            throw new Error('AI Agent streaming failed');
        }
    }

    /**
     * Get session history from AI agent
     */
    async getSessionHistory(sessionId) {
        try {
            const response = await axios.get(
                `${AI_AGENT_BASE_URL}/api/session/${sessionId}/history`
            );
            return response.data;
        } catch (error) {
            console.error('Failed to get session history:', error.message);
            return null;
        }
    }

    /**
     * Clear AI agent session history (working memory)
     */
    async clearSessionHistory(sessionId) {
        try {
            await axios.delete(
                `${AI_AGENT_BASE_URL}/api/session/${sessionId}/history`
            );
            return true;
        } catch (error) {
            console.error('Failed to clear session history:', error.message);
            return false;
        }
    }

    /**
     * Delete AI agent session
     */
    async deleteSession(sessionId) {
        try {
            await axios.delete(`${AI_AGENT_BASE_URL}/api/session/${sessionId}`);
            this.sessions.delete(sessionId);
            return true;
        } catch (error) {
            console.error('Failed to delete AI agent session:', error.message);
            return false;
        }
    }

    /**
     * Health check for AI agent
     */
    async checkHealth() {
        try {
            const response = await axios.get(`${AI_AGENT_BASE_URL}/api/health`);
            return response.data;
        } catch (error) {
            return { status: 'unhealthy', error: error.message };
        }
    }

    /**
     * Clean up old sessions (call periodically)
     */
    cleanupOldSessions(maxAgeHours = 24) {
        const now = new Date();
        const maxAge = maxAgeHours * 60 * 60 * 1000;

        for (const [sessionId, sessionData] of this.sessions.entries()) {
            if (now - sessionData.lastActivity > maxAge) {
                this.deleteSession(sessionId);
            }
        }
    }
}

// Singleton instance
const aiAgentService = new AIAgentService();

// Cleanup old sessions every hour
setInterval(() => {
    aiAgentService.cleanupOldSessions(24);
}, 60 * 60 * 1000);

module.exports = aiAgentService;