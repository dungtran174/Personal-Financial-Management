const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const aiAgentService = require('../services/aiAgentService');

/**
 * @desc    Create new conversation
 * @route   POST /api/v1/conversations
 * @access  Private
 */
exports.createConversation = async (req, res) => {
    try {
        const { title } = req.body;
        const userId = req.user._id;

        // Initialize AI agent session
        const agentSessionId = await aiAgentService.initSession();

        // Create conversation
        const conversation = await Conversation.create({
            user_id: userId,
            title: title || 'New Conversation',
            agent_session_id: agentSessionId
        });

        // Add welcome message from assistant
        const welcomeMessage = await Message.create({
            conversation_id: conversation._id,
            role: 'assistant',
            content: 'Xin chào! Tôi là trợ lý tài chính AI. Tôi có thể giúp bạn phân tích thị trường, cổ phiếu, và cung cấp thông tin tài chính. Bạn muốn tìm hiểu về điều gì?'
        });

        // Update conversation
        conversation.message_count = 1;
        conversation.last_message_preview = welcomeMessage.content.substring(0, 100);
        await conversation.save();

        res.status(201).json({
            success: true,
            conversation: {
                _id: conversation._id,
                title: conversation.title,
                message_count: conversation.message_count,
                last_message_preview: conversation.last_message_preview,
                createdAt: conversation.createdAt,
                updatedAt: conversation.updatedAt
            }
        });
    } catch (error) {
        console.error('Create conversation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create conversation',
            error: error.message
        });
    }
};

/**
 * @desc    Get all conversations for user
 * @route   GET /api/v1/conversations
 * @access  Private
 */
exports.getConversations = async (req, res) => {
    try {
        const userId = req.user._id;
        const { status = 'active', page = 1, limit = 20 } = req.query;

        const skip = (page - 1) * limit;

        const conversations = await Conversation.find({
            user_id: userId,
            status: status
        })
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .select('title last_message_preview message_count createdAt updatedAt');

        const total = await Conversation.countDocuments({
            user_id: userId,
            status: status
        });

        res.json({
            success: true,
            conversations,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch conversations',
            error: error.message
        });
    }
};

/**
 * @desc    Get single conversation with messages
 * @route   GET /api/v1/conversations/:id
 * @access  Private
 */
exports.getConversation = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;
        const { messageLimit = 50 } = req.query;

        // Find conversation and verify ownership
        const conversation = await Conversation.findOne({
            _id: id,
            user_id: userId
        });

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found'
            });
        }

        // Get messages (recent first, then reverse for chronological order)
        const messages = await Message.find({
            conversation_id: id
        })
            .sort({ createdAt: -1 })
            .limit(parseInt(messageLimit))
            .select('role content metadata createdAt');

        // Reverse to get chronological order
        messages.reverse();

        res.json({
            success: true,
            conversation: {
                _id: conversation._id,
                title: conversation.title,
                message_count: conversation.message_count,
                agent_session_id: conversation.agent_session_id,
                status: conversation.status,
                createdAt: conversation.createdAt,
                updatedAt: conversation.updatedAt
            },
            messages
        });
    } catch (error) {
        console.error('Get conversation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch conversation',
            error: error.message
        });
    }
};

/**
 * @desc    Update conversation title
 * @route   PUT /api/v1/conversations/:id
 * @access  Private
 */
exports.updateConversation = async (req, res) => {
    try {
        const { id } = req.params;
        const { title } = req.body;
        const userId = req.user._id;

        const conversation = await Conversation.findOneAndUpdate(
            { _id: id, user_id: userId },
            { title },
            { new: true }
        ).select('title updatedAt');

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found'
            });
        }

        res.json({
            success: true,
            conversation
        });
    } catch (error) {
        console.error('Update conversation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update conversation',
            error: error.message
        });
    }
};

/**
 * @desc    Delete conversation
 * @route   DELETE /api/v1/conversations/:id
 * @access  Private
 */
exports.deleteConversation = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        const conversation = await Conversation.findOne({
            _id: id,
            user_id: userId
        });

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found'
            });
        }

        // Delete AI agent session
        if (conversation.agent_session_id) {
            await aiAgentService.deleteSession(conversation.agent_session_id);
        }

        // Delete all messages
        await Message.deleteMany({ conversation_id: id });

        // Delete conversation
        await Conversation.deleteOne({ _id: id });

        res.json({
            success: true,
            message: 'Conversation deleted successfully'
        });
    } catch (error) {
        console.error('Delete conversation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete conversation',
            error: error.message
        });
    }
};

/**
 * @desc    Archive/Unarchive conversation
 * @route   PATCH /api/v1/conversations/:id/archive
 * @access  Private
 */
exports.archiveConversation = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // 'active' or 'archived'
        const userId = req.user._id;

        const conversation = await Conversation.findOneAndUpdate(
            { _id: id, user_id: userId },
            { status },
            { new: true }
        ).select('title status updatedAt');

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found'
            });
        }

        res.json({
            success: true,
            conversation
        });
    } catch (error) {
        console.error('Archive conversation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to archive conversation',
            error: error.message
        });
    }
};