require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const incomeRoutes = require("./routes/incomeRoutes");
const expenseRoutes = require("./routes/expenseRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const newsRoutes = require("./routes/newsRoutes");
const tickerRoutes = require("./routes/newsDashboardRoutes");
const watchlistRoutes = require("./routes/watchlistRoutes");
const financeRoutes = require("./routes/financeRoutes");
const { startBinanceStreamAll } = require("./streams/binanceStream");
const { startIntradaySyncJobs } = require('./jobs/cron_intraday_sync');
const { startFrontendWebSocket } = require('./streams/frontendWebSocket');
const { startAlertMonitoring } = require('./services/alertSystem');
const { startDailySyncJobs } = require('./jobs/daily_ohlcv_sync');
const assetsRoutes = require('./routes/assetsRoutes');
const priceRoutes = require('./routes/priceRoutes');
const healthRoutes = require('./routes/healthRoutes');
const marketRoutes = require('./routes/marketRoutes');
const conversationRoutes = require('./routes/conversationRoutes');
const messageRoutes = require('./routes/messageRoutes');
const predictionRoutes = require('./routes/predictionRoutes');

const app = express();
const server = http.createServer(app);

app.use(
    cors({
        origin: process.env.CLIENT_URL || "*",
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
        allowedHeaders: ["Content-Type", "Authorization"]
    })
);

app.use(express.json());

connectDB(); 

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/income", incomeRoutes);
app.use("/api/v1/expense", expenseRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/news", newsRoutes);
app.use("/api/v1/ticker", tickerRoutes);
app.use("/api/v1/watchlist", watchlistRoutes);
app.use("/api/v1/finance", financeRoutes);
app.use('/api/v1/assets', assetsRoutes);
app.use('/api/v1/price', priceRoutes);
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/market', marketRoutes);
app.use('/api/v1/conversations', conversationRoutes);
app.use('/api/v1/conversations', messageRoutes);
app.use('/api/v1/prediction', predictionRoutes);

const debugRoutes = require("./routes/debug");
app.use("/debug", debugRoutes);

// Server uploads folder
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const PORT = process.env.PORT || 8000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 Server started on port ${PORT} (accessible from network)`);
    console.log(`${'='.repeat(60)}\n`);

    try {
      startFrontendWebSocket(server);
      console.log('✅ Frontend WebSocket ready at ws://localhost:' + PORT + '/ws/prices\n');
    } catch (err) {
      console.error('Failed to start Frontend WebSocket:', err);
    }

    try {
      startBinanceStreamAll();
    } catch (err) {
      console.error('Failed to start Binance stream:', err);
    }

    try {
      startIntradaySyncJobs();
    } catch (err) {
      console.error('Failed to start intraday sync jobs:', err);
    }

    try {
      startAlertMonitoring(10); // Check every 10 minutes
    } catch (err) {
      console.error('Failed to start alert monitoring:', err);
    }

    try {
      startDailySyncJobs();
    } catch (err) {
      console.error('Failed to start daily OHLCV sync:', err);
    }

    console.log(`${'='.repeat(60)}`);
    console.log('✅ All services started successfully');
    console.log(`${'='.repeat(60)}\n`);
});


// require("dotenv").config();
// const express = require("express");
// const http = require("http");
// const cors = require("cors");
// const path = require("path");
// const connectDB = require("./config/db");
// const authRoutes = require("./routes/authRoutes");
// const incomeRoutes = require("./routes/incomeRoutes");
// const expenseRoutes = require("./routes/expenseRoutes");
// const dashboardRoutes = require("./routes/dashboardRoutes");
// const newsRoutes = require("./routes/newsRoutes");
// const tickerRoutes = require("./routes/newsDashboardRoutes");
// const watchlistRoutes = require("./routes/watchlistRoutes");
// const financeRoutes = require("./routes/financeRoutes");
// const { startBinanceStreamAll } = require("./streams/binanceStream");
// const { startIntradaySyncJobs } = require('./jobs/cron_intraday_sync');
// const { startFrontendWebSocket } = require('./streams/frontendWebSocket');
// const { startAlertMonitoring } = require('./services/alertSystem');
// const { startDailySyncJobs } = require('./jobs/daily_ohlcv_sync');
// const assetsRoutes = require('./routes/assetsRoutes');
// const priceRoutes = require('./routes/priceRoutes');
// const healthRoutes = require('./routes/healthRoutes');
// const marketRoutes = require('./routes/marketRoutes');
// const conversationRoutes = require('./routes/conversationRoutes');
// const messageRoutes = require('./routes/messageRoutes');

// const app = express();
// const server = http.createServer(app);

// // Middleware to handle CORS
// app.use(
//     cors({
//         origin: process.env.CLIENT_URL || "*",
//         methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
//         allowedHeaders: ["Content-Type", "Authorization"]
//     })
// );

// app.use(express.json());

// connectDB(); 

// app.use("/api/v1/auth", authRoutes);
// app.use("/api/v1/income", incomeRoutes);
// app.use("/api/v1/expense", expenseRoutes);
// app.use("/api/v1/dashboard", dashboardRoutes);
// app.use("/api/v1/news", newsRoutes);
// app.use("/api/v1/ticker", tickerRoutes);
// app.use("/api/v1/watchlist", watchlistRoutes);
// app.use("/api/v1/finance", financeRoutes);
// app.use('/api/v1/assets', assetsRoutes);
// app.use('/api/v1/price', priceRoutes);
// app.use('/api/v1/health', healthRoutes);
// app.use('/api/v1/market', marketRoutes);
// app.use('/api/v1/conversations', conversationRoutes);
// app.use('/api/v1/conversations', messageRoutes); // Messages are nested under conversations

// const debugRoutes = require("./routes/debug");
// app.use("/debug", debugRoutes);

// // Server uploads folder
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// const PORT = process.env.PORT || 8000;

// server.listen(PORT, '0.0.0.0', () => {
//     console.log(`\n${'='.repeat(60)}`);
//     console.log(`🚀 Server started on port ${PORT} (accessible from network)`);
//     console.log(`${'='.repeat(60)}\n`);

//     // Start Frontend WebSocket server (with room subscriptions)
//     try {
//       startFrontendWebSocket(server);
//       console.log('✅ Frontend WebSocket ready at ws://localhost:' + PORT + '/ws/prices\n');
//     } catch (err) {
//       console.error('Failed to start Frontend WebSocket:', err);
//     }

//     // // Start Binance realtime stream
//     // try {
//     //   startBinanceStreamAll();
//     // } catch (err) {
//     //   console.error('Failed to start Binance stream:', err);
//     // }

//     // // Start intraday sync cron jobs
//     // try {
//     //   startIntradaySyncJobs();
//     // } catch (err) {
//     //   console.error('Failed to start intraday sync jobs:', err);
//     // }

//     // // Start alert monitoring
//     // try {
//     //   startAlertMonitoring(10); // Check every 10 minutes
//     // } catch (err) {
//     //   console.error('Failed to start alert monitoring:', err);
//     // }

//     // // Start daily OHLCV sync jobs
//     // try {
//     //   startDailySyncJobs();
//     // } catch (err) {
//     //   console.error('Failed to start daily OHLCV sync:', err);
//     // }

//     console.log(`${'='.repeat(60)}`);
//     console.log('✅ All services started successfully');
//     console.log(`${'='.repeat(60)}\n`);
// });