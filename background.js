const translationCache = new Map();
const MAX_CACHE_SIZE = 1000;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "translate") {
    const lang = request.targetLang || 'en';
    const text = (request.text || '').trim();

    if (!text) {
      sendResponse({ success: false, error: "Empty text" });
      return false;
    }

    const cacheKey = `${lang}:${text}`;
    if (translationCache.has(cacheKey)) {
      sendResponse({ success: true, ...translationCache.get(cacheKey), fromCache: true });
      return false;
    }

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`;

    fetch(url)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Google Translate API HTTP ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (!data || !Array.isArray(data[0])) {
          throw new Error("Invalid response format from translator");
        }
        const translatedText = data[0].map(item => item?.[0] || "").join("");
        const detectedLang = typeof data[2] === 'string' ? data[2].toLowerCase() : null;

        const result = { translation: translatedText, detectedLang };

        if (translationCache.size >= MAX_CACHE_SIZE) {
          const firstKey = translationCache.keys().next().value;
          translationCache.delete(firstKey);
        }
        translationCache.set(cacheKey, result);

        sendResponse({ success: true, ...result });
      })
      .catch(error => {
        console.error("Translation error:", error);
        sendResponse({ success: false, error: error.message });
      });

    return true; 
  }
});