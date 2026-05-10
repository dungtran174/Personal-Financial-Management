const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const aiAgentService = require('../services/aiAgentService');

/**
 * @desc    Send message to AI agent (non-streaming)
 * @route   POST /api/v1/conversations/:id/messages
 * @access  Private
 */
exports.sendMessage = async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const { content, model = 'gemini-2.5-flash' } = req.body;
        const userId = req.user._id;

        // Validate message content
        if (!content || content.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Message content is required'
            });
        }

        // Find and verify conversation ownership
        const conversation = await Conversation.findOne({
            _id: conversationId,
            user_id: userId
        });

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found'
            });
        }

        // Check if we need to initialize AI agent session
        if (!conversation.agent_session_id) {
            conversation.agent_session_id = await aiAgentService.initSession();
            await conversation.save();
        }

        // Save user message to DB
        const userMessage = await Message.create({
            conversation_id: conversationId,
            role: 'user',
            content: content.trim()
        });

        // Get recent messages for context (short-term memory)
        const recentMessages = await Message.getRecentMessages(conversationId, 20);

        // Get token from header
        const token = req.headers.authorization?.split(" ")[1];

        // Send to AI agent
        const startTime = Date.now();
        let aiResponse;
        
        try {
            aiResponse = await aiAgentService.sendMessage(
                conversation.agent_session_id,
                content.trim(),
                model,
                token
            );
        } catch (error) {
            // Save error message
            const errorMessage = await Message.create({
                conversation_id: conversationId,
                role: 'assistant',
                content: 'Xin lỗi, tôi đang gặp sự cố khi xử lý yêu cầu của bạn. Vui lòng thử lại sau.',
                error: error.message
            });

            conversation.message_count += 2;
            conversation.last_message_preview = errorMessage.content.substring(0, 100);
            await conversation.save();

            return res.status(500).json({
                success: false,
                message: 'AI agent error',
                error: error.message,
                userMessage,
                assistantMessage: errorMessage
            });
        }

        const responseTime = Date.now() - startTime;

        // Save assistant response
        const assistantMessage = await Message.create({
            conversation_id: conversationId,
            role: 'assistant',
            content: aiResponse.report || 'No response',
            metadata: {
                answered_subquestions: aiResponse.answered_subquestions || [],
                model: model,
                response_time: responseTime
            }
        });

        // Update conversation
        conversation.message_count += 2; // user + assistant
        conversation.last_message_preview = assistantMessage.content.substring(0, 100);
        conversation.updatedAt = new Date();
        await conversation.save();

        // Auto-generate title from first message if still default
        if (conversation.message_count <= 2 && conversation.title === 'New Conversation') {
            const title = content.trim().substring(0, 50) + (content.length > 50 ? '...' : '');
            conversation.title = title;
            await conversation.save();
        }

        res.json({
            success: true,
            userMessage,
            assistantMessage,
            conversation: {
                _id: conversation._id,
                title: conversation.title,
                message_count: conversation.message_count
            }
        });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send message',
            error: error.message
        });
    }
};

/**
 * @desc    Stream message to AI agent (SSE)
 * @route   POST /api/v1/conversations/:id/messages/stream
 * @access  Private
 */
exports.streamMessage = async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const { content, model = 'gemini-2.5-flash' } = req.body;
        const userId = req.user._id;

        // Validate message content
        if (!content || content.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Message content is required'
            });
        }

        // Find and verify conversation ownership
        const conversation = await Conversation.findOne({
            _id: conversationId,
            user_id: userId
        });

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found'
            });
        }

        // Check if we need to initialize AI agent session
        if (!conversation.agent_session_id) {
            conversation.agent_session_id = await aiAgentService.initSession();
            await conversation.save();
        }

        // Save user message to DB
        const userMessage = await Message.create({
            conversation_id: conversationId,
            role: 'user',
            content: content.trim()
        });

        // Set up SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering

        // Send initial event with user message ID
        res.write(`data: ${JSON.stringify({
            type: 'user_message_saved',
            message_id: userMessage._id
        })}\n\n`);

        let fullResponse = '';
        let toolsUsed = [];
        let answeredSubquestions = [];
        const startTime = Date.now();

        // Get token from header
        const token = req.headers.authorization?.split(" ")[1];

        try {
            // Get streaming response from AI agent
            const streamResponse = await aiAgentService.streamMessage(
                conversation.agent_session_id,
                content.trim(),
                model,
                token
            );

            // Pipe the stream
            streamResponse.data.on('data', (chunk) => {
                const chunkStr = chunk.toString();
                
                // Parse SSE events
                const lines = chunkStr.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            
                            // Track tools and subquestions
                            if (data.type === 'tool_call' && data.tool) {
                                toolsUsed.push(data.tool);
                            }
                            
                            if (data.type === 'done' && data.final_report) {
                                fullResponse = data.final_report;
                                answeredSubquestions = data.answered_subquestions || [];
                            }
                            
                            // Forward event to client
                            res.write(`data: ${JSON.stringify(data)}\n\n`);
                        } catch (e) {
                            // Not valid JSON, skip
                        }
                    }
                }
            });

            streamResponse.data.on('end', async () => {
                const responseTime = Date.now() - startTime;

                // Save assistant message to DB
                const assistantMessage = await Message.create({
                    conversation_id: conversationId,
                    role: 'assistant',
                    content: fullResponse || 'No response',
                    metadata: {
                        tools_used: toolsUsed.map(tool => ({ tool_name: tool })),
                        answered_subquestions: answeredSubquestions,
                        model: model,
                        response_time: responseTime
                    }
                });

                // Update conversation
                conversation.message_count += 2;
                conversation.last_message_preview = fullResponse.substring(0, 100);
                conversation.updatedAt = new Date();
                await conversation.save();

                // Auto-generate title from first message if still default
                if (conversation.message_count <= 2 && conversation.title === 'New Conversation') {
                    const title = content.trim().substring(0, 50) + (content.length > 50 ? '...' : '');
                    conversation.title = title;
                    await conversation.save();
                }

                // Send final completion event
                res.write(`data: ${JSON.stringify({
                    type: 'saved',
                    message_id: assistantMessage._id,
                    conversation: {
                        _id: conversation._id,
                        title: conversation.title,
                        message_count: conversation.message_count
                    }
                })}\n\n`);

                res.end();
            });

            streamResponse.data.on('error', (error) => {
                console.error('Stream error:', error);
                res.write(`data: ${JSON.stringify({
                    type: 'error',
                    error: error.message
                })}\n\n`);
                res.end();
            });

        } catch (error) {
            console.error('Streaming error:', error);
            
            // Save error message
            const errorMessage = await Message.create({
                conversation_id: conversationId,
                role: 'assistant',
                content: 'Xin lỗi, tôi đang gặp sự cố khi xử lý yêu cầu của bạn. Vui lòng thử lại sau.',
                error: error.message
            });

            conversation.message_count += 2;
            conversation.last_message_preview = errorMessage.content.substring(0, 100);
            await conversation.save();

            res.write(`data: ${JSON.stringify({
                type: 'error',
                error: error.message,
                message_id: errorMessage._id
            })}\n\n`);
            
            res.end();
        }
    } catch (error) {
        console.error('Stream message error:', error);
        
        // If headers not sent yet
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: 'Failed to stream message',
                error: error.message
            });
        } else {
            res.end();
        }
    }
};

/**
 * @desc    Get messages for a conversation (with pagination)
 * @route   GET /api/v1/conversations/:id/messages
 * @access  Private
 */
exports.getMessages = async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const { limit = 50, before } = req.query;
        const userId = req.user._id;

        // Verify conversation ownership
        const conversation = await Conversation.findOne({
            _id: conversationId,
            user_id: userId
        });

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found'
            });
        }

        // Build query
        const query = { conversation_id: conversationId };
        if (before) {
            // Load messages before a certain message ID (for pagination)
            const beforeMessage = await Message.findById(before);
            if (beforeMessage) {
                query.createdAt = { $lt: beforeMessage.createdAt };
            }
        }

        // Get messages
        const messages = await Message.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .select('role content metadata createdAt');

        // Reverse for chronological order
        messages.reverse();

        res.json({
            success: true,
            messages,
            hasMore: messages.length === parseInt(limit)
        });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch messages',
            error: error.message
        });
    }
};

/**
 * @desc    Delete a message
 * @route   DELETE /api/v1/conversations/:id/messages/:messageId
 * @access  Private
 */
exports.deleteMessage = async (req, res) => {
    try {
        const { id: conversationId, messageId } = req.params;
        const userId = req.user._id;

        // Verify conversation ownership
        const conversation = await Conversation.findOne({
            _id: conversationId,
            user_id: userId
        });

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found'
            });
        }

        // Delete message
        const message = await Message.findOneAndDelete({
            _id: messageId,
            conversation_id: conversationId
        });

        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }

        // Update conversation message count
        conversation.message_count = Math.max(0, conversation.message_count - 1);
        await conversation.save();

        res.json({
            success: true,
            message: 'Message deleted successfully'
        });
    } catch (error) {
        console.error('Delete message error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete message',
            error: error.message
        });
    }
};