const axios = require("axios");
const Parser = require("rss-parser");
const cheerio = require("cheerio");

const parser = new Parser();

// Cấu hình nguồn và logo
const sources = [
  {
    name: "VietNamPlus",
    url: "https://www.vietnamplus.vn/rss/kinhte/taichinh-343.rss",
    logo: "https://upload.wikimedia.org/wikipedia/vi/a/a8/Logo_Vietnam%2B.png",
  },
  {
    name: "VTC News",
    url: "https://vtcnews.vn/rss/kinh-te.rss",
    logo: "https://rs.vtcnews.vn/Content/pc/theme/images/logo.png?v=1299",
  },
  {
    name: "VNExpress",
    url: "https://vnexpress.net/rss/kinh-doanh.rss",
    logo: "https://s1.vnecdn.net/vnexpress/restruct/i/v903/v2_2019/pc/graphics/logo.svg",
  },
];

let cachedNews = [];
let lastUpdated = null;

// Hàm lấy image từ description hoặc enclosure
const extractImage = (item) => {
  // Ưu tiên 1: Lấy từ enclosure (VTC News)
  if (item.enclosure && item.enclosure.url) {
    return item.enclosure.url;
  }

  // Ưu tiên 2: Lấy từ description hoặc content
  let html = item.description || item.content || "";

  // Nếu description không có <img> thì thử lấy từ content:encoded
  if (!/<img[^>]+src=/.test(html) && item["content:encoded"]) {
    html = item["content:encoded"];
  }

  try {
    const $ = cheerio.load(html);
    const imgSrc = $("img").attr("src");
    return imgSrc || null;
  } catch (err) {
    console.error("Error parsing image:", err.message);
    return null;
  }
};

const fetchRSSData = async () => {
  try {
    const results = await Promise.all(
      sources.map(async (src) => {
        try {
          const { data } = await axios.get(src.url, {
            timeout: 10000,
          });
          const feed = await parser.parseString(data);

          return feed.items.slice(0, 10).map((item) => ({
            title: item.title,
            link: item.link,
            sortDate: item.pubDate,
            pubDate: new Date(item.pubDate).toLocaleString("vi-VN", {
              timeZone: "Asia/Ho_Chi_Minh",
            }),
            image: extractImage(item),
            source: src.name,
            logo: src.logo,
          }));
        } catch (err) {
          console.error(`❌ Lỗi khi tải RSS từ ${src.name}:`, err.message);
          return []; // tránh crash toàn bộ
        }
      }),
    );

    // Gộp tất cả
    const allNews = results.flat();

    // Sắp xếp theo pubDate (mới nhất trước)
    allNews.sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate));
    cachedNews = allNews;
    lastUpdated = new Date();
  } catch (error) {
    console.error("RSS Fetch Error:", error.message);
  }
};

// Khởi tạo fetch đầu tiên
fetchRSSData();

// Tự động gọi lại mỗi 10 phút
setInterval(fetchRSSData, 10 * 60 * 1000);

// Controller để lấy news
exports.getNews = (req, res) => {
  try {
    res.json({
      status: "success",
      lastUpdated,
      total: cachedNews.length,
      data: cachedNews,
    });
  } catch (error) {
    console.error("Error fetching news:", error.message);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch news",
    });
  }
};
