# run_example.py (placed at project root)
import sys
import io

# Fix encoding for Windows console
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')

from finance_agent.agent import FinancialAgent

def main():
    agent = FinancialAgent(verbose=False)
    
    print("=== Financial Chatbot ===")
    print("Nhập câu hỏi của bạn (gõ 'exit' hoặc 'quit' để thoát)")
    print("=" * 50)
    
    while True:
        try:
            print("\n")
            question = input("Bạn: ").strip()
            
            if not question:
                continue
                
            if question.lower() in ['exit', 'quit', 'thoát']:
                print("Tạm biệt!")
                break
            
            print("\nĐang xử lý...")
            res = agent.answer(question)
            
            print("\n===== FINAL REPORT =====")
            print(res["report"])
            print("\n===== ANSWERED SUBQUESTIONS =====")
            for a in res["answered_subquestions"]:
                print(a)
            print("=" * 50)
            
        except KeyboardInterrupt:
            print("\n\nTạm biệt!")
            break
        except Exception as e:
            print(f"\nLỗi: {str(e)}")
            print("Vui lòng thử lại với câu hỏi khác.")

if __name__ == "__main__":
    main()
