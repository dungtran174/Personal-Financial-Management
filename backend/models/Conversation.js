const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    title: {
        type: String,
        default: 'New Conversation',
        maxlength: 200
    },
    // AI Agent session ID for resuming context
    agent_session_id: {
        type: String,
        default: null
    },
    // Last message preview for UI
    last_message_preview: {
        type: String,
        maxlength: 100,
        default: ''
    },
    // Message count for quick access
    message_count: {
        type: Number,
        default: 0
    },
    // Status: active, archived
    status: {
        type: String,
        enum: ['active', 'archived'],
        default: 'active'
    }
}, {
    timestamps: true  // Tự động tạo createdAt và updatedAt
});

// Index for faster queries
ConversationSchema.index({ user_id: 1, createdAt: -1 });
ConversationSchema.index({ user_id: 1, status: 1 });

// Virtual for messages
ConversationSchema.virtual('messages', {
    ref: 'Message',
    localField: '_id',
    foreignField: 'conversation_id'
});

module.exports = mongoose.model('Conversation', ConversationSchema);