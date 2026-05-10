const mongoose = require("mongoose");

// Stores a user's personalized watchlist entries
const WatchlistSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true
        },
        items: [
            {
                symbol: { type: String, required: true, trim: true },
                type: { type: String, required: true, trim: true },
                starred: { type: Boolean, default: false },
                addedAt: { type: Date, default: Date.now }
            }
        ]
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Watchlist", WatchlistSchema);
