import moment from "moment";

export const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

export const validatePassword = (password) => {
  if (password.length < 8) {
    return "Password must be at least 8 characters long";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must contain at least one lowercase letter (a-z)";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter (A-Z)";
  }
  if (!/\d/.test(password)) {
    return "Password must contain at least one number (0-9)";
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return "Password must contain at least one special character (!@#$...)";
  }
  return "";
}

export const addThousandsSeperator = (num) => {
  if (num === "" || isNaN(num)) return '';

  const n = Number(num);
  const isInteger = Number.isInteger(n);

  if (isInteger) {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  const [integerPart, fractionalPart] = n.toFixed(2).split('.');
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formattedInteger},${fractionalPart}`;
};

export const prepareExpenseBarChartData = (data = []) =>{
  const sortedData = [...data].sort((a, b) => new Date(a.date) - new Date(b.date))
  const chartData = sortedData.map((item) => ({
    month: moment(item?.date).format('DD/MM'),
    category: item?.category,
    amount: item?.amount,
  }))
  return chartData
}

export const prepareIncomeChartData = (data = [])=>{
  const sortedData = [...data].sort((a, b) => new Date(a.date) - new Date(b.date))

  const chartData = sortedData.map((item) => ({
    month: moment(item?.date).format('DD/MM'),
    amount: item?.amount,
    source: item?.source,
  }))

  return chartData;
}

export const prepareExpenseLineChartData  = (data = [])=>{
  const sortedData = [...data].sort((a, b) => new Date(a.date) - new Date(b.date))

  const chartData = sortedData.map((item) => ({
    month: moment(item?.date).format('DD/MM'),
    amount: item?.amount,
    category: item?.category,
  }))

  return chartData;
}

export const formatTimeAgo = (pubDate) =>{
  if (!pubDate) return "😁😁😁😁";

  try {
    // 👉 Parse chuỗi "30/10/2025 20:29:25"
    const [timePart, datePart] = pubDate.split(" ");
    const [day, month, year] = datePart.split("/").map(Number);
    const [hour, minute, second] = timePart.split(":").map(Number);

    // 👉 Tạo đối tượng Date chuẩn (múi giờ VN)
    const date = new Date(year, month - 1, day, hour, minute, second);

    // 👉 Tính khoảng thời gian chênh lệch (milliseconds)
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    // 👉 Trả về dạng dễ hiểu
    if (diffMins < 1) return "Vừa xong";
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays < 7) return `${diffDays} ngày trước`;
    return diffDays; // nếu quá 7 ngày thì hiển thị ngày gốc
  } catch (err) {
    console.error("❌ Lỗi khi xử lý thời gian:", err);
    return pubDate;
  }
}
