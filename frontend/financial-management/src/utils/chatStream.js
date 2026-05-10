// API Base URL - can be configured via environment variable
const API_BASE_URL = import.meta.env.VITE_AI_AGENT_URL || 'http://localhost:8000';

export const initSession = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(`Failed to initialize session: ${response.status}`);
    }

    const data = await response.json();
    return data.session_id;
  } catch (error) {
    console.error('Failed to initialize session:', error);
    throw error;
  }
};

export class ChatStreamer {
  constructor() {
    this.controller = null;
  }

  async streamChat(sessionId, message, model, onEvent) {
    // Cancel any existing stream
    this.cancel();

    this.controller = new AbortController();

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId,
          message: message,
          model: model,
        }),
        signal: this.controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

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
      if (error.name === 'AbortError') {
        console.log('Stream cancelled');
      } else {
        onEvent({
          type: 'error',
          error: error.message,
        });
      }
    }
  }

  cancel() {
    if (this.controller) {
      this.controller.abort();
      this.controller = null;
    }
  }
}

// Non-streaming chat API (fallback)
export const sendMessage = async (sessionId, message, model) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionId,
        message: message,
        model: model,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to send message:', error);
    throw error;
  }
};

// Get session history
export const getSessionHistory = async (sessionId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/session/${sessionId}/history`);
    
    if (!response.ok) {
      throw new Error(`Failed to get history: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to get history:', error);
    throw error;
  }
};

// Clear conversation history
export const clearHistory = async (sessionId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/session/${sessionId}/history`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      throw new Error(`Failed to clear history: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to clear history:', error);
    throw error;
  }
};

// Delete session
export const deleteSession = async (sessionId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/session/${sessionId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      throw new Error(`Failed to delete session: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to delete session:', error);
    throw error;
  }
};

// Health check
export const checkHealth = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`);
    
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Health check failed:', error);
    throw error;
  }
};