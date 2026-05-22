import torch
import torch.nn as nn
from torchvision import models, transforms
import cv2
import numpy as np
import requests
import os

# =========================
# LOAD MODEL
# =========================
model = models.efficientnet_b0(pretrained=False)
model.classifier[1] = nn.Linear(model.classifier[1].in_features, 3)

MODEL_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "deepfake_model.pth")
if os.path.exists(MODEL_PATH):
    model.load_state_dict(torch.load(MODEL_PATH, map_location="cpu"))
model.eval()

# =========================
# TRANSFORM
# =========================
transform = transforms.Compose([
    transforms.ToPILImage(),
    transforms.Resize((224, 224)),
    transforms.ToTensor()
])

labels_map = ["REAL", "FAKE", "FILTERED"]

# =========================
# API CONFIG (FOR ENSEMBLE)
# =========================
API_URL = "https://api-inference.huggingface.co/models/umm-maybe/AI-image-detector"
HEADERS = {
    "Authorization": f"Bearer {os.getenv('HF_API_KEY', 'YOUR_API_KEY')}"
}

# =========================
# MAIN FUNCTION
# =========================
def predict_image(input_data):
    try:
        # 🔥 HANDLE URL (extension)
        if isinstance(input_data, str) and input_data.startswith("http"):
            resp = requests.get(input_data)
            img_array = np.frombuffer(resp.content, np.uint8)
            img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
            image_url = input_data
        # 🔥 HANDLE FILE (website)
        else:
            img = cv2.imread(input_data)
            image_url = None

        if img is None:
            return {"label": "ERROR", "confidence": 0}

        # 1. LOCAL MODEL PREDICTION
        img_t = transform(img)
        img_t = img_t.unsqueeze(0)

        with torch.no_grad():
            outputs = model(img_t)

        probs = torch.softmax(outputs, dim=1)[0]
        real_prob = probs[0].item()
        fake_prob = probs[1].item()
        filtered_prob = probs[2].item()

        # Local decision
        if fake_prob > 0.6:
            label = "FAKE"
        elif filtered_prob > real_prob:
            label = "FILTERED"
        else:
            label = "REAL"

        local_confidence = max(real_prob, fake_prob, filtered_prob)

        # 2. API FALLBACK (Only for URLs and if local model is not very confident)
        # Optimized: Only call API if local confidence is low (< 0.9) AND it's not already clearly FAKE
        if image_url and label == "REAL" and local_confidence < 0.9:
            try:
                # Reduced timeout for faster response
                api_resp = requests.post(API_URL, headers=HEADERS, json={"inputs": image_url}, timeout=3)
                api_data = api_resp.json()
                
                if isinstance(api_data, list):
                    for item in api_data:
                        api_label = item.get("label", "").lower()
                        api_score = item.get("score", 0)
                        
                        if ("ai" in api_label or "fake" in api_label) and api_score > 0.5:
                            label = "FAKE"
                            local_confidence = api_score
                            break
            except Exception as e:
                print(f"API Fallback Error: {e}")

        return {
            "label": label,
            "confidence": round(local_confidence * 100, 2)
        }

    except Exception as e:
        print(e)
        return {"label": "ERROR", "confidence": 0}