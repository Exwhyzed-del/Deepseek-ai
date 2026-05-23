import { CONFIG } from './config.js';

console.log("DeepShield Service Worker starting with config:", CONFIG);

chrome.runtime.onInstalled.addListener(() => {
  console.log("DeepShield Unified installed");
  chrome.contextMenus.create({
    id: "verifySelection",
    title: "Verify news credibility",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "verifySelection" && info.selectionText) {
    await chrome.storage.local.set({
      deepshield_last_extracted_text: info.selectionText,
      deepshield_auto_verify: true
    });
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.windowId) return;
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (err) {
    console.warn("Failed to open side panel:", err);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "VERIFY_NEWS") {
    verifyNews(message.text)
      .then((result) => sendResponse({ success: true, result }))
      .catch((error) => {
        console.error("VERIFY_NEWS error:", error);
        sendResponse({
          success: false,
          error: error.message || "Verification failed"
        });
      });
    return true;
  }

  if (message.type === "CAPTURE_VISIBLE_TAB") {
    chrome.tabs.captureVisibleTab(
      sender.tab?.windowId,
      { format: "png" },
      (dataUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({
            success: false,
            error: chrome.runtime.lastError.message
          });
          return;
        }
        sendResponse({ success: true, dataUrl });
      }
    );
    return true;
  }

  if (message.type === "OPEN_SIDE_PANEL") {
    if (sender.tab?.windowId) {
      chrome.sidePanel.open({ windowId: sender.tab.windowId })
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }
    sendResponse({ success: false, error: "No active window" });
    return false;
  }

  if (message.type === "OCR_IMAGE") {
    extractTextFromImage(message.imageDataUrl)
      .then((text) => sendResponse({ success: true, text }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === "DETECT_IMAGE_API") {
    detectImage(message.imageUrl)
      .then((data) => sendResponse({ success: true, data }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === "RESULT_READY" || message.type === "SCREENSHOT_TEXT_READY") {
    // Just a heartbeat/notify message, no complex async work
    sendResponse({ success: true });
    return false;
  }
});

async function verifyNews(text) {
  console.log("Attempting to verify news at:", `${CONFIG.API_BASE_URL}/analyze-news`);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for Render cold start

    const response = await fetch(`${CONFIG.API_BASE_URL}/analyze-news`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text: text }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Server responded with error:", response.status, errorText);
      throw new Error(`Server Error (${response.status}). Please ensure the backend is running.`);
    }

    const data = await response.json();
    console.log("Verification successful:", data);
    if (!data.success) throw new Error(data.error || "Verification failed");
    return data.result;
  } catch (err) {
    console.error("Background News Verification Error:", err);
    if (err.name === 'AbortError') throw new Error("Request timed out. The server might be waking up, please try again in a moment.");
    throw err;
  }
}

async function detectImage(imageUrl) {
  console.log("Attempting to detect image at:", `${CONFIG.API_BASE_URL}/detect-image`);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const response = await fetch(`${CONFIG.API_BASE_URL}/detect-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ image_url: imageUrl }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error("Server responded with error:", response.status);
      throw new Error(`Server Error (${response.status})`);
    }
    
    const result = await response.json();
    console.log("Detection successful:", result);
    return result;
  } catch (err) {
    console.error("Background Detection Error:", err);
    if (err.name === 'AbortError') throw new Error("Timeout");
    throw err;
  }
}

async function extractTextFromImage(imageDataUrl) {
  const base64 = String(imageDataUrl || "").split(",")[1];
  if (!base64) {
    throw new Error("Invalid image data");
  }

  const tryLanguages = ["eng+hin", "eng", "hin"];
  let lastError = "OCR failed";

  for (const language of tryLanguages) {
    try {
      const formData = new FormData();
      formData.append("base64Image", `data:image/png;base64,${base64}`);
      formData.append("language", language);
      formData.append("isOverlayRequired", "false");
      formData.append("OCREngine", "2");
      formData.append("apikey", CONFIG.OCR_API_KEY);

      const response = await fetch("https://api.ocr.space/parse/image", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        lastError = `OCR request failed: ${response.status}`;
        continue;
      }

      const data = await response.json();

      if (data.IsErroredOnProcessing) {
        lastError = (data.ErrorMessage || []).join(", ") || "OCR failed";
        continue;
      }

      const text = (data.ParsedResults || [])
        .map(item => item.ParsedText || "")
        .join(" ")
        .trim();

      if (text) return text;
      lastError = "No text detected in screenshot";
    } catch (err) {
      lastError = err.message || "OCR failed";
    }
  }

  throw new Error(lastError);
}
