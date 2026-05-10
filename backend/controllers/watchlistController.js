const Watchlist = require("../models/Watchlist");

// Default symbols applied to brand-new users
const DEFAULT_ITEMS = [
    { symbol: "^VNINDEX.VN", type: "index", starred: false },
    { symbol: "AAPL", type: "stock", starred: false },
    { symbol: "MSFT", type: "stock", starred: false },
    { symbol: "BTCUSDT", type: "crypto", starred: false },
    { symbol: "ETHUSDC", type: "crypto", starred: false }
];

// Sort starred items first while keeping older entries behind newer ones
const sortItems = items =>
    [...items].sort((a, b) => {
        if (a.starred === b.starred) {
            const timeA = a.addedAt ? new Date(a.addedAt).getTime() : 0;
            const timeB = b.addedAt ? new Date(b.addedAt).getTime() : 0;
            return timeA - timeB;
        }
        return a.starred ? -1 : 1;
    });

// Create a watchlist document when the user has none
const ensureWatchlist = async userId => {
    let watchlist = await Watchlist.findOne({ userId });
    if (!watchlist) {
        const itemsWithTimestamps = DEFAULT_ITEMS.map(item => ({
            ...item,
            addedAt: new Date()
        }));
        watchlist = await Watchlist.create({ userId, items: itemsWithTimestamps });
    }
    return watchlist;
};

// GET /watchlist
exports.getWatchlist = async (req, res) => {
    try {
        const watchlist = await ensureWatchlist(req.user.id);
        res.status(200).json({ items: sortItems(watchlist.items) });
    } catch (error) {
        res.status(500).json({ message: "Failed to load watchlist" });
    }
};

// POST /watchlist/add
exports.addToWatchlist = async (req, res) => {
    const { symbol, type } = req.body;

    const normalizedSymbol = typeof symbol === "string" ? symbol.trim().toUpperCase() : "";
    const normalizedType = typeof type === "string" ? type.trim().toLowerCase() : "";

    if (!normalizedSymbol || !normalizedType) {
        return res.status(400).json({ message: "Symbol and type are required" });
    }

    try {
        const watchlist = await ensureWatchlist(req.user.id);

        const exists = watchlist.items.some(
            item => item.symbol.toUpperCase() === normalizedSymbol
        );

        if (exists) {
            return res.status(409).json({ message: "Symbol already in watchlist" });
        }

        watchlist.items.push({
            symbol: normalizedSymbol,
            type: normalizedType,
            starred: true,
            addedAt: new Date()
        });

        await watchlist.save();

        res.status(201).json({ items: sortItems(watchlist.items) });
    } catch (error) {
        res.status(500).json({ message: "Failed to add symbol" });
    }
};

// PATCH /watchlist/star
exports.updateStarredStatus = async (req, res) => {
    const { symbol, starred } = req.body;

    const normalizedSymbol = typeof symbol === "string" ? symbol.trim().toUpperCase() : "";

    if (!normalizedSymbol || typeof starred !== "boolean") {
        return res.status(400).json({ message: "Symbol and starred flag are required" });
    }

    try {
        const watchlist = await ensureWatchlist(req.user.id);
        const item = watchlist.items.find(
            entry => entry.symbol.toUpperCase() === normalizedSymbol
        );

        if (!item) {
            return res.status(404).json({ message: "Symbol not found" });
        }

        item.starred = starred;
        await watchlist.save();

        res.status(200).json({ items: sortItems(watchlist.items) });
    } catch (error) {
        res.status(500).json({ message: "Failed to update starred status" });
    }
};

// DELETE /watchlist/remove/:symbol
exports.removeFromWatchlist = async (req, res) => {
    const symbolParam = req.params.symbol;
    const normalizedSymbol = typeof symbolParam === "string" ? symbolParam.trim().toUpperCase() : "";

    if (!normalizedSymbol) {
        return res.status(400).json({ message: "Symbol parameter is required" });
    }

    try {
        const watchlist = await ensureWatchlist(req.user.id);
        const initialLength = watchlist.items.length;

        watchlist.items = watchlist.items.filter(
            item => item.symbol.toUpperCase() !== normalizedSymbol
        );

        if (watchlist.items.length === initialLength) {
            return res.status(404).json({ message: "Symbol not found" });
        }

        watchlist.markModified("items");
        await watchlist.save();

        res.status(200).json({ items: sortItems(watchlist.items) });
    } catch (error) {
        res.status(500).json({ message: "Failed to remove symbol" });
    }
};
