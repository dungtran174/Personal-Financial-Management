# finance_agent/agent.py
import json
import logging
import datetime
import re
import inspect
from collections import defaultdict, deque
from typing import List, Dict, Any, Tuple, Callable, Optional

from .models import SubQuestion
from .utils import configure_logging
from .gemini_wrapper import GeminiWrapper
from .tool_registry import registry
from .vector_index import build_tool_vector_index_from_registry
from .prompts import (
    GENERATE_SUBQUESTION_SYSTEM_PROMPT_TEMPLATE,
    SUBQUESTION_ANSWER_PROMPT,
    FINAL_ANSWER_PROMPT,
)

logger = logging.getLogger(__name__)

PLACEHOLDER_PATTERN = re.compile(r"\{\{\s*([A-Z0-9_]+)\s*\}\}")


def topo_sort_subquestions(subquestions: List[Dict]) -> List[Dict]:
    id_map = {sq["id"]: sq for sq in subquestions}
    indeg = {sq["id"]: 0 for sq in subquestions}
    g = defaultdict(list)
    for sq in subquestions:
        for dep in sq.get("depends_on", []) or []:
            if dep not in id_map:
                raise ValueError(f"Invalid dependency: {dep} referenced by {sq['id']}")
            g[dep].append(sq["id"])
            indeg[sq["id"]] += 1
    q = deque([nid for nid, d in indeg.items() if d == 0])
    result = []
    while q:
        nid = q.popleft()
        result.append(id_map[nid])
        for nei in g[nid]:
            indeg[nei] -= 1
            if indeg[nei] == 0:
                q.append(nei)
    if len(result) != len(subquestions):
        raise ValueError("Cycle detected or missing nodes in dependencies")
    return result


def extract_placeholders(text: str) -> List[str]:
    return [m.group(1) for m in PLACEHOLDER_PATTERN.finditer(text)]


def resolve_placeholders(
    question_text: str, answered_by_id: Dict[int, dict]
) -> Tuple[str, List[str]]:
    missing = []

    def repl(match):
        key = match.group(1)  # e.g., TICKER_FROM_Q1
        m2 = re.match(r"(.+)_FROM_Q(\d+)$", key)
        if m2:
            field_name, sid = m2.group(1), int(m2.group(2))
            ans = answered_by_id.get(sid)
            if not ans:
                missing.append(key)
                return match.group(0)
            ed = ans.get("extracted_data") or {}
            value = None
            if isinstance(ed, dict):
                value = ed.get(field_name.lower()) or ed.get(field_name)
            a = ans.get("answer")
            if value is None and isinstance(a, dict):
                v = a.get(field_name.lower()) or a.get(field_name)
                if v:
                    value = v
            if value is None and isinstance(a, str):
                txt = a.strip()
                # try to parse trailing tokens
                if ":" in txt:
                    parts = txt.split(":")
                    value = parts[-1].strip().split()[0]
                else:
                    value = txt.split()[0] if txt.split() else None
            if value is None:
                missing.append(key)
                return match.group(0)
            return str(value)
        else:
            missing.append(key)
            return match.group(0)

    resolved = PLACEHOLDER_PATTERN.sub(repl, question_text)
    return resolved, missing


# ----- Utility: normalize arguments to tool signature -----
def _try_parse_arguments(arg_blob: Any) -> Dict[str, Any]:
    """
    If arg_blob is a string that looks like JSON, try to parse it.
    If it's already a dict, return as-is.
    """
    if isinstance(arg_blob, dict):
        return arg_blob
    if not arg_blob:
        return {}
    if isinstance(arg_blob, str):
        s = arg_blob.strip()
        # strip surrounding code fences/backticks
        if s.startswith("```"):
            s = re.sub(r"^```[a-zA-Z0-9]*\n?", "", s)
            s = re.sub(r"```$", "", s)
            s = s.strip()
        # try parsing
        try:
            parsed = json.loads(s)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            # try simple key=value pairs fallback
            try:
                # naive parse: key1=val1,key2=val2
                parts = re.split(r"[,;\n]", s)
                out = {}
                for p in parts:
                    if "=" in p:
                        k, v = p.split("=", 1)
                        out[k.strip()] = v.strip()
                if out:
                    return out
            except Exception:
                pass
    return {}


def _map_aliases_to_signature(args: Dict[str, Any], func: Callable) -> Dict[str, Any]:
    """
    Given raw args (possibly containing aliases like ticker_symbol), map them to real
    parameter names from func signature when possible.
    Strategy:
      - inspect signature param names
      - define common alias mapping heuristics
      - if an alias key matches, map to the canonical param name
      - drop unknown keys (but keep them if they match)
    """
    sig = inspect.signature(func)
    param_names = [pname for pname in sig.parameters.keys() if sig.parameters[pname].kind in (inspect.Parameter.POSITIONAL_OR_KEYWORD, inspect.Parameter.KEYWORD_ONLY)]
    # build simple alias rules
    alias_map = {
        # ticker aliases
        "ticker_symbol": "ticker",
        "stock_ticker": "ticker",
        "stock_symbol": "ticker",
        "symbol": "ticker",
        "ticker": "ticker",
        # company aliases
        "company_name": "company_name",
        "company": "company_name",
        "name": "company_name",
        # country aliases
        "country": "country",
        "country_code": "country_code",
        "country_name": "country",
        # indicator/metric aliases
        "indicator": "indicator",
        "metric": "indicator",
        # generic
        "query": "query",
        "q": "query",
        "start_date": "start_date",
        "end_date": "end_date",
        "date": "date",
        "period": "period",
        "exchange": "exchange",
        "from_currency": "from_currency",
        "to_currency": "to_currency",
        "amount": "amount",
    }
    mapped: Dict[str, Any] = {}
    # first, copy direct matches
    for k, v in args.items():
        if k in param_names:
            mapped[k] = v
    # then aliases
    for k, v in args.items():
        if k in mapped:
            continue
        lower = k.lower()
        if lower in alias_map and alias_map[lower] in param_names:
            mapped[alias_map[lower]] = v
            continue
        # try fuzzy: find param that contains token
        for p in param_names:
            if lower == p.lower():
                mapped[p] = v
                break
        else:
            # try mapping common patterns: e.g. "tickerSymbol" -> ticker
            for alias_k, target in alias_map.items():
                if alias_k.lower() == lower and target in param_names:
                    mapped[target] = v
                    break
    # finally, if mapped empty but func expects a single param, try to place value there
    if not mapped and param_names and len(param_names) == 1:
        mapped[param_names[0]] = next(iter(args.values()))
    return mapped


class FinancialAgent:
    def __init__(self, model: str = "google/gemini-2.5-flash", verbose: bool = True, lazy_load: bool = True):
        configure_logging(verbose)
        self.gemini = GeminiWrapper(model=model, enable_history=False)  # We manage history at agent level
        self.registry = registry
        self._tool_index = None  # Lazy loaded
        self.lazy_load = lazy_load
        
        # Build tool index immediately if not lazy loading
        if not lazy_load:
            self._build_tool_index()
        
        # Conversation history for this agent instance
        self.conversation_history: List[Dict[str, str]] = []
        
        # Callback for tool execution events
        self.tool_callback = None
    
    def _build_tool_index(self):
        """Build tool index on demand"""
        if self._tool_index is None:
            try:
                self._tool_index = build_tool_vector_index_from_registry(self.registry)
            except Exception as e:
                logger.warning("Failed to build tool vector index: %s. Continuing without index.", e)
                self._tool_index = False  # Mark as failed
    
    @property
    def tool_index(self):
        """Lazy load tool index when first accessed"""
        if self._tool_index is None and self.lazy_load:
            self._build_tool_index()
        return self._tool_index if self._tool_index else None

    def _clean_json_str(self, raw: str) -> str:
        """Loại bỏ code fence ```json ... ``` nếu có."""
        if raw is None:
            return ""
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```[a-zA-Z0-9]*\n?", "", cleaned)
            cleaned = re.sub(r"```$", "", cleaned)
        return cleaned.strip()

    def generate_subquestions_from_query(self, user_query: str) -> List[SubQuestion]:
        # Build context from conversation history
        context_str = ""
        if self.conversation_history:
            context_str = "\n\nConversation context (previous exchanges):\n"
            for i, exchange in enumerate(self.conversation_history[-3:], 1):  # Last 3 exchanges
                context_str += f"\nExchange {i}:\n"
                context_str += f"User: {exchange['user_query']}\n"
                context_str += f"Assistant: {exchange['assistant_response'][:200]}...\n"  # Truncate for brevity
        
        prompt = (
            GENERATE_SUBQUESTION_SYSTEM_PROMPT_TEMPLATE
            + context_str
            + f"\n\nCurrent user query:\n{user_query}\n"
        )
        msgs = [
            {"role": "system", "content": GENERATE_SUBQUESTION_SYSTEM_PROMPT_TEMPLATE},
            {"role": "user", "content": prompt},
        ]
        out = self.gemini.generate(msgs, tools=None, use_history=False, save_to_history=False)
        raw_text = out.get("text") or "[]"
        cleaned = self._clean_json_str(raw_text)
        try:
            j = json.loads(cleaned)
            subs = j.get("subquestions", [])
            return [SubQuestion(**s) for s in subs]
        except Exception as e:
            logger.warning("Failed to parse subquestions JSON: %s. Raw was: %s", e, raw_text)
            # fallback: single subquestion
            return [SubQuestion(id=1, question=user_query, depends_on=[])]

    def _search_tools(self, resolved_subquestion: str, answered_subquestions: List[dict]) -> List:
        tools = []
        
        if self.tool_index is None:
            logger.warning("Tool index not available, falling back to heuristic search only")
        else:
            hits = self.tool_index.similarity_search(resolved_subquestion, k=4)
            for doc in hits:
                name = doc.metadata.get("tool_name")
                meta = self.registry.get(name)
                if meta:
                    tools.append(meta.func)

        q = resolved_subquestion.lower()

        # ========== Enhanced Heuristic Rules ==========
        
        # Stock symbol lookup
        if "mã cổ phiếu" in q or "ticker" in q or "symbol" in q or "mã chứng khoán" in q:
            sym = self.registry.get("get_stock_symbol")
            if sym and sym.func not in tools:
                tools.insert(0, sym.func)

        # Sector/Industry classification
        if "ngành" in q or "sector" in q or "industry" in q or "lĩnh vực" in q or "thuộc ngành" in q:
            sector = self.registry.get("get_sector_mapping")
            if sector and sector.func not in tools:
                tools.insert(0, sector.func)

        # Macro economic data
        if any(word in q for word in ["lạm phát", "inflation", "cpi", "gdp", "thất nghiệp", "unemployment", 
                                       "lãi suất", "interest rate", "vĩ mô", "macro", "kinh tế vĩ mô"]):
            macro = self.registry.get("get_macro_data")
            if macro and macro.func not in tools:
                tools.insert(0, macro.func)

        # Exchange information
        if "sàn" in q or "exchange" in q or ("hose" in q or "hnx" in q or "upcom" in q):
            exchange = self.registry.get("get_exchange_info")
            if exchange and exchange.func not in tools:
                tools.insert(0, exchange.func)

        # Currency exchange rate
        if any(word in q for word in ["tỷ giá", "exchange rate", "usd", "vnd", "currency", "đô la", "đồng"]):
            currency = self.registry.get("get_currency_rate")
            if currency and currency.func not in tools:
                tools.insert(0, currency.func)

        # Income statement / Revenue
        if any(word in q for word in ["doanh thu", "revenue", "lợi nhuận", "profit", "earnings", "income statement", 
                                       "kết quả kinh doanh", "ebitda", "net income"]):
            income = self.registry.get("get_income_statement")
            if income and income.func not in tools:
                tools.insert(0, income.func)

        # Balance sheet / Equity / Assets
        if any(word in q for word in ["vốn chủ", "equity", "tài sản", "assets", "nợ", "debt", "liabilities", 
                                       "bảng cân đối", "balance sheet", "shareholders equity", "total assets"]):
            balance = self.registry.get("get_balance_sheet")
            if balance and balance.func not in tools:
                tools.insert(0, balance.func)

        # Cash flow analysis
        if any(word in q for word in ["dòng tiền", "cash flow", "operating cash", "free cash flow", "fcf", 
                                       "investing cash", "financing cash"]):
            cashflow = self.registry.get("analyze_cashflow")
            if cashflow and cashflow.func not in tools:
                tools.insert(0, cashflow.func)

        # Financial ratios
        if any(word in q for word in ["roe", "roa", "pe", "p/e", "pb", "p/b", "eps", "tỷ số", "chỉ số tài chính",
                                       "tỷ lệ", "margin", "biên lợi nhuận"]):
            ratios = self.registry.get("calculate_ratios")
            if ratios and ratios.func not in tools:
                tools.insert(0, ratios.func)

        # Valuation / Fair value
        if any(word in q for word in ["định giá", "valuation", "fair value", "giá trị hợp lý", "dcf", "ddm", "peg"]):
            valuation = self.registry.get("estimate_fair_value")
            if valuation and valuation.func not in tools:
                tools.insert(0, valuation.func)

        # Technical indicators
        if any(word in q for word in ["rsi", "macd", "ma", "moving average", "bollinger", "technical", 
                                       "chỉ báo kỹ thuật", "đường trung bình"]):
            technical = self.registry.get("get_technical_indicators")
            if technical and technical.func not in tools:
                tools.insert(0, technical.func)

        # Chart / Graph / Visualization
        if any(word in q for word in ["biểu đồ", "chart", "graph", "vẽ", "draw", "plot", "visualize", 
                                       "biến động giá", "price movement", "price chart", "lịch sử giá"]):
            chart = self.registry.get("generate_stock_price_chart")
            if chart and chart.func not in tools:
                tools.insert(0, chart.func)
        
        # Price / Stock price
        if any(word in q for word in ["giá", "price", "stock price", "giá cổ phiếu", "thị giá"]):
            price = self.registry.get("get_stock_price")
            if price and price.func not in tools:
                tools.insert(0, price.func)

        # Fundamental analysis
        if "thông tin cơ bản" in q or "fundamental" in q or "profile" in q:
            fund = self.registry.get("get_fundamentals")
            if fund and fund.func not in tools:
                tools.insert(0, fund.func)

        # Risk metrics
        if any(word in q for word in ["risk", "volatility", "beta", "sharpe", "sortino", "drawdown", "var", 
                                       "rủi ro", "biến động"]):
            risk = self.registry.get("get_risk_metrics")
            if risk and risk.func not in tools:
                tools.insert(0, risk.func)

        # ========== PFM Tools Heuristics ==========
        
        # PFM: Expense
        if any(word in q for word in ["chi tiêu", "expense", "spending", "cost", "mua", "trả tiền", "tốn", "spend", "chi"]):
            # Check if it's adding or searching
            if any(w in q for w in ["thêm", "add", "new", "tạo", "ghi", "vừa"]):
                tool = self.registry.get("pfm_add_expense")
                if tool and tool.func not in tools:
                    tools.insert(0, tool.func)
            # Also add search if not explicitly adding, or as fallback
            tool = self.registry.get("pfm_search_expenses")
            if tool and tool.func not in tools:
                tools.append(tool.func)
                
        # PFM: Income
        if any(word in q for word in ["thu nhập", "income", "lương", "salary", "bonus", "thưởng", "kiếm được", "nhận được"]):
            if any(w in q for w in ["thêm", "add", "new", "tạo", "ghi", "vừa"]):
                tool = self.registry.get("pfm_add_income")
                if tool and tool.func not in tools:
                    tools.insert(0, tool.func)
            tool = self.registry.get("pfm_search_incomes")
            if tool and tool.func not in tools:
                tools.append(tool.func)

        # PFM: Dashboard/Summary
        if any(word in q for word in ["tài chính", "financial", "balance", "số dư", "tổng kết", "summary", "báo cáo", "report", "tiền"]):
            tool = self.registry.get("pfm_get_financial_summary")
            if tool and tool.func not in tools:
                tools.insert(0, tool.func)
            tool = self.registry.get("pfm_get_report_by_time")
            if tool and tool.func not in tools:
                tools.append(tool.func)

        # PFM: Watchlist
        if any(word in q for word in ["watchlist", "theo dõi", "track", "quan tâm", "danh sách"]):
            if any(w in q for w in ["thêm", "add", "new"]):
                tool = self.registry.get("pfm_add_to_watchlist")
                if tool and tool.func not in tools:
                    tools.insert(0, tool.func)
            elif any(w in q for w in ["xóa", "remove", "delete", "bỏ"]):
                tool = self.registry.get("pfm_remove_from_watchlist")
                if tool and tool.func not in tools:
                    tools.insert(0, tool.func)
            
            tool = self.registry.get("pfm_get_watchlist")
            if tool and tool.func not in tools:
                tools.append(tool.func)

        return tools


    def _call_callable(self, func: Callable, args: Dict[str, Any], token: Optional[str] = None):
        # Inject token if the function expects it
        sig = inspect.signature(func)
        if "token" in sig.parameters and token:
            args["token"] = token
            
        # call function with mapped args
        return func(**(args or {}))

    def _subquestion_prompt_msgs(
        self, id: int, resolved_question: str, dependencies: List[dict], user_query: str
    ):
        dep_str = json.dumps(dependencies, ensure_ascii=False, default=str)
        
        # Add conversation context
        context_str = ""
        if self.conversation_history:
            context_str = "\n\nConversation context (recent history):\n"
            for i, exchange in enumerate(self.conversation_history[-2:], 1):  # Last 2 exchanges
                context_str += f"Q{i}: {exchange['user_query']}\n"
                context_str += f"A{i}: {exchange['assistant_response'][:150]}...\n"
        
        content = SUBQUESTION_ANSWER_PROMPT
        content = content.replace("{current_datetime}", datetime.datetime.utcnow().isoformat())
        content = content.replace("{id}", str(id))
        content = content.replace("{subquestion}", resolved_question)
        content = content.replace("{dependencies}", dep_str)
        content = content.replace("{user_query}", user_query)
        content += context_str
        
        msgs = [
            {"role": "system", "content": "You are a financial assistant."},
            {"role": "user", "content": content},
        ]
        return msgs

    def answer(self, user_query: str, token: Optional[str] = None) -> dict:
        subs = self.generate_subquestions_from_query(user_query)
        subs_raw = [s.dict() for s in subs]
        ordered = topo_sort_subquestions(subs_raw)
        answered_by_id: Dict[int, dict] = {}

        for sq in ordered:
            sq_id = sq["id"]
            deps = [answered_by_id[d] for d in (sq.get("depends_on") or []) if d in answered_by_id]
            resolved_text, missing = resolve_placeholders(sq["question"], answered_by_id)
            if missing:
                ans_obj = {
                    "id": sq_id,
                    "answer": f"SKIP: missing placeholders {missing}",
                    "used_tools": [],
                    "extracted_data": {},
                }
                answered_by_id[sq_id] = ans_obj
                continue

            tools = self._search_tools(resolved_text, list(answered_by_id.values()))
            msgs = self._subquestion_prompt_msgs(sq_id, resolved_text, deps, user_query)

            # if no tool appropriate, ask LLM normally
            if not tools:
                out = self.gemini.generate(msgs, tools=None, use_history=False, save_to_history=False)
                ans_text = out.get("text") or ""
                ans_obj = {"id": sq_id, "answer": ans_text, "used_tools": [], "extracted_data": {}}
                answered_by_id[sq_id] = ans_obj
                continue

            # --- ask LLM with tool metadata (tools passed to wrapper may be used in function_call detection) ---
            out = self.gemini.generate(msgs, tools=tools, function_call="auto", use_history=False, save_to_history=False)
            raw_text = out.get("text")
            fc = out.get("function_call")

            # if LLM embedded function_call in text as JSON, try to parse it
            if not fc and raw_text:
                cleaned = self._clean_json_str(raw_text)
                try:
                    parsed = json.loads(cleaned)
                    if isinstance(parsed, dict) and "function_call" in parsed:
                        fc = parsed["function_call"]
                        logger.debug("Parsed function_call from text JSON: %s", fc)
                except Exception:
                    # sometimes LLM returns bare function call dict w/o wrapper; attempt to detect
                    try:
                        parsed2 = json.loads(cleaned)
                        if isinstance(parsed2, dict) and "name" in parsed2 and "arguments" in parsed2:
                            fc = parsed2
                            logger.debug("Parsed direct function_call-like dict from text: %s", fc)
                    except Exception:
                        pass

            # If we have a function_call directive, execute the tool
            if fc:
                fname = fc.get("name")
                fargs_raw = fc.get("arguments") or {}
                # fargs may be stringified JSON
                if isinstance(fargs_raw, str):
                    fargs = _try_parse_arguments(fargs_raw)
                else:
                    fargs = dict(fargs_raw)

                # locate tool in registry
                meta = self.registry.get(fname) if fname else None
                # if not found by name, try to pick first tool from 'tools' list
                chosen_func = meta.func if meta else (tools[0] if tools else None)
                chosen_name = meta.name if meta else (getattr(chosen_func, "__name__", "unknown") if chosen_func else "unknown")

                # map aliases to real signature names
                try:
                    mapped_args = _map_aliases_to_signature(fargs, chosen_func) if chosen_func else fargs
                except Exception as e:
                    logger.debug("Failed to map args for %s: %s. Using raw args.", fname or "unknown", e)
                    mapped_args = fargs

                logger.info("Calling tool %s with args %s (raw=%s)", chosen_name, mapped_args, fargs_raw)
                
                # Trigger tool callback if set
                if self.tool_callback:
                    self.tool_callback({
                        "type": "tool_start",
                        "tool_name": chosen_name,
                        "question": resolved_text,
                        "args": mapped_args
                    })
                
                try:
                    # execute
                    result = self._call_callable(chosen_func, mapped_args, token=token)
                    extracted = result if isinstance(result, dict) else {"result": result}
                    
                    # Trigger tool completion callback
                    if self.tool_callback:
                        self.tool_callback({
                            "type": "tool_complete",
                            "tool_name": chosen_name,
                            "result": extracted
                        })
                    # give the LLM the tool output for finalization / commentary
                    follow_msgs = msgs + [
                        {
                            "role": "assistant",
                            "content": f"Tool {chosen_name} returned: {json.dumps(extracted, ensure_ascii=False)}",
                        }
                    ]
                    out2 = self.gemini.generate(follow_msgs, tools=None, use_history=False, save_to_history=False)
                    final_text = out2.get("text") or str(extracted)
                    ans_obj = {
                        "id": sq_id,
                        "answer": final_text,
                        "used_tools": [chosen_name],
                        "extracted_data": extracted,
                    }
                    answered_by_id[sq_id] = ans_obj
                except Exception as e:
                    logger.exception("Tool execution error for %s: %s", chosen_name, e)
                    ans_obj = {
                        "id": sq_id,
                        "answer": f"ERROR executing tool {chosen_name}: {e}",
                        "used_tools": [chosen_name],
                        "extracted_data": {},
                    }
                    answered_by_id[sq_id] = ans_obj
            else:
                # no function call from LLM - store raw_text as answer
                ans_obj = {
                    "id": sq_id,
                    "answer": raw_text,
                    "used_tools": [],
                    "extracted_data": {},
                }
                answered_by_id[sq_id] = ans_obj

        # final aggregation prompt
        # Add conversation context for better coherence
        context_str = ""
        if self.conversation_history:
            context_str = "\n\nConversation context:\n"
            for exchange in self.conversation_history[-2:]:
                context_str += f"Previous Q: {exchange['user_query']}\n"
                context_str += f"Previous A: {exchange['assistant_response'][:200]}...\n\n"
        
        final_prompt = (
            FINAL_ANSWER_PROMPT
            + context_str
            + f"\n\nCâu hỏi hiện tại:\n{user_query}\n\n"
            + f"Các subquestions và kết quả:\n{json.dumps(list(answered_by_id.values()), ensure_ascii=False)}\n\n"
        )
        final_msgs = [
            {"role": "system", "content": "Bạn là một trợ lý tài chính."},
            {"role": "user", "content": final_prompt},
        ]
        final_out = self.gemini.generate(final_msgs, tools=None, use_history=False, save_to_history=False)
        final_text = final_out.get("text") or "No final text"
        
        # Save this exchange to conversation history
        self.conversation_history.append({
            "user_query": user_query,
            "assistant_response": final_text,
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "answered_subquestions": list(answered_by_id.values())
        })
        
        # Keep only last 10 exchanges to avoid context overflow
        if len(self.conversation_history) > 10:
            self.conversation_history = self.conversation_history[-10:]
        
        return {
            "report": final_text, 
            "answered_subquestions": list(answered_by_id.values()),
            "subquestions": subs_raw  # Include original subquestions for debugging
        }
    
    def get_conversation_history(self) -> List[Dict[str, Any]]:
        """Get the conversation history for this agent instance."""
        return self.conversation_history.copy()
    
    def clear_conversation_history(self) -> None:
        """Clear the conversation history for this agent instance."""
        self.conversation_history = []
        logger.info("Conversation history cleared")
    
    def get_conversation_summary(self) -> Dict[str, Any]:
        """Get a summary of the conversation history."""
        return {
            "total_exchanges": len(self.conversation_history),
            "first_exchange_time": self.conversation_history[0]["timestamp"] if self.conversation_history else None,
            "last_exchange_time": self.conversation_history[-1]["timestamp"] if self.conversation_history else None,
        }