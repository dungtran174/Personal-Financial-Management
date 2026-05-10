require('dotenv').config();
const axios = require('axios');

const API_URL = 'http://localhost:8000/api/v1/expense/add';
const TOKEN = process.env.TEST_AUTH_TOKEN;

if (!TOKEN) {
    console.error('Error: TEST_AUTH_TOKEN not found in .env');
    process.exit(1);
}

const expenses = [];

// Generate data from Jan 1, 2025 to Dec 23, 2025
const currentYear = 2026;
const today = new Date();

console.log(`Generating expense data for year ${currentYear}...`);

for (let month = 0; month <= 11; month++) { // 0 = Jan, 11 = Dec
    // 1. Rent (Fixed: 1st-3rd of month)
    const rentDate = new Date(currentYear, month, Math.floor(Math.random() * 3) + 1);
    if (rentDate <= today) {
        expenses.push({
            category: 'Tiền nhà',
            amount: 3000000,
            date: rentDate,
        });
    }

    // 2. Bills (Electricity, Water, Internet - around 10th-15th)
    const billDate = new Date(currentYear, month, Math.floor(Math.random() * 5) + 10);
    if (billDate <= today) {
        expenses.push({
            category: 'Hóa đơn điện nước',
            amount: Math.floor(Math.random() * (800000 - 500000) + 500000), // 500k - 800k
            date: billDate,
        });
        
        expenses.push({
            category: 'Internet 4G',
            amount: 250000,
            date: billDate,
        });
    }

    // 3. Food & Drink (Multiple times a month - simulating weekly groceries or eating out)
    // Let's generate about 10-15 food records per month to simulate frequent spending without spamming too much
    const numFood = Math.floor(Math.random() * 5) + 10; 
    for (let k = 0; k < numFood; k++) {
        const day = Math.floor(Math.random() * 28) + 1;
        const foodDate = new Date(currentYear, month, day);
        if (foodDate <= today) {
            const foodTypes = ['Ăn trưa', 'Siêu thị', 'Cafe', 'Ăn tối', 'Trà sữa'];
            const type = foodTypes[Math.floor(Math.random() * foodTypes.length)];
            expenses.push({
                category: 'Ăn uống',
                amount: Math.floor(Math.random() * (300000 - 30000) + 30000), // 30k - 300k
                date: foodDate,
            });
        }
    }

    // 4. Transport (Gasoline, Grab - 3-5 times a month)
    const numTransport = Math.floor(Math.random() * 3) + 3;
    for (let k = 0; k < numTransport; k++) {
        const day = Math.floor(Math.random() * 28) + 1;
        const transDate = new Date(currentYear, month, day);
        if (transDate <= today) {
            expenses.push({
                category: 'Di chuyển',
                amount: Math.floor(Math.random() * (100000 - 50000) + 50000), // 50k - 100k
                date: transDate,
            });
        }
    }

    // 5. Shopping / Entertainment (Occasional)
    if (Math.random() > 0.3) { // 70% chance per month
        const shopDate = new Date(currentYear, month, Math.floor(Math.random() * 25) + 1);
        if (shopDate <= today) {
            const items = ['Mua quần áo', 'Xem phim', 'Mua sách', 'Game Steam', 'Đồ gia dụng'];
            const item = items[Math.floor(Math.random() * items.length)];
            expenses.push({
                category: 'Mua sắm & Giải trí',
                amount: Math.floor(Math.random() * (1000000 - 200000) + 200000), // 200k - 1m
                date: shopDate,
            });
        }
    }
}

// Sort by date
expenses.sort((a, b) => a.date - b.date);

const seedExpense = async () => {
    console.log(`Starting to seed ${expenses.length} expense records from Jan 2025 to now...`);
    console.log(`Target URL: ${API_URL}`);
    
    let successCount = 0;
    let failCount = 0;

    for (const expense of expenses) {
        try {
            await axios.post(API_URL, expense, {
                headers: {
                    Authorization: `Bearer ${TOKEN}`
                }
            });
            const dateStr = expense.date.toISOString().split('T')[0];
            console.log(`✅ [${dateStr}] Added: ${expense.category.padEnd(20)} - ${expense.amount.toLocaleString('vi-VN')} VND`);
            successCount++;
        } catch (error) {
            console.error(`❌ Failed: ${expense.category}`);
            if (error.response) {
                console.error(`   Status: ${error.response.status}`);
            } else {
                console.error(`   Error: ${error.message}`);
            }
            failCount++;
        }
    }

    console.log(`\nCompleted! Success: ${successCount}, Failed: ${failCount}`);
};

seedExpense();
