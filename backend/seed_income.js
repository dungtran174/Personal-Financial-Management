require('dotenv').config();
const axios = require('axios');

const API_URL = 'http://localhost:8000/api/v1/income/add';
const TOKEN = process.env.TEST_AUTH_TOKEN;

if (!TOKEN) {
    console.error('Error: TEST_AUTH_TOKEN not found in .env');
    process.exit(1);
}

const incomes = [];

// Generate data from Jan 1, 2025 to present 2026
const currentYear = 2026;
const today = new Date();

console.log(`Generating data for year ${currentYear}...`);

for (let month = 0; month <= 11; month++) { // 0 = Jan, 11 = Dec
    // 1. Main Salary (Fixed around 5th of each month)
    const salaryDate = new Date(currentYear, month, 5);
    if (salaryDate <= today) {
        incomes.push({
            source: 'Lương công ty',
            amount: 10000000 + Math.floor(Math.random() * 500000), // 10m - 10.5m
            date: salaryDate,
        });
    }

    // 2. Freelance Projects (1-3 times per month, random dates)
    const numFreelance = Math.floor(Math.random() * 3) + 1; // 1 to 3 jobs
    for (let k = 0; k < numFreelance; k++) {
        const day = Math.floor(Math.random() * 25) + 1; // 1st to 25th
        const fDate = new Date(currentYear, month, day);
        
        // Avoid duplicate dates if possible, but simple push is fine
        if (fDate <= today) {
            const types = ['Freelance Code', 'Freelance Design', 'Fix Bug dạo', 'Dạy kèm Code'];
            const type = types[Math.floor(Math.random() * types.length)];
            
            incomes.push({
                source: type,
                amount: Math.floor(Math.random() * (3000000 - 500000) + 500000), // 500k - 3m
                date: fDate,
            });
        }
    }

    // 3. Investment Dividends (Quarterly: Mar, Jun, Sep, Dec)
    if ([2, 5, 8, 11].includes(month)) {
        const divDate = new Date(currentYear, month, 15);
        if (divDate <= today) {
            incomes.push({
                source: 'Cổ tức chứng khoán',
                amount: Math.floor(Math.random() * (2000000 - 500000) + 500000), // 500k - 2m
                date: divDate,
            });
        }
    }

    // 4. Tet Holiday Lucky Money (February 2025)
    if (month === 1) { // February
        const tetDate = new Date(currentYear, month, 10);
        if (tetDate <= today) {
            incomes.push({
                source: 'Lì xì Tết',
                amount: Math.floor(Math.random() * (5000000 - 2000000) + 2000000), // 2m - 5m
                date: tetDate,
            });
        }
    }
    
    // 5. Occasional Income (Selling old stuff, gifts) - 25% chance
    if (Math.random() < 0.25) {
        const randomDate = new Date(currentYear, month, Math.floor(Math.random() * 28) + 1);
        if (randomDate <= today) {
             incomes.push({
                source: Math.random() > 0.5 ? 'Bán đồ cũ' : 'Được tặng tiền',
                amount: Math.floor(Math.random() * (1000000 - 200000) + 200000), // 200k - 1m
                date: randomDate,
            });
        }
    }
}

// Sort by date for better log viewing
incomes.sort((a, b) => a.date - b.date);

const seedIncome = async () => {
    console.log(`Starting to seed ${incomes.length} income records from Jan 2025 to now...`);
    console.log(`Target URL: ${API_URL}`);
    
    let successCount = 0;
    let failCount = 0;

    for (const income of incomes) {
        try {
            await axios.post(API_URL, income, {
                headers: {
                    Authorization: `Bearer ${TOKEN}`
                }
            });
            // Format date as YYYY-MM-DD
            const dateStr = income.date.toISOString().split('T')[0];
            console.log(`✅ [${dateStr}] Added: ${income.source.padEnd(20)} - ${income.amount.toLocaleString('vi-VN')} VND`);
            successCount++;
        } catch (error) {
            console.error(`❌ Failed: ${income.source}`);
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

seedIncome();
