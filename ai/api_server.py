"""
FLASK API ENDPOINT - TFT PREDICTION SERVICE (PRODUCTION READY)
Port: 5001 (để không conflict với backend 8000)
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
from realtime_predict import RealtimePredictor
from functools import lru_cache
from datetime import datetime, timedelta
import json
import logging
import os
from dotenv import load_dotenv

load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Initialize predictor globally (singleton pattern)
predictor = RealtimePredictor(
    backend_url="http://localhost:8000",
    model_repo="8qii/my-tft-backup",
    token=os.getenv("HUGGING_FACE_TOKEN")
)

# Cache for market context (refresh every 4 hours)
market_context_cache = {
    'data': None,
    'timestamp': None,
    'ttl': timedelta(hours=4)
}

# Load model khi start server
logger.info("🚀 Starting TFT Prediction Service...")
predictor.load_model()
logger.info("✅ Model loaded! Ready to serve predictions.")

def get_cached_context():
    """Lấy market context từ cache hoặc fetch mới"""
    now = datetime.now()
    
    if (market_context_cache['data'] is None or 
        market_context_cache['timestamp'] is None or
        now - market_context_cache['timestamp'] > market_context_cache['ttl']):
        
        logger.info("♻️ Refreshing market context cache...")
        market_context_cache['data'] = predictor.fetch_market_context(limit=60)
        market_context_cache['timestamp'] = now
        logger.info("✅ Market context cached")
    
    return market_context_cache['data']

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "model_loaded": predictor.model is not None,
        "device": str(predictor.device),
        "context_cached": market_context_cache['data'] is not None,
        "timestamp": datetime.now().isoformat()
    })

@app.route('/predict', methods=['POST'])
def predict():
    """
    Main prediction endpoint - PRODUCTION READY
    
    Request Body:
    {
        "symbol": "MSFT",
        "asset_type": "stock",  // optional, default: "stock"
        "candles": [
            {"ts": "2025-11-13T14:30:00.000Z", "open": 510.31, "high": 513.5, "low": 501.29, "close": 503.29, "volume": 25273100},
            ... (tối thiểu 30 candles, khuyến nghị 50-60 để đề phòng duplicate)
        ]
    }
    
    Response:
    {
        "symbol": "MSFT",
        "last_update": "2025-12-19",
        "last_close": 485.92,
        "forecast": [
            {"date": "2025-12-20", "predicted_price": 487.5, "log_return": 0.003, "confidence_intervals": {...}},
            ...
        ],
        "overall_trend": "Bullish",
        "processing_time_ms": 1234
    }
    """
    start_time = datetime.now()
    
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data:
            logger.warning("Empty request body")
            return jsonify({"error": "Empty request body"}), 400
            
        if 'symbol' not in data:
            logger.warning("Missing symbol field")
            return jsonify({"error": "Missing required field: symbol"}), 400
            
        if 'candles' not in data:
            logger.warning("Missing candles field")
            return jsonify({"error": "Missing required field: candles"}), 400
        
        candles = data['candles']
        if not isinstance(candles, list) or len(candles) < 30:
            logger.warning(f"Insufficient candles: {len(candles) if isinstance(candles, list) else 'invalid'}")
            return jsonify({
                "error": f"Insufficient data: {len(candles)} candles provided, need at least 30 (recommend 50-60)"
            }), 400
        
        # Extract parameters
        symbol = data['symbol']
        asset_type = data.get('asset_type', 'stock')
        
        logger.info(f"📊 Prediction request: {symbol} ({asset_type}) with {len(candles)} candles")
        
        # Pre-warm cache
        get_cached_context()
        
        # Make prediction
        result = predictor.predict(
            candles=candles,
            symbol=symbol,
            asset_type=asset_type
        )
        
        # Check for errors in result
        if 'error' in result:
            logger.error(f"Prediction error for {symbol}: {result['error']}")
            return jsonify(result), 400
        
        # Add processing time
        processing_time = (datetime.now() - start_time).total_seconds() * 1000
        result['processing_time_ms'] = round(processing_time, 2)
        
        logger.info(f"✅ Prediction completed for {symbol} in {processing_time:.0f}ms")
        return jsonify(result), 200
        
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        return jsonify({
            "error": str(e),
            "type": type(e).__name__
        }), 500

@app.route('/predict/batch', methods=['POST'])
def predict_batch():
    """
    Batch prediction endpoint - Dự đoán nhiều mã cùng lúc
    
    Request Body:
    {
        "requests": [
            {"symbol": "MSFT", "asset_type": "stock", "candles": [...]},
            {"symbol": "AAPL", "asset_type": "stock", "candles": [...]},
            ...
        ]
    }
    
    Response:
    {
        "success_count": 2,
        "error_count": 0,
        "total_processing_time_ms": 5678,
        "results": [...],
        "errors": []
    }
    """
    start_time = datetime.now()
    
    try:
        data = request.get_json()
        
        if not data or 'requests' not in data:
            logger.warning("Missing 'requests' field in batch")
            return jsonify({"error": "Missing 'requests' field"}), 400
        
        # Pre-warm cache once for all predictions
        get_cached_context()
        
        results = []
        errors = []
        
        logger.info(f"📦 Batch prediction: {len(data['requests'])} requests")
        
        for idx, req in enumerate(data['requests']):
            try:
                symbol = req.get('symbol')
                candles = req.get('candles')
                asset_type = req.get('asset_type', 'stock')
                
                if not symbol or not candles:
                    errors.append({
                        "index": idx,
                        "symbol": symbol,
                        "error": "Missing symbol or candles"
                    })
                    continue
                
                if len(candles) < 30:
                    errors.append({
                        "index": idx,
                        "symbol": symbol,
                        "error": f"Insufficient data: {len(candles)} candles"
                    })
                    continue
                
                result = predictor.predict(candles, symbol, asset_type)
                
                if 'error' in result:
                    errors.append({
                        "index": idx,
                        "symbol": symbol,
                        "error": result['error']
                    })
                else:
                    results.append(result)
                
            except Exception as e:
                logger.error(f"Error in batch item {idx}: {str(e)}")
                errors.append({
                    "index": idx,
                    "symbol": req.get('symbol'),
                    "error": str(e)
                })
        
        processing_time = (datetime.now() - start_time).total_seconds() * 1000
        
        logger.info(f"✅ Batch completed: {len(results)} success, {len(errors)} errors in {processing_time:.0f}ms")
        
        return jsonify({
            "success_count": len(results),
            "error_count": len(errors),
            "total_processing_time_ms": round(processing_time, 2),
            "results": results,
            "errors": errors
        }), 200
        
    except Exception as e:
        logger.error(f"Batch error: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    logger.info("🌐 Starting Flask server on port 5001...")
    logger.info("💡 Use Ctrl+C to stop")
    app.run(host='0.0.0.0', port=5001, debug=False, threaded=True)
