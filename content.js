let settings = {
  enableX: true,
  enableYT: true,
  colorX: '#808080',
  colorYT: '#aaaaaa',
  targetLang: 'en'
};

const styleTag = document.createElement('style');
document.head.appendChild(styleTag);

function updateGlobalStyles() {
  const isX = window.location.hostname.includes('x.com') || window.location.hostname.includes('twitter.com');
  const color = isX ? settings.colorX : settings.colorYT;
  
  styleTag.textContent = `
    .custom-translation-block {
      margin-top: 6px !important;
      padding-top: 6px !important;
      border-top: 1px dashed rgba(128, 128, 128, 0.25) !important;
      color: ${color} !important;
      font-size: 0.95em !important;
      line-height: 1.4 !important;
      display: block !important;
      opacity: 0.95;
      word-break: break-word;
      user-select: text;
    }
  `;
}

chrome.storage.sync.get({
  enableX: true,
  enableYT: true,
  colorX: '#808080',
  colorYT: '#aaaaaa',
  targetLang: 'en'
}, (items) => {
  settings = items;
  updateGlobalStyles();
  findAndTranslate();
});

chrome.storage.onChanged.addListener((changes) => {
  let langChanged = false;
  for (let key in changes) {
    settings[key] = changes[key].newValue;
    if (key === 'targetLang') langChanged = true;
  }
  updateGlobalStyles();

  if (langChanged) {
    // Clear previous translations to re-translate to the new target language
    document.querySelectorAll('.custom-translation-block').forEach(el => el.remove());
    document.querySelectorAll('[data-translated]').forEach(el => el.removeAttribute('data-translated'));
  }

  findAndTranslate();
});

function isValidText(text) {
  if (!text) return false;
  // Remove emojis, numbers, and basic punctuation to verify there's actual text
  const clean = text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\s\d\p{P}]+/gu, '').trim();
  return clean.length > 1;
}

// Queue for translation to prevent rate limiting / HTTP 429
const queue = [];
let isProcessingQueue = false;

function enqueueElement(element) {
  if (element.hasAttribute('data-translated')) return;
  element.setAttribute('data-translated', 'queued');
  queue.push(element);
  processQueue();
}

async function processQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  while (queue.length > 0) {
    const element = queue.shift();
    if (!element || !document.contains(element)) {
      continue;
    }

    await translateElement(element);
    // 100ms throttle between requests to prevent rate limits
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  isProcessingQueue = false;
}

function translateElement(element) {
  return new Promise((resolve) => {
    const isX = window.location.hostname.includes('x.com') || window.location.hostname.includes('twitter.com');
    const isYT = window.location.hostname.includes('youtube.com');

    if ((isX && !settings.enableX) || (isYT && !settings.enableYT)) {
      element.removeAttribute('data-translated');
      return resolve();
    }

    const originalText = isYT ? element.textContent : element.innerText;
    if (!isValidText(originalText)) {
      element.setAttribute('data-translated', 'skipped');
      return resolve();
    }

    element.setAttribute('data-translated', 'processing');

    chrome.runtime.sendMessage({ 
      type: "translate", 
      text: originalText.trim(),
      targetLang: settings.targetLang 
    }, (response) => {
      if (chrome.runtime.lastError || !response || !response.success) {
        // Mark as error instead of removing attribute to prevent infinite spam loops
        element.setAttribute('data-translated', 'error');
        return resolve();
      }

      const translation = (response.translation || '').trim();
      const detectedLang = response.detectedLang;
      const targetLang = (settings.targetLang || '').toLowerCase();

      // Don't show translation if source language is already target language or translation is identical
      const isSameLang = detectedLang && (targetLang === detectedLang || targetLang.startsWith(detectedLang));
      const isIdentical = translation.toLowerCase() === originalText.trim().toLowerCase();

      if (isSameLang || isIdentical) {
        element.setAttribute('data-translated', 'same-lang');
        return resolve();
      }

      // Check if translation block already exists
      if (!element.nextElementSibling?.classList?.contains('custom-translation-block')) {
        const translationDiv = document.createElement('div');
        translationDiv.className = 'custom-translation-block';
        translationDiv.textContent = translation;
        element.insertAdjacentElement('afterend', translationDiv);
      }

      element.setAttribute('data-translated', 'true');
      resolve();
    });
  });
}

const findAndTranslate = () => {
  const isX = window.location.hostname.includes('x.com') || window.location.hostname.includes('twitter.com');
  const isYT = window.location.hostname.includes('youtube.com');
  let selectors = [];
  if (isX && settings.enableX) selectors.push('[data-testid="tweetText"]:not([data-translated])');
  if (isYT && settings.enableYT) selectors.push('#content-text:not([data-translated])');
  if (selectors.length) {
    document.querySelectorAll(selectors.join(', ')).forEach(enqueueElement);
  }
};

let debounceTimer = null;
const observer = new MutationObserver(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(findAndTranslate, 400);
});

observer.observe(document.body, { childList: true, subtree: true });