import os
import json
import tempfile
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from detector.ml_detector import predict_image
from news_detector.news_logic import verify_news

app = Flask(__name__)

# Load CORS origins from environment variable
allowed_origins = os.getenv("DEEPSHIELD_ALLOWED_ORIGINS", "*").split(",")
CORS(app, origins=allowed_origins)

@app.route('/')
def home():
    return render_template("index.html")

@app.route('/analyze-news', methods=['POST'])
def analyze_news():
    data = request.json
    if not data:
        return jsonify({"success": False, "error": "No data provided"}), 400
    
    text = data.get("text")

    if not text:
        return jsonify({"success": False, "error": "No text provided"}), 400

    try:
        result = verify_news(text)
        return jsonify({"success": True, "result": result})
    except Exception as e:
        print(f"News verification error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/detect-image', methods=['POST'])
def detect_image():
    data = request.json
    if not data:
        return jsonify({"error": "No data provided"}), 400
        
    image_url = data.get("image_url")

    if not image_url:
        return jsonify({"error": "No image URL"}), 400

    try:
        result = predict_image(image_url)
        return jsonify(result)
    except Exception as e:
        print(f"Image detection error: {e}")
        return jsonify({"error": "Detection failed", "details": str(e)}), 500

@app.route('/upload', methods=['POST'])
def upload():
    file = request.files.get('file')

    if not file:
        return jsonify({"label": "ERROR", "confidence": 0})

    # Use tempfile for thread-safety
    with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
        file.save(tmp.name)
        tmp_path = tmp.name

    try:
        result = predict_image(tmp_path)
        return jsonify({
            "label": result.get("label", "REAL"),
            "confidence": result.get("confidence", 0)
        })
    except Exception as e:
        print(e)
        return jsonify({"label": "ERROR", "confidence": 0})
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)