import sys
import io
import uuid
import json
import asyncio
from typing import Dict, Optional, AsyncGenerator
from datetime import datetime

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from openai import OpenAI

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')

from finance_agent.agent import FinancialAgent

app = FastAPI(title="Financial Chatbot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions: Dict[str, dict] = {}


class InitRequest(BaseModel):
    user_id: Optional[str] = None


class InitResponse(BaseModel):
    session_id: str
    message: str
    timestamp: str


class ChatRequest(BaseModel):
    session_id: str
    message: str
    model: Optional[str] = None  # Add model parameter
    token: Optional[str] = None  # JWT token for authenticated tools


class ChatResponse(BaseModel):
    session_id: str
    message: str
    report: str
    answered_subquestions: list
    timestamp: str


@app.post("/api/init", response_model=InitResponse)
async def init_session(request: InitRequest):
    try:
        session_id = str(uuid.uuid4())
        # Use lazy loading to speed up initialization
        agent = FinancialAgent(verbose=False, lazy_load=True)
        
        sessions[session_id] = {
            "agent": agent,
            "user_id": request.user_id,
            "created_at": datetime.now().isoformat(),
            "history": [],
            "tool_events": []  # Store tool execution events for streaming
        }
        
        return InitResponse(
            session_id=session_id,
            message="Session initialized successfully",
            timestamp=datetime.now().isoformat()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to initialize session: {str(e)}")


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    if request.session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found. Please initialize a session first.")
    
    if not request.message or not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    
    try:
        session = sessions[request.session_id]
        agent = session["agent"]
        
        # Update model if provided and different from current
        if request.model:
            model_name = request.model
            # Map frontend model names to backend model names
            if model_name == "google/gemini-2.5-flash":
                model_name = "google/gemini-2.0-flash-001"  # Map to actual model name
            elif model_name == "google/gemini-2.5-pro":
                model_name = "gemini-1.5-pro"  # Map to actual model name
                
            # Update the model in the existing agent's gemini wrapper
            if hasattr(agent.gemini, 'model') and agent.gemini.model != model_name:
                agent.gemini.model = model_name
                import os
                api_key = os.getenv("GEMINI_API_KEY")
                agent.gemini.client = OpenAI(
                    api_key=api_key,
                    base_url="https://openrouter.ai/api/v1"
                )
                session["current_model"] = request.model
        
        result = agent.answer(request.message, token=request.token)
        
        session["history"].append({
            "user_message": request.message,
            "bot_response": result,
            "timestamp": datetime.now().isoformat()
        })
        
        return ChatResponse(
            session_id=request.session_id,
            message=request.message,
            report=result["report"],
            answered_subquestions=result["answered_subquestions"],
            timestamp=datetime.now().isoformat()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process message: {str(e)}")


async def event_generator(session_id: str, message: str, model: Optional[str] = None, token: Optional[str] = None) -> AsyncGenerator[str, None]:
    """Generate server-sent events for streaming chat response"""
    if session_id not in sessions:
        yield f"data: {json.dumps({'error': 'Session not found'})}\n\n"
        return
    
    try:
        session = sessions[session_id]
        agent = session["agent"]
        
        # Update model if provided
        if model:
            model_name = model
            if model_name == "google/google/gemini-2.5-flash":
                model_name = "google/google/gemini-2.0-flash-001"  # Map to actual Gemini model name
            elif model_name == "google/google/gemini-2.5-pro":
                model_name = "google/gemini-2.0-pro"  # Map to actual Gemini model name
                
            if hasattr(agent.gemini, 'model') and agent.gemini.model != model_name:
                agent.gemini.model = model_name
                import os
                api_key = os.getenv("GEMINI_API_KEY")
                agent.gemini.client = OpenAI(
                    api_key=api_key,
                    base_url="https://openrouter.ai/api/v1"
                )
                session["current_model"] = model
        
        # Clear tool events for this session
        session["tool_events"] = []
        
        # Setup tool callback to capture events
        def tool_callback(event):
            session["tool_events"].append(event)
        
        agent.tool_callback = tool_callback
        
        # Send start event
        yield f"data: {json.dumps({'type': 'start', 'message': 'Processing your request...'})}\n\n"
        
        # Generate subquestions event
        yield f"data: {json.dumps({'type': 'reasoning', 'message': 'Analyzing your question and breaking it down...'})}\n\n"
        
        # Create async task to process answer and stream tool events
        import threading
        import queue
        
        result = {}
        event_queue = queue.Queue()
        
        def process_answer():
            nonlocal result
            # Set up callback to put events in queue
            def callback(event):
                event_queue.put(event)
            agent.tool_callback = callback
            result = agent.answer(message, token=token)
            event_queue.put(None)  # Signal completion
        
        # Start processing in thread
        thread = threading.Thread(target=process_answer)
        thread.start()
        
        # Stream events as they come
        while True:
            try:
                # Check for events with timeout
                event = event_queue.get(timeout=0.1)
                
                if event is None:  # Processing complete
                    break
                    
                if event["type"] == "tool_start":
                    yield f"data: {json.dumps({'type': 'tool_call', 'tool': event['tool_name'], 'question': event.get('question', '')})}\n\n"
                elif event["type"] == "tool_complete":
                    yield f"data: {json.dumps({'type': 'tool_complete', 'tool': event['tool_name']})}\n\n"
                    
            except queue.Empty:
                await asyncio.sleep(0.05)  # Small delay before checking again
                
        # Wait for thread to complete
        thread.join()
        
        # Reset tool callback
        agent.tool_callback = None
        
        # Stream the final answer preserving formatting
        final_report = result.get("report", "")
        
        # Split text into chunks while preserving newlines
        chunks = []
        current_chunk = ""
        for char in final_report:
            current_chunk += char
            # Create chunk at space, newline, or punctuation
            if char in [' ', '\n', '.', ',', '!', '?', ';', ':'] or len(current_chunk) >= 10:
                chunks.append(current_chunk)
                current_chunk = ""
        
        if current_chunk:  # Add any remaining text
            chunks.append(current_chunk)
        
        streamed_text = ""
        for chunk in chunks:
            streamed_text += chunk
            yield f"data: {json.dumps({'type': 'content', 'content': streamed_text})}\n\n"
            await asyncio.sleep(0.02)  # Adjust speed of streaming
        
        # Send completion event
        yield f"data: {json.dumps({'type': 'done', 'final_report': final_report, 'answered_subquestions': result.get('answered_subquestions', [])})}\n\n"
        
        # Save to history
        session["history"].append({
            "user_message": message,
            "bot_response": result,
            "timestamp": datetime.now().isoformat()
        })
        
    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"


@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    """Stream chat responses using Server-Sent Events"""
    return StreamingResponse(
        event_generator(request.session_id, request.message, request.model, request.token),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disable proxy buffering
        }
    )


@app.get("/api/session/{session_id}")
async def get_session(session_id: str):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = sessions[session_id]
    agent = session["agent"]
    conversation_summary = agent.get_conversation_summary()
    
    return {
        "session_id": session_id,
        "user_id": session.get("user_id"),
        "created_at": session["created_at"],
        "history_count": len(session["history"]),
        "conversation_exchanges": conversation_summary.get("total_exchanges", 0),
        "last_exchange_time": conversation_summary.get("last_exchange_time")
    }


@app.get("/api/session/{session_id}/history")
async def get_conversation_history(session_id: str):
    """Get the conversation history for a session"""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = sessions[session_id]
    agent = session["agent"]
    history = agent.get_conversation_history()
    
    return {
        "session_id": session_id,
        "conversation_history": history,
        "total_exchanges": len(history)
    }


@app.delete("/api/session/{session_id}/history")
async def clear_conversation_history(session_id: str):
    """Clear the conversation history for a session (keeps the session alive)"""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = sessions[session_id]
    agent = session["agent"]
    agent.clear_conversation_history()
    
    return {
        "session_id": session_id,
        "message": "Conversation history cleared successfully"
    }


@app.delete("/api/session/{session_id}")
async def delete_session(session_id: str):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    del sessions[session_id]
    return {"message": "Session deleted successfully"}


@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "active_sessions": len(sessions),
        "timestamp": datetime.now().isoformat()
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8008)