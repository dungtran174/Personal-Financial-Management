const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    conversation_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true,
        index: true
    },
    role: {
        type: String,
        enum: ['user', 'assistant', 'system'],
        required: true
    },
    content: {
        type: String,
        required: true
    },
    // Additional metadata
    metadata: {
        // Tool calls used by AI
        tools_used: [{
            tool_name: String,
            execution_time: Number
        }],
        // Answered subquestions
        answered_subquestions: [{
            id: Number,
            answer: String,
            used_tools: [String]
        }],
        // Token usage
        tokens: {
            prompt: Number,
            completion: Number,
            total: Number
        },
        // Model used
        model: String,
        // Response time
        response_time: Number
    },
    // For error messages or system notifications
    error: {
        type: String,
        default: null
    }
}, {
    timestamps: true  // createdAt
});

// Index for efficient queries
MessageSchema.index({ conversation_id: 1, createdAt: 1 });
MessageSchema.index({ conversation_id: 1, role: 1 });

// Static method to get recent messages for context
MessageSchema.statics.getRecentMessages = async function(conversationId, limit = 20) {
    return this.find({ conversation_id: conversationId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('role content createdAt')
        .lean();
};

module.exports = mongoose.model('Message', MessageSchema);