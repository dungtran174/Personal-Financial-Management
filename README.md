# SỔ THU CHI AI - HỆ THỐNG QUẢN LÝ TÀI CHÍNH TÍCH HỢP TRỢ LÝ ẢO

Tài liệu này được thiết kế để phục vụ cho việc thuyết trình và bảo vệ dự án, tập trung vào luồng hoạt động của AI Agent, cơ chế lưu trữ ngữ cảnh và kịch bản demo chi tiết.

---

## PHẦN 1: KỊCH BẢN THUYẾT TRÌNH (DEMO SCRIPT)

### 1. Demo Quản lý Thu/Chi Thủ công (Core Features)
**Mục đích:** Chứng minh hệ thống nền tảng hoạt động trơn tru trước khi giới thiệu AI.

*   **Bước 1: Tổng quan Dashboard:**
    *   Đăng nhập vào hệ thống.
    *   Giới thiệu các thẻ thông tin (Info Cards): Tổng thu nhập, Tổng chi tiêu, Số dư hiện tại.
    *   Chỉ ra biểu đồ tương quan (Income vs Expense) cập nhật theo thời gian thực.
*   **Bước 2: Ghi nhận Thu nhập (Income):**
    *   Chuyển sang tab/menu "Thu nhập".
    *   Thêm một khoản thu nhập mới: *"Lương tháng 5", số tiền: 15,000,000 VNĐ, Danh mục: Lương.*
    *   **Nhấn mạnh:** Bảng dữ liệu lập tức cập nhật, số dư tổng thay đổi.
*   **Bước 3: Ghi nhận Chi tiêu (Expense):**
    *   Chuyển sang tab "Chi tiêu".
    *   Thêm một khoản chi tiêu: *"Đóng tiền trọ", số tiền: 3,000,000 VNĐ, Danh mục: Nhà ở.*
    *   **Nhấn mạnh:** Hệ thống trừ đi số dư, cập nhật lịch sử giao dịch.

### 2. Demo Trợ lý AI (AI Agent)
**Mục đích:** Khẳng định sự khác biệt của dự án - thay vì nhập liệu khô khan, người dùng giao tiếp tự nhiên với AI.

*   **Bước 1: Câu hỏi thông thường (Không dùng Tool):**
    *   *User:* "Chào bạn, bạn có thể giúp gì cho tôi?"
    *   *AI:* Trả lời giới thiệu về khả năng quản lý tài chính.
    *   **Nhấn mạnh:** Agent nhận biết đây là câu giao tiếp, không gọi API backend.
*   **Bước 2: Nhập liệu bằng ngôn ngữ tự nhiên (Kích hoạt Tool):**
    *   *User:* "Sáng nay tôi đi đổ xăng hết 60 nghìn."
    *   *AI:* "Tôi đã ghi nhận khoản chi tiêu 60,000 VNĐ cho danh mục Di chuyển..."
    *   **Nhấn mạnh:** Quay lại màn hình Dashboard, chỉ cho ban giám khảo thấy khoản chi 60k đã tự động xuất hiện trong database mà không cần click chuột.
*   **Bước 3: Truy vấn thống kê có ngữ cảnh (Contextual Query):**
    *   *User:* "Tổng chi tiêu của tôi tháng này là bao nhiêu?"
    *   *AI:* (Dùng tool `pfm_get_report_by_time` để tính toán và trả về kết quả).

---

## PHẦN 2: HOẠT ĐỘNG CỦA AI AGENT VÀ CÁCH PHÂN TÍCH CÂU HỎI

Kiến trúc AI của dự án không phải là một chatbot gọi API LLM thông thường, mà là một **ReAct Agent** (Reasoning and Acting) có khả năng sử dụng công cụ (Tool Use).

### 1. Phân biệt câu hỏi thông thường vs. Câu hỏi cần dùng Agent (Tool)
Quá trình này diễn ra tự động qua luồng (Flow) sau:

1.  **Tiếp nhận (Input):** Người dùng nhập câu hỏi.
2.  **Chia nhỏ vấn đề (Sub-question Generator):** LLM phân tích câu hỏi lớn thành các nhiệm vụ nhỏ.
3.  **Bộ lọc Heuristic & Vector Search (Định tuyến - Routing):**
    *   Agent trích xuất các từ khóa (keywords) từ câu hỏi.
    *   *Câu hỏi thông thường:* Ví dụ *"Lạm phát là gì?"*. Agent không tìm thấy từ khóa liên quan đến hành động hệ thống (như "thêm", "chi", "số dư"). Danh sách Tools trống -> Agent chuyển câu hỏi thẳng cho LLM (Gemini) để trả lời bằng kiến thức có sẵn.
    *   *Câu hỏi hệ thống:* Ví dụ *"Tôi vừa chi 50k ăn sáng"*. Agent bắt được keyword `"chi"`, `"ăn"`. Logic Heuristic (trong `agent.py`) lập tức đẩy công cụ `pfm_add_expense` vào danh sách khả dụng.
4.  **LLM Quyết định (Function Calling):** Gemini nhận câu hỏi kèm danh sách Tool. Nó tự đánh giá và quyết định tạo ra một `function_call` trích xuất tham số: `{ amount: 50000, category: "Ăn uống" }`.
5.  **Thực thi & Tổng hợp (Execution & Synthesis):** Backend chạy Tool, trả kết quả về cho LLM để tạo câu trả lời ngôn ngữ tự nhiên cho User.

---

## PHẦN 3: CƠ CHẾ LƯU TRỮ VÀ HIỂU NGỮ CẢNH HỘI THOẠI (MEMORY FLOW)

Để AI "nhớ" được toàn bộ 1 phiên hội thoại (Ví dụ: Câu 1: *"Tìm các khoản chi hôm qua"* -> Câu 2: *"Xóa khoản thứ hai đi"*), hệ thống sử dụng kết hợp 2 công nghệ bộ nhớ:

### 1. Bộ nhớ dài hạn (Long-term Memory) - MongoDB & Node.js
*   **Bảng `Conversation` & `Message`:** Mọi tin nhắn của User và AI đều được lưu vĩnh viễn vào CSDL kèm `session_id`.
*   **Tác dụng:** Giúp hiển thị lại lịch sử chat khi người dùng load lại trang (F5) hoặc đăng nhập vào ngày hôm sau. Node.js tự động xử lý việc kết nối `user_id` với `conversation_id`.

### 2. Bộ nhớ ngắn hạn (Working Memory) - Python In-memory Dict
*   **Cơ chế hoạt động:** 
    *   FastAPI (Python) duy trì một biến `sessions = {}` lưu trữ instance của `FinancialAgent` trong RAM.
    *   Mỗi Agent có một mảng `conversation_history` giữ lại tối đa 10 lượt trao đổi (exchanges) gần nhất.
*   **Quá trình "Hiểu" (Context Injection Flow):**
    1. Khi có câu hỏi mới, Agent lấy `conversation_history` ghép vào System Prompt.
    2. Prompt mẫu: *"Dưới đây là lịch sử hội thoại gần đây: [Lịch sử]. Hãy dựa vào đó để phân tích câu hỏi hiện tại: [Câu hỏi mới]"*.
    3. Nhờ Prompt này, khi User nói *"Xóa nó đi"*, LLM tự đối chiếu với [Lịch sử] để hiểu "nó" chính là khoản chi tiêu vừa được nhắc đến ở câu ngay trước đó.

### 3. Sơ đồ luồng xử lý tin nhắn (Flow Code)
`[User UI]` --(HTTP POST)--> `[Node.js (Lưu DB & Tìm Session)]` --(HTTP POST qua port 8008)--> `[Python FastAPI (Agent)]` 
  |--> `[Trích xuất Lịch sử]`
  |--> `[Tìm Tool]` 
  |--> `[Gọi OpenRouter/Gemini API]` 
  |--> `[Thực thi hàm PFM]` 
  |<-- `[Trả kết quả Streaming]`
`[User UI nhận SSE Stream & Hiển thị]`

---

## PHẦN 4: PHẠM VI TRẢ LỜI VÀ TƯ VẤN CỦA AI (AI SCOPE & ADVISORY)

Một điểm sáng của hệ thống là khả năng linh hoạt trong giao tiếp của AI, không chỉ giới hạn ở việc "gọi hàm" (Function Calling) để thêm/xóa dữ liệu.

### 1. Xử lý các câu hỏi không liên quan (Out-of-domain)
Bởi vì "bộ não" cốt lõi của Agent là một Mô hình Ngôn ngữ Lớn (LLM - Gemini), nó sở hữu lượng kiến thức tổng hợp khổng lồ.
*   **Có trả lời được không?** Có. Nếu người dùng hỏi những câu như *"Thời tiết hôm nay thế nào?"* hay *"Làm sao để nấu món phở?"*, hệ thống vẫn có thể đưa ra câu trả lời dựa trên kiến thức chung của LLM.
*   **Cơ chế:** Khi nhận câu hỏi này, bước "Tìm Tool" (Routing) sẽ trả về danh sách rỗng (do không có keyword tài chính nào khớp). Agent sẽ tự động chuyển sang chế độ "Trò chuyện thông thường" (Chit-chat mode) và trả lời như một chatbot tiêu chuẩn (như ChatGPT).

### 2. Tư vấn tài chính và Gợi ý (Financial Advisory)
Đây là tính năng "Trợ lý chuyên sâu" nhờ sự kết hợp giữa kiến thức nền của LLM và dữ liệu người dùng.
*   **Ví dụ:** Khi người dùng hỏi *"Tôi có nên mua iPhone 15 lúc này không?"*
*   **Cách AI phản hồi:**
    1.  Nó sẽ không trả lời "Có" hay "Không" một cách bừa bãi.
    2.  Nó có thể tự động kiểm tra `Số dư hiện tại` và `Biểu đồ chi tiêu` trong tháng của bạn (thông qua Tool `pfm_get_financial_summary`).
    3.  Từ dữ liệu đó, AI sẽ đóng vai trò như một cố vấn tài chính: *"Hiện tại số dư của bạn chỉ còn 10 triệu, trong khi chi tiêu cho ăn uống tháng này đã vượt mức. iPhone 15 có giá khoảng 20 triệu. Tôi khuyên bạn nên hoãn lại hoặc tiết kiệm thêm 2 tháng nữa."*
*   **Bản chất:** AI sử dụng **Khả năng suy luận (Reasoning)** để kết hợp dữ liệu cá nhân hóa (Personal Data) với kiến thức quản lý tài chính chung (General Knowledge) để đưa ra lời khuyên thực tế nhất.
