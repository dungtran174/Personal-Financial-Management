"""
GeminiWrapper - Wrapper for Gemini API using OpenAI SDK compatibility layer
This module has been converted from Google's Gemini SDK to OpenAI SDK for better compatibility
while still using Google's Gemini API endpoint.

Changes from original:
- Replaced google.generativeai with OpenAI client
- Uses OpenAI chat completions format  
- Handles role conversion (system messages become user messages with prefix)
- Maintains backward compatibility with existing agent.py code
- Added chat history management for context preservation
"""
import os
import json
import inspect
import logging
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
from typing import Any, Dict, List, Callable, Optional, Union
from openai import OpenAI

logger = logging.getLogger(__name__)

load_dotenv()
GEMINI_API_KEY_ENV = "GEMINI_API_KEY"

USE_REAL = bool(os.getenv(GEMINI_API_KEY_ENV, "").strip())


class ChatHistory:
    """Manages conversation history for the chat session"""
    
    def __init__(self, max_messages: int = 100, max_tokens_estimate: int = 8000):
        """
        Initialize chat history manager
        
        Args:
            max_messages: Maximum number of messages to keep in history
            max_tokens_estimate: Estimated max tokens to keep (rough estimate: 1 token ≈ 4 chars)
        """
        self.messages: List[Dict[str, str]] = []
        self.max_messages = max_messages
        self.max_tokens_estimate = max_tokens_estimate
        self.session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        
    def add_message(self, role: str, content: str) -> None:
        """Add a message to the history"""
        self.messages.append({
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat()
        })
        self._trim_history()
        
    def add_exchange(self, user_msg: str, assistant_msg: str) -> None:
        """Add a user-assistant exchange to history"""
        self.add_message("user", user_msg)
        self.add_message("assistant", assistant_msg)
        
    def _trim_history(self) -> None:
        """Trim history to respect limits"""
        # Trim by message count
        if len(self.messages) > self.max_messages:
            # Keep system messages and recent messages
            system_msgs = [m for m in self.messages if m.get("role") == "system"]
            other_msgs = [m for m in self.messages if m.get("role") != "system"]
            keep_count = self.max_messages - len(system_msgs)
            self.messages = system_msgs + other_msgs[-keep_count:]
            
        # Trim by estimated tokens (rough estimation)
        total_chars = sum(len(m.get("content", "")) for m in self.messages)
        estimated_tokens = total_chars // 4  # Rough estimate
        
        if estimated_tokens > self.max_tokens_estimate:
            # Keep removing oldest non-system messages until under limit
            while estimated_tokens > self.max_tokens_estimate and len(self.messages) > 1:
                for i, msg in enumerate(self.messages):
                    if msg.get("role") != "system":
                        self.messages.pop(i)
                        break
                total_chars = sum(len(m.get("content", "")) for m in self.messages)
                estimated_tokens = total_chars // 4
                
    def get_messages(self, include_timestamps: bool = False) -> List[Dict[str, str]]:
        """Get all messages in history"""
        if include_timestamps:
            return self.messages.copy()
        else:
            # Return without timestamps for API calls
            return [{k: v for k, v in msg.items() if k != "timestamp"} for msg in self.messages]
            
    def clear(self) -> None:
        """Clear all messages from history"""
        self.messages = []
        
    def save_to_file(self, filepath: Union[str, Path] = None) -> str:
        """Save history to a JSON file"""
        if filepath is None:
            filepath = f"chat_history_{self.session_id}.json"
        
        filepath = Path(filepath)
        filepath.parent.mkdir(parents=True, exist_ok=True)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump({
                "session_id": self.session_id,
                "messages": self.messages,
                "saved_at": datetime.now().isoformat()
            }, f, ensure_ascii=False, indent=2)
            
        logger.info(f"Chat history saved to {filepath}")
        return str(filepath)
        
    def load_from_file(self, filepath: Union[str, Path]) -> None:
        """Load history from a JSON file"""
        filepath = Path(filepath)
        
        if not filepath.exists():
            logger.warning(f"History file not found: {filepath}")
            return
            
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        self.messages = data.get("messages", [])
        self.session_id = data.get("session_id", self.session_id)
        logger.info(f"Chat history loaded from {filepath} ({len(self.messages)} messages)")
        
    def get_summary(self) -> Dict[str, Any]:
        """Get a summary of the current history"""
        return {
            "session_id": self.session_id,
            "total_messages": len(self.messages),
            "user_messages": len([m for m in self.messages if m.get("role") == "user"]),
            "assistant_messages": len([m for m in self.messages if m.get("role") == "assistant"]),
            "system_messages": len([m for m in self.messages if m.get("role") == "system"]),
            "estimated_tokens": sum(len(m.get("content", "")) for m in self.messages) // 4
        }


def _callable_to_schema(func: Callable) -> Dict:
    """
    Build a simple JSON schema for function parameters based on signature.
    Defaults to string for unknown annotations.
    """
    sig = inspect.signature(func)
    props = {}
    required = []
    for name, param in sig.parameters.items():
        if param.kind in (param.VAR_POSITIONAL, param.VAR_KEYWORD):
            continue
        ann = param.annotation
        if ann == inspect._empty:
            t = "string"
        elif ann in (str,):
            t = "string"
        elif ann in (int,):
            t = "integer"
        elif ann in (float,):
            t = "number"
        elif ann in (bool,):
            t = "boolean"
        else:
            t = "string"
        props[name] = {"type": t, "description": f"Parameter {name} of {func.__name__}"}
        if param.default == inspect._empty:
            required.append(name)
    schema = {"type": "object", "properties": props}
    if required:
        schema["required"] = required
    return schema


class GeminiWrapper:
    """
    Wrapper: if GEMINI_API_KEY provided -> real calls using OpenAI SDK with Gemini endpoint
    Otherwise uses a deterministic MOCK LLM for dev / testing.
    Includes chat history management for context preservation across conversations.
    """

    def __init__(self, model: str = "gemini-2.0-flash", enable_history: bool = True, 
                 history_config: Dict[str, Any] = None):
        """
        Initialize GeminiWrapper
        
        Args:
            model: Model name to use
            enable_history: Whether to enable chat history tracking
            history_config: Configuration for chat history (max_messages, max_tokens_estimate)
        """
        self.model_name = model
        self.use_real = USE_REAL
        self.enable_history = enable_history
        
        # Initialize chat history if enabled
        if self.enable_history:
            history_config = history_config or {}
            self.history = ChatHistory(
                max_messages=history_config.get('max_messages', 100),
                max_tokens_estimate=history_config.get('max_tokens_estimate', 8000)
            )
        else:
            self.history = None
            
        if self.use_real:
            try:
                # Khởi tạo OpenAI client với Gemini endpoint
                self.client = OpenAI(
                    base_url="https://openrouter.ai/api/v1",
                    api_key=os.getenv(GEMINI_API_KEY_ENV)
                )
                self.model = model
            except Exception as e:
                logger.error("Failed to init OpenAI client for Gemini: %s", e)
                self.use_real = False
                self.client = None
        else:
            self.client = None

    def _build_functions_metadata(self, tools: List[Callable]) -> List[Dict]:
        metas = []
        for t in tools:
            metas.append(
                {
                    "name": getattr(t, "__name__", str(t)),
                    "description": (t.__doc__ or "").strip(),
                    "parameters": _callable_to_schema(t),
                }
            )
        return metas

    def _mock_generate(self, messages: List[Dict], tools: Optional[List[Callable]] = None) -> Dict[str, Any]:
        """
        A very small deterministic mock LLM.
        """
        joined = " ".join(m.get("content", "") for m in messages).lower()
        out = {"text": None, "function_call": None, "raw": None}

        # detect subquestion generation intent
        if "json array of subquestions" in joined or "json list of subquestions" in joined:
            json_out = {"subquestions": [
                {"id": 1, "question": "What is the ticker for FPT?", "depends_on": []},
                {"id": 2, "question": "What is the current price of {{TICKER_FROM_Q1}}?", "depends_on": [1]}
            ]}
            out["text"] = json.dumps(json_out)
            return out

        # detect tool request and generate appropriate arguments
        if tools and len(tools) > 0:
            tool = tools[0]
            tool_name = getattr(tool, "__name__", None)
            
            if tool_name:
                # Generate appropriate arguments based on tool name
                arguments = {}
                
                # Extract company/ticker names from query
                # Common Vietnamese stock codes
                vn_stocks = ["fpt", "vcb", "hpg", "vnm", "mwg", "vhm", "tpb", "tcb", "bid", "ctg", "vib"]
                found_stock = None
                for stock in vn_stocks:
                    if stock in joined:
                        found_stock = stock.upper()
                        break
                
                # Map tool names to their expected arguments
                if tool_name == "get_stock_symbol":
                    # Extract company name from query
                    company = found_stock or "FPT"
                    arguments = {"company_name": company}
                    
                elif tool_name in ["get_stock_price", "get_fundamentals", "get_sector_mapping", 
                                  "calculate_ratios", "estimate_fair_value", "analyze_cashflow",
                                  "get_technical_indicators", "get_risk_metrics", "generate_price_chart",
                                  "get_income_statement", "get_balance_sheet", "get_pattern_recognition",
                                  "get_candlestick_analysis", "get_signal_summary", "get_advanced_ratios"]:
                    ticker = f"{found_stock}.VN" if found_stock else "FPT.VN"
                    arguments = {"ticker": ticker}
                    
                elif tool_name == "get_exchange_info":
                    if "hose" in joined:
                        arguments = {"exchange": "HOSE"}
                    elif "hnx" in joined:
                        arguments = {"exchange": "HNX"}
                    else:
                        arguments = {"exchange": "HOSE"}
                        
                elif tool_name == "get_currency_rate":
                    # Extract currency codes
                    from_curr = "USD"
                    to_curr = "VND"
                    if "usd" in joined:
                        from_curr = "USD"
                    if "vnd" in joined or "việt nam" in joined:
                        to_curr = "VND"
                    arguments = {"from_currency": from_curr, "to_currency": to_curr, "amount": 1.0}
                    
                elif tool_name == "get_macro_data":
                    country = "Vietnam" if "việt nam" in joined or "vietnam" in joined else "US"
                    # Map Vietnamese terms to indicators
                    if "lạm phát" in joined or "inflation" in joined or "cpi" in joined:
                        indicator = "inflation_cpi"
                    elif "gdp" in joined:
                        indicator = "gdp"
                    elif "thất nghiệp" in joined or "unemployment" in joined:
                        indicator = "unemployment"
                    elif "lãi suất" in joined or "interest" in joined:
                        indicator = "interest_rate"
                    else:
                        indicator = "gdp"
                    arguments = {"country": country, "indicator": indicator}
                    
                elif tool_name == "google_search" or tool_name == "search_news":
                    # Extract search query
                    query = "FPT stock news" if found_stock else "stock market news"
                    arguments = {"query": query}
                    
                elif tool_name == "compare_fundamentals" or tool_name == "compare_with_peers":
                    # Need multiple tickers
                    tickers = ["FPT.VN", "MWG.VN", "VCB.VN"]
                    arguments = {"tickers": tickers}
                    
                elif tool_name == "get_correlation_matrix":
                    tickers = ["FPT.VN", "MWG.VN", "VCB.VN"]
                    arguments = {"tickers": tickers, "period": "1y"}
                    
                elif tool_name == "analyze_portfolio":
                    portfolio = {"FPT.VN": 0.4, "MWG.VN": 0.3, "VCB.VN": 0.3}
                    arguments = {"portfolio": portfolio}
                    
                else:
                    # Default fallback
                    arguments = {"ticker": "FPT.VN"}
                
                out["function_call"] = {"name": tool_name, "arguments": arguments}
                return out

        out["text"] = "[-] Mock answer: cannot do complex reasoning in mock mode."
        return out

    def generate(
        self,
        messages: List[Dict],
        tools: Optional[List[Callable]] = None,
        temperature: float = 0.0,
        max_output_tokens: int = 1024,
        function_call: str = "auto",
        use_history: bool = True,
        save_to_history: bool = True
    ) -> Dict[str, Any]:
        """
        Gọi model Gemini qua OpenAI SDK hoặc mock.
        
        Args:
            messages: List of message dicts with 'role' and 'content'
            tools: Optional list of callable tools
            temperature: Sampling temperature
            max_output_tokens: Maximum tokens in response
            function_call: Function calling mode
            use_history: Whether to include chat history in the request
            save_to_history: Whether to save this exchange to history
            
        Returns:
            dict: {'text': str|None, 'function_call': dict|None, 'raw': raw_response}
        """
        # Prepare messages with history if enabled
        if self.enable_history and use_history and self.history:
            # Combine history messages with current messages
            history_messages = self.history.get_messages()
            # Avoid duplicating messages if they're already in history
            combined_messages = history_messages + messages
        else:
            combined_messages = messages
            
        if not self.use_real or not self.client:
            return self._mock_generate(combined_messages, tools)

        try:
            # Chuyển đổi messages sang format OpenAI
            # Gemini qua OpenAI API có thể không support system role tốt
            # nên ta có thể gộp system message vào user message đầu tiên
            openai_messages = []
            
            for msg in combined_messages:
                role = msg.get('role', 'user')
                content = msg.get('content', '')
                
                # Gemini qua OpenAI có thể cần điều chỉnh role
                if role == 'system':
                    # Chuyển system message thành user message với prefix
                    openai_messages.append({
                        "role": "user",
                        "content": f"[System Instructions]: {content}"
                    })
                elif role in ['user', 'assistant']:
                    openai_messages.append({
                        "role": role,
                        "content": content
                    })
                else:
                    # Default to user role
                    openai_messages.append({
                        "role": "user",
                        "content": content
                    })
            
            # Gọi Gemini qua OpenAI API
            completion = self.client.chat.completions.create(
                model=self.model,
                messages=openai_messages,
                temperature=temperature,
                max_tokens=max_output_tokens
            )
            
            # Parse response
            out = {"text": None, "function_call": None, "raw": completion}
            
            if completion.choices and len(completion.choices) > 0:
                message = completion.choices[0].message
                out["text"] = message.content
                
                # Note: Function calling có thể không được support
                # qua OpenAI compatibility layer của Gemini
                if hasattr(message, 'function_call') and message.function_call:
                    out["function_call"] = {
                        "name": message.function_call.name,
                        "arguments": json.loads(message.function_call.arguments) if message.function_call.arguments else {}
                    }
                    
                # Save to history if enabled
                if self.enable_history and save_to_history and self.history and out["text"]:
                    # Get the last user message from the input
                    user_msgs = [m for m in messages if m.get('role') == 'user']
                    if user_msgs:
                        last_user_msg = user_msgs[-1].get('content', '')
                        self.history.add_exchange(last_user_msg, out["text"])
            
            return out

        except Exception as e:
            logger.error("Error calling Gemini via OpenAI SDK: %s. Falling back to MOCK.", e)
            return self._mock_generate(messages, tools)

    # ========== History Management Methods ==========
    
    def add_system_message(self, content: str) -> None:
        """Add a system message to history"""
        if self.history:
            self.history.add_message("system", content)
            
    def add_user_message(self, content: str) -> None:
        """Add a user message to history"""
        if self.history:
            self.history.add_message("user", content)
            
    def add_assistant_message(self, content: str) -> None:
        """Add an assistant message to history"""
        if self.history:
            self.history.add_message("assistant", content)
            
    def clear_history(self) -> None:
        """Clear all chat history"""
        if self.history:
            self.history.clear()
            logger.info("Chat history cleared")
            
    def get_history(self, include_timestamps: bool = False) -> List[Dict]:
        """Get all messages in history"""
        if self.history:
            return self.history.get_messages(include_timestamps)
        return []
        
    def save_history(self, filepath: str = None) -> Optional[str]:
        """Save chat history to file"""
        if self.history:
            return self.history.save_to_file(filepath)
        return None
        
    def load_history(self, filepath: str) -> None:
        """Load chat history from file"""
        if self.history:
            self.history.load_from_file(filepath)
        else:
            logger.warning("History is disabled, cannot load from file")
            
    def get_history_summary(self) -> Dict[str, Any]:
        """Get a summary of the chat history"""
        if self.history:
            return self.history.get_summary()
        return {"message": "History is disabled"}
        
    def set_history_context(self, context_messages: List[Dict]) -> None:
        """
        Set initial context for the conversation
        Useful for providing background information or instructions
        """
        if self.history:
            self.clear_history()
            for msg in context_messages:
                role = msg.get('role', 'user')
                content = msg.get('content', '')
                self.history.add_message(role, content)
            logger.info(f"Set history context with {len(context_messages)} messages")

    async def agenerate(self, *args, **kwargs):
        import asyncio
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, lambda: self.generate(*args, **kwargs))