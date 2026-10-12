// Kolkata Pujo Parikrama - Client Application
document.addEventListener('DOMContentLoaded', () => {
  const heroView = document.getElementById('hero-view');
  const chatView = document.getElementById('chat-view');
  const navBrand = document.getElementById('nav-brand');
  const heroInput = document.getElementById('hero-input');
  const heroSendBtn = document.getElementById('hero-send-btn');
  const chatInput = document.getElementById('chat-input');
  const chatSendBtn = document.getElementById('chat-send-btn');
  const modelSelect = document.getElementById('model-select');
  const quotaText = document.getElementById('quota-text');
  const quotaBadge = document.getElementById('quota-badge');
  const messagesList = document.getElementById('messages-list');
  const quotaModal = document.getElementById('quota-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const imageModal = document.getElementById('image-modal');
  const imageModalImg = document.getElementById('image-modal-img');
  const imageModalCaption = document.getElementById('image-modal-caption');
  const imageModalClose = document.getElementById('image-modal-close');

  let conversationHistory = [];
  let remainingQuestions = 5;
  let guestRemainingQuestions = 5;
  let isGenerating = false;
  let currentLang = 'en'; // 'en' or 'bn'

  const translations = {
    en: {
      toggleBtn: 'বাংলা',
      assistantLabel: 'Assistant:',
      motif: '🌸 শুভ শারদীয়া 🌸',
      title: 'Kolkata Pujo Parikrama',
      subtitle: 'Explore Durga Puja pandals, check traffic updates and area busyness, discover pandal themes and artists, and plan Metro journeys and routes.',
      placeholder: 'Ask about pandals, routes, Metro timings, or traffic...',
      chatPlaceholder: 'Ask a follow-up question...',
      presetsTitle: '✨ Recommended Puja Tour Presets',
      nearMeTitle: 'Pandals Near Me',
      nearMeDesc: 'Auto-detect GPS & nearest pandals',
      quotaChecking: 'Checking questions...',
      quotaFreeLeft: '{n} of {limit} free left',
      quotaUnlimited: 'Unlimited (Testing)',
      consulting: 'Consulting Kolkata Puja MCP server & tools...',
      connError: '⚠️ Connection error. Please check your network and try again.',
      shareWa: 'Share to WhatsApp',
      copyPlan: 'Copy Plan',
      copied: 'Copied!'
    },
    bn: {
      toggleBtn: 'English',
      assistantLabel: 'সহকারী:',
      motif: '🌸 শুভ শারদীয়া 🌸',
      title: 'কলকাতা পুজো পরিক্রমা',
      subtitle: 'দুর্গাপূজার মণ্ডপ খুঁজুন, ট্র্যাফিক এবং ভিড় জানুন, মণ্ডপের থিম ও শিল্পী আবিষ্কার করুন এবং মেট্রো ও হাঁটার রুট প্ল্যান করুন।',
      placeholder: 'মণ্ডপ, রুট, মেট্রো সময়সূচী বা ট্র্যাফিক সম্পর্কে জিজ্ঞাসা করুন...',
      chatPlaceholder: 'পরবর্তী প্রশ্নটি এখানে লিখুন...',
      presetsTitle: '✨ বিশেষ পুজো পরিক্রমা ট্যুর',
      nearMeTitle: 'আমার কাছের মণ্ডপ',
      nearMeDesc: 'জিপিএস দিয়ে নিকটবর্তী মণ্ডপ খুঁজুন',
      quotaChecking: 'প্রশ্ন গণনা হচ্ছে...',
      quotaFreeLeft: '{limit} টির মধ্যে {n} টি বাকি',
      quotaUnlimited: 'সীমাহীন (টেস্টিং)',
      consulting: 'কলকাতা পুজো এমসিপি টুল থেকে তথ্য আনা হচ্ছে...',
      connError: '⚠️ সংযোগ সমস্যা। দয়া করে ইন্টারনেট চেক করে আবার চেষ্টা করুন।',
      shareWa: 'হোয়াটসঅ্যাপে পাঠান',
      copyPlan: 'প্ল্যান কপি করুন',
      copied: 'কপি হয়েছে!'
    }
  };

  function applyLanguage(lang) {
    currentLang = lang;
    const t = translations[lang];
    const langBtnText = document.getElementById('lang-btn-text');
    if (langBtnText) langBtnText.textContent = t.toggleBtn;

    const assistantLabel = document.getElementById('assistant-label');
    if (assistantLabel) assistantLabel.textContent = t.assistantLabel;

    const heroTitle = document.querySelector('.hero-title');
    if (heroTitle) heroTitle.textContent = t.title;

    const navBrandText = document.querySelector('.nav-brand-text');
    if (navBrandText) navBrandText.textContent = t.title;

    const heroSubtitle = document.querySelector('.hero-subtitle');
    if (heroSubtitle) heroSubtitle.textContent = t.subtitle;

    if (heroInput) heroInput.placeholder = t.placeholder;
    if (chatInput) chatInput.placeholder = t.chatPlaceholder;

    const presetsTitle = document.querySelector('.presets-title');
    if (presetsTitle) presetsTitle.textContent = t.presetsTitle;

    const nearMeCard = document.getElementById('preset-near-me');
    if (nearMeCard) {
      const strong = nearMeCard.querySelector('strong');
      const span = nearMeCard.querySelector('span');
      if (strong) strong.textContent = t.nearMeTitle;
      if (span) span.textContent = t.nearMeDesc;
    }

    updateModelSelectLabels();
    updateQuotaDisplay(remainingQuestions);
  }

  const langToggleBtn = document.getElementById('lang-toggle-btn');
  if (langToggleBtn) {
    langToggleBtn.addEventListener('click', () => {
      const nextLang = currentLang === 'en' ? 'bn' : 'en';
      applyLanguage(nextLang);
    });
  }

  // Initialize session and quota
  async function initSession() {
    try {
      const resp = await fetch('/api/session');
      if (resp.ok) {
        const data = await resp.json();
        guestRemainingQuestions = data.remaining;
        const currentProvider = modelSelect.value;
        if (hasCustomKeyForProvider(currentProvider)) {
          remainingQuestions = 9999;
          updateQuotaDisplay(9999);
        } else {
          remainingQuestions = data.remaining;
          updateQuotaDisplay(data.remaining, data.limit);
        }
      }
    } catch (e) {
      console.warn('Session init error:', e);
    }
  }

  // User API Keys (Saved locally in browser localStorage)
  const userKeys = {
    gemini: localStorage.getItem('user_key_gemini') || '',
    groq: localStorage.getItem('user_key_groq') || '',
    openai: localStorage.getItem('user_key_openai') || '',
    anthropic: localStorage.getItem('user_key_anthropic') || '',
  };

  function hasCustomKeyForProvider(provider) {
    return Boolean(userKeys[provider] && userKeys[provider].trim().length > 5);
  }

  function updateModelSelectLabels() {
    if (!modelSelect) return;
    const isBn = currentLang === 'bn';
    const options = modelSelect.querySelectorAll('option');
    options.forEach(opt => {
      const val = opt.value;
      const isCustom = hasCustomKeyForProvider(val);
      if (val === 'gemini') {
        opt.textContent = isCustom 
          ? (isBn ? 'গুগল জেমিনি ⚡ (আমার কি)' : 'Google Gemini ⚡ (My Key)')
          : (isBn ? 'গুগল জেমিনি (ফ্রি গেস্ট)' : 'Google Gemini (Free Guest)');
      } else if (val === 'groq') {
        opt.textContent = isCustom 
          ? (isBn ? 'গ্রক ⚡ (আমার কি)' : 'Groq ⚡ (My Key)')
          : (isBn ? 'গ্রক (ফ্রি গেস্ট)' : 'Groq (Free Guest)');
      } else if (val === 'openai') {
        opt.textContent = isCustom 
          ? (isBn ? 'ওপেনএআই চ্যাটজিপিটি ⚡ (আমার কি)' : 'OpenAI ChatGPT ⚡ (My Key)')
          : (isBn ? 'ওপেনএআই (চ্যাটজিপিটি)' : 'OpenAI (ChatGPT)');
      } else if (val === 'anthropic') {
        opt.textContent = isCustom 
          ? (isBn ? 'অ্যানথ্রপিক ক্লদ ⚡ (আমার কি)' : 'Anthropic Claude ⚡ (My Key)')
          : (isBn ? 'অ্যানথ্রপিক (ক্লদ)' : 'Anthropic (Claude)');
      }
    });
  }

  function updateKeyBadgeStatus() {
    updateModelSelectLabels();
    const keyPillBtn = document.getElementById('open-keys-btn');
    const hasAnyKey = Object.values(userKeys).some(k => k && k.trim().length > 5);
    if (keyPillBtn) {
      if (hasAnyKey) {
        keyPillBtn.classList.add('active');
        keyPillBtn.title = "Personal API Key Active (Unlimited questions enabled)";
      } else {
        keyPillBtn.classList.remove('active');
        keyPillBtn.title = "Add your own API Key (Unlimited questions)";
      }
    }
  }

  function updateQuotaDisplay(remaining, limit = 5) {
    if (typeof remaining === 'number' && remaining < 999) {
      guestRemainingQuestions = remaining;
    }
    const t = translations[currentLang];
    const currentProvider = modelSelect.value;
    
    if (hasCustomKeyForProvider(currentProvider)) {
      remainingQuestions = 9999;
      quotaText.textContent = "Unlimited (My Key)";
      quotaBadge.classList.remove('low', 'zero');
      return;
    }

    remainingQuestions = guestRemainingQuestions;
    if (limit >= 999 || remainingQuestions >= 999) {
      quotaText.textContent = t.quotaUnlimited;
      quotaBadge.classList.remove('low', 'zero');
      return;
    }
    quotaText.textContent = t.quotaFreeLeft.replace('{n}', remainingQuestions).replace('{limit}', limit);
    
    quotaBadge.classList.remove('low', 'zero');
    if (remainingQuestions === 0) {
      quotaBadge.classList.add('zero');
    } else if (remainingQuestions <= 2) {
      quotaBadge.classList.add('low');
    }
  }

  // Handle Textarea auto-resize
  function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }

  [heroInput, chatInput].forEach(el => {
    el.addEventListener('input', () => autoResize(el));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  });

  heroSendBtn.addEventListener('click', sendMessage);
  chatSendBtn.addEventListener('click', sendMessage);

  // Suggestion Chips & Tour Presets
  document.querySelectorAll('.chip, .preset-card[data-prompt]').forEach(btn => {
    btn.addEventListener('click', () => {
      const prompt = btn.getAttribute('data-prompt');
      if (prompt) {
        heroInput.value = prompt;
        sendMessage();
      }
    });
  });

  // User GPS coordinates cache
  let userGps = null;
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userGps = {
          lat: pos.coords.latitude.toFixed(4),
          lon: pos.coords.longitude.toFixed(4)
        };
        console.log("📍 Location pre-fetched:", userGps);
      },
      (err) => console.debug("Location pre-fetch status:", err.message),
      { timeout: 6000, maximumAge: 300000, enableHighAccuracy: false }
    );
  }

  // Geolocation: Find Pandals Near Me (with graceful fallback)
  async function requestUserLocation() {
    const locateBtns = [document.getElementById('hero-locate-btn'), document.getElementById('chat-locate-btn')];
    locateBtns.forEach(btn => btn && btn.classList.add('locating'));

    function sendLocationPrompt(lat, lon, locationLabel = "") {
      locateBtns.forEach(btn => btn && btn.classList.remove('locating'));
      userGps = { lat, lon };
      const labelStr = locationLabel ? ` near ${locationLabel}` : '';
      const prompt = `I am currently located at GPS coordinates (${lat}, ${lon})${labelStr}. Which famous Durga Puja pandals and Metro stations are nearest to me?`;
      const inputEl = heroView.style.display !== 'none' ? heroInput : chatInput;
      inputEl.value = prompt;
      sendMessage();
    }

    if (userGps) {
      sendLocationPrompt(userGps.lat, userGps.lon);
      return;
    }

    // 1. Try HTML5 Geolocation API
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude.toFixed(4);
          const lon = pos.coords.longitude.toFixed(4);
          sendLocationPrompt(lat, lon);
        },
        async (err) => {
          console.warn("Browser GPS permission error or unavailable:", err.message);
          // 2. Fallback: Quick Area Selector if browser blocked location
          askAreaFallback(locateBtns, sendLocationPrompt);
        },
        { timeout: 7000, enableHighAccuracy: false, maximumAge: 60000 }
      );
    } else {
      askAreaFallback(locateBtns, sendLocationPrompt);
    }
  }

  function askAreaFallback(locateBtns, sendLocationPrompt) {
    locateBtns.forEach(btn => btn && btn.classList.remove('locating'));
    const areaChoice = prompt(
      "📍 Browser location access was not granted or is blocked.\n\nType your Kolkata area/landmark (e.g. Kalighat, Baghbazar, Salt Lake, Gariahat, Park Circus) or leave blank for South Kolkata:",
      "Kalighat"
    );
    if (areaChoice !== null) {
      const area = areaChoice.trim() || "Kalighat";
      const prompt = `Which Durga Puja pandals, Metro stations, and routes are closest to ${area}?`;
      const inputEl = heroView.style.display !== 'none' ? heroInput : chatInput;
      inputEl.value = prompt;
      sendMessage();
    }
  }

  const heroLocateBtn = document.getElementById('hero-locate-btn');
  const chatLocateBtn = document.getElementById('chat-locate-btn');
  const presetNearMe = document.getElementById('preset-near-me');
  if (heroLocateBtn) heroLocateBtn.addEventListener('click', requestUserLocation);
  if (chatLocateBtn) chatLocateBtn.addEventListener('click', requestUserLocation);
  if (presetNearMe) presetNearMe.addEventListener('click', requestUserLocation);



  // Send message flow
  async function sendMessage() {
    if (isGenerating) return;
    
    const inputEl = heroView.style.display !== 'none' ? heroInput : chatInput;
    const text = inputEl.value.trim();
    if (!text) return;

    let provider = modelSelect.value;
    let isCustom = hasCustomKeyForProvider(provider);

    // If current provider has no custom key, but user saved a custom key for another provider, auto-switch to it!
    if (!isCustom) {
      const altProvider = ['gemini', 'groq', 'openai', 'anthropic'].find(p => hasCustomKeyForProvider(p));
      if (altProvider && remainingQuestions <= 0) {
        modelSelect.value = altProvider;
        provider = altProvider;
        isCustom = true;
        remainingQuestions = 9999;
        updateQuotaDisplay(9999);
      }
    }

    if (isCustom) {
      remainingQuestions = 9999;
    }

    // Only block if guest quota is exhausted AND user has no active custom key
    if (remainingQuestions <= 0 && !isCustom) {
      showQuotaModal();
      return;
    }

    // Switch from Hero view to Chat view if on first question
    if (heroView.style.display !== 'none') {
      heroView.style.display = 'none';
      chatView.style.display = 'flex';
      navBrand.style.display = 'flex';
    }

    inputEl.value = '';
    autoResize(inputEl);
    inputEl.focus();

    // Check if user is asking for pandals near them
    const isNearbyQuery = /\b(near\s*me|nearby|closest|around\s*me|কাছে|কাছের)\b/i.test(text) && !/\b\d{2}\.\d+,\s*\d{2}\.\d+\b/.test(text);
    let backendMessage = text;

    if (isNearbyQuery) {
      // 1. If GPS not cached yet, attempt quick fetch
      if (!userGps && navigator.geolocation) {
        try {
          const pos = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 2500,
              enableHighAccuracy: false,
              maximumAge: 300000
            });
          });
          userGps = {
            lat: pos.coords.latitude.toFixed(4),
            lon: pos.coords.longitude.toFixed(4)
          };
        } catch (e) {
          console.debug("Auto GPS fetch skipped or timed out:", e.message);
        }
      }

      // 2. Automatically augment query with GPS coordinates
      if (userGps) {
        backendMessage = `I am currently located at GPS coordinates (${userGps.lat}, ${userGps.lon}). ${text}`;
      } else {
        backendMessage = `${text} (Note: Device location is unavailable. Please recommend the most famous Durga Puja pandals across South and North Kolkata)`;
      }
    }

    // Append User Message to UI
    appendMessage('user', text);
    conversationHistory.push({ role: 'user', content: backendMessage });

    // Show Loading Bubble
    const loadingId = appendLoadingBubble();
    isGenerating = true;
    heroSendBtn.disabled = true;
    chatSendBtn.disabled = true;

    try {
      provider = modelSelect.value;
      const queryMessage = currentLang === 'bn' 
        ? `${backendMessage} (দয়া করে বাংলায় উত্তর দিন)` 
        : backendMessage;

      const customKey = userKeys[provider] || null;

      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: queryMessage,
          provider: provider,
          history: conversationHistory.slice(-6), // Send recent turns
          custom_api_key: customKey
        })
      });

      removeLoadingBubble(loadingId);

      const data = await resp.json();
      if (resp.status === 429) {
        if (!isCustom) {
          guestRemainingQuestions = 0;
          updateQuotaDisplay(0);
          showQuotaModal();
        }
        appendMessage('assistant', '⚠️ ' + (data.message || 'Free guest question limit reached.'));
        return;
      }

      if (!resp.ok) {
        updateQuotaDisplay(data.remaining !== undefined ? data.remaining : remainingQuestions);
        appendMessage('assistant', `⚠️ ${data.message || 'Error occurred while contacting assistant.'}`);
        return;
      }

      // Success
      updateQuotaDisplay(data.remaining);
      appendMessage('assistant', data.reply);
      conversationHistory.push({ role: 'assistant', content: data.reply });

      if (data.remaining === 0 && !isCustom) {
        setTimeout(showQuotaModal, 1500);
      }
    } catch (err) {
      removeLoadingBubble(loadingId);
      appendMessage('assistant', '⚠️ Connection error. Please check your network and try again.');
    } finally {
      isGenerating = false;
      heroSendBtn.disabled = false;
      chatSendBtn.disabled = false;
    }
  }

  function appendMessage(role, rawContent) {
    const item = document.createElement('div');
    item.className = `message-item ${role}`;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    if (role === 'user') {
      bubble.textContent = rawContent;
    } else {
      bubble.innerHTML = renderMarkdown(rawContent);
    }

    item.appendChild(bubble);
    messagesList.appendChild(item);
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });

    // Attach image click handlers
    bubble.querySelectorAll('.pandal-img-card').forEach(card => {
      card.addEventListener('click', () => {
        const img = card.querySelector('img');
        const caption = card.querySelector('.pandal-img-caption');
        if (img) {
          imageModalImg.src = img.src;
          imageModalCaption.textContent = caption ? caption.textContent : '';
          imageModal.style.display = 'flex';
        }
      });
    });

    // Attach Share & WhatsApp buttons to assistant messages
    if (role === 'assistant') {
      const actionsBar = document.createElement('div');
      actionsBar.className = 'message-actions-bar';

      // WhatsApp Share button
      const cleanText = rawContent
        .replace(/!\[.*?\]\(.*?\)/g, '')
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .replace(/[*_#]/g, '')
        .trim();
      const shareSnippet = cleanText.length > 500 ? cleanText.substring(0, 500) + '...' : cleanText;
      const siteUrl = window.location.origin || 'https://kolkata-puja-mcp-server2.onrender.com';
      const waText = encodeURIComponent(`🌸 *Kolkata Pujo Parikrama Guide* 🌸\n\n${shareSnippet}\n\n👉 Plan your Puja tour: ${siteUrl}`);
      const waUrl = `https://api.whatsapp.com/send?text=${waText}`;

      actionsBar.innerHTML = `
        <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="msg-action-btn whatsapp-btn" title="Share itinerary to WhatsApp">
          <span>💬</span> <span>Share to WhatsApp</span>
        </a>
        <button class="msg-action-btn copy-itinerary-btn" title="Copy full response to clipboard">
          <span>📋</span> <span>Copy Plan</span>
        </button>
      `;

      const copyBtn = actionsBar.querySelector('.copy-itinerary-btn');
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(cleanText).then(() => {
          copyBtn.classList.add('copied');
          copyBtn.innerHTML = '<span>✅</span> <span>Copied!</span>';
          setTimeout(() => {
            copyBtn.classList.remove('copied');
            copyBtn.innerHTML = '<span>📋</span> <span>Copy Plan</span>';
          }, 2000);
        }).catch(err => {
          console.warn('Clipboard copy error:', err);
        });
      });

      // Contextual 1-Tap Quick Follow-up Chips (0 tokens from LLM)
      if (!rawContent.startsWith('⚠️')) {
        const chipsBar = document.createElement('div');
        chipsBar.className = 'followup-chips-bar';
        
        const isBn = currentLang === 'bn' || /[\u0980-\u09FF]/.test(rawContent);
        const followUps = isBn ? [
          { text: '🍽️ আশেপাশের খাবার ও মিষ্টি', query: 'এই মণ্ডপগুলির কাছাকাছি বিখ্যাত ঐতিহ্যবাহী খাবার ও মিষ্টির দোকান কোনটি?' },
          { text: '🚇 আজকের রাতের মেট্রো সময়সূচী', query: 'আজ রাতের পুজোর স্পেশাল মেট্রো ট্রেনের শেষ সময় কখন?' },
          { text: '🚨 বর্তমান ট্র্যাফিক ও ভিড়', query: 'এই রুটের বর্তমান রাস্তা ও ট্র্যাফিক পরিস্থিতি কেমন?' }
        ] : [
          { text: '🍽️ Famous Food & Sweets Nearby', query: 'What are the best authentic food and sweet shops near these pandals?' },
          { text: '🚇 Puja Special Metro Timings Tonight', query: 'What are the late-night Puja special Metro timings and last train schedules?' },
          { text: '🚨 Live Traffic & Crowds', query: 'What is the current road traffic and crowd status for this route?' }
        ];

        followUps.forEach(item => {
          const chipBtn = document.createElement('button');
          chipBtn.className = 'followup-chip-btn';
          chipBtn.type = 'button';
          chipBtn.innerHTML = item.text;
          chipBtn.addEventListener('click', () => {
            const inputEl = heroView.style.display !== 'none' ? heroInput : chatInput;
            inputEl.value = item.query;
            sendMessage();
          });
          chipsBar.appendChild(chipBtn);
        });

        bubble.appendChild(chipsBar);
      }

      bubble.appendChild(actionsBar);
    }

    // Check if the message contains coordinates/maps to render an interactive Mini Map
    if (role === 'assistant' && typeof L !== 'undefined') {
      renderInteractiveMapIfPossible(bubble, rawContent);
    }
  }

  // Pre-load all 222 Kolkata pandals with GPS coordinates for instant mapping
  let allKolkataPandals = [];
  fetch('/static/pandals_index.json')
    .then(r => r.json())
    .then(data => { allKolkataPandals = data; })
    .catch(err => console.warn('Could not load pandals index:', err));

  // Detect coordinates or Google Maps links to render an interactive Leaflet Map
  function renderInteractiveMapIfPossible(bubble, text) {
    const coords = [];
    const seenNames = new Set();
    const lowerText = text.toLowerCase();

    // 1. Search against all 222 Kolkata pandals from the dataset
    if (allKolkataPandals && allKolkataPandals.length > 0) {
      allKolkataPandals.forEach(p => {
        const pNameLower = p.name.toLowerCase();
        const pos = lowerText.indexOf(pNameLower);
        // Match pandal name in text
        if (pos !== -1) {
          if (!seenNames.has(p.name)) {
            seenNames.add(p.name);
            coords.push({
              lat: p.lat,
              lon: p.lon,
              name: p.name,
              area: p.area || '',
              pos: pos
            });
          }
        }
      });
      // Sort coords in the exact chronological sequence mentioned in the itinerary
      coords.sort((a, b) => a.pos - b.pos);
    }

    // 2. Check for lat, lng in Google Maps links
    const gmapsRegex = /destination=([0-9]+\.[0-9]+),([0-9]+\.[0-9]+)/g;
    let match;
    while ((match = gmapsRegex.exec(text)) !== null) {
      const lat = parseFloat(match[1]);
      const lon = parseFloat(match[2]);
      if (!coords.some(c => Math.abs(c.lat - lat) < 0.003 && Math.abs(c.lon - lon) < 0.003)) {
        coords.push({
          lat: lat,
          lon: lon,
          name: 'Pandal Destination',
          area: '',
          pos: match.index
        });
      }
    }

    // 3. Check for explicit coordinates in text: (22.5xxx, 88.3xxx)
    const coordRegex = /\b(22\.[4-6][0-9]{2,5})\b[^\d]+(88\.[2-4][0-9]{2,5})\b/g;
    while ((match = coordRegex.exec(text)) !== null) {
      const lat = parseFloat(match[1]);
      const lon = parseFloat(match[2]);
      if (!coords.some(c => Math.abs(c.lat - lat) < 0.003 && Math.abs(c.lon - lon) < 0.003)) {
        coords.push({
          lat: lat,
          lon: lon,
          name: 'Puja Location',
          area: '',
          pos: match.index
        });
      }
    }

    if (coords.length === 0) return;

    // Build multi-stop Google Maps URL connecting ALL pandals found in the search!
    let gmapsUrl = "";
    if (coords.length === 1) {
      gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${coords[0].lat},${coords[0].lon}&travelmode=walking`;
    } else {
      const origin = `${coords[0].lat},${coords[0].lon}`;
      const destination = `${coords[coords.length - 1].lat},${coords[coords.length - 1].lon}`;
      const intermediateCoords = coords.slice(1, -1);
      const waypoints = intermediateCoords.slice(0, 9).map(c => `${c.lat},${c.lon}`).join('|');
      gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints ? `&waypoints=${waypoints}` : ''}&travelmode=walking`;
    }

    // Synchronize ANY Google Maps route buttons rendered in the message bubble from markdown
    // so that clicking "Open route in Google Maps" directs to the FULL multi-stop route with all pandals!
    const existingMapBtns = bubble.querySelectorAll('.route-map-btn');
    existingMapBtns.forEach(btn => {
      btn.href = gmapsUrl;
      if (coords.length > 1) {
        btn.innerHTML = `📍 Open Full Route in Google Maps (${coords.length} stops)`;
        btn.title = `Full walking tour connecting all ${coords.length} pandals in Google Maps`;
      }
    });

    // Create Map Container
    const mapContainer = document.createElement('div');
    mapContainer.className = 'map-card-container';
    const mapId = 'map-' + Math.random().toString(36).substring(2, 9);

    mapContainer.innerHTML = `
      <div class="map-card-header">
        <span>🗺️ Interactive Puja Map Preview (${coords.length} pandals plotted)</span>
      </div>
      <div id="${mapId}" class="pandal-leaflet-map"></div>
      <div class="map-card-footer">
        <span>Tap pins for pandal details</span>
        <a href="${gmapsUrl}" target="_blank" rel="noopener noreferrer" class="route-map-btn" style="padding: 6px 14px; font-size: 0.82rem; margin: 0;">
          📍 Open Full Route in Google Maps (${coords.length} stops)
        </a>
      </div>
    `;

    bubble.appendChild(mapContainer);

    setTimeout(() => {
      try {
        const map = L.map(mapId, { scrollWheelZoom: false }).setView([coords[0].lat, coords[0].lon], coords.length > 1 ? 13 : 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap'
        }).addTo(map);

        const group = [];
        coords.forEach((c, idx) => {
          const marker = L.marker([c.lat, c.lon]).addTo(map);
          marker.bindPopup(`<strong>${idx + 1}. ${c.name}</strong>${c.area ? `<br><small>Area: ${c.area}</small>` : ''}<br><a href="https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lon}" target="_blank" style="color: #2E7D5B; font-weight: bold; font-size: 11px;">Directions in Google Maps &rarr;</a>`);
          if (idx === 0) marker.openPopup();
          group.push([c.lat, c.lon]);
        });

        // If multiple pandals, draw a walking route line connecting them
        if (coords.length > 1) {
          const linePoints = coords.map(c => [c.lat, c.lon]);
          L.polyline(linePoints, {
            color: '#C0392B',
            weight: 3,
            opacity: 0.8,
            dashArray: '6, 8'
          }).addTo(map);
          map.fitBounds(group, { padding: [30, 30] });
        }
      } catch (err) {
        console.warn('Leaflet render error:', err);
      }
    }, 150);
  }


  function appendLoadingBubble() {
    const id = 'loading-' + Date.now();
    const item = document.createElement('div');
    item.className = 'message-item assistant';
    item.id = id;

    const indicator = document.createElement('div');
    indicator.className = 'loading-indicator';
    indicator.innerHTML = '<div class="spinner"></div><span>Consulting Kolkata Puja MCP server & tools...</span>';

    item.appendChild(indicator);
    messagesList.appendChild(item);
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    return id;
  }

  function removeLoadingBubble(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  // Structured Markdown Renderer with Visual Badges
  function renderMarkdown(md) {
    let html = md;

    // 1. Markdown Images: ![caption](url)
    html = html.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, (match, caption, url) => {
      return `<div class="pandal-img-card"><img src="${url}" alt="${caption}" loading="lazy"><div class="pandal-img-caption">📷 ${caption || 'Pandal Photo'}</div></div>`;
    });

    // 2. Normalize orphan icon headings & inline bullet separators
    html = html.replace(/(?:^|\n)\s*🏛️\s*\n+(\d+\.\s+[^\n]+)/g, '\n\n### $1\n\n');
    html = html.replace(/\s+-\s+(?=[🚇🎨👥⏱️🍽️🚶🌸]|\*\*)/g, '\n- ');

    // 3. Headings: ### and ## (ensure padded newlines for clean separation)
    html = html.replace(/^###\s*(.+)$/gm, '\n\n<h3 class="pandal-card-title"><span class="title-icon">🏛️</span> $1</h3>\n\n');
    html = html.replace(/^##\s*(.+)$/gm, '\n\n<h2 class="section-title">$1</h2>\n\n');

    // 4. Google Maps Links: [Label](https://www.google.com/maps/...)
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/(?:www\.)?google\.com\/maps[^\s)]+)\)/g, (match, label, url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="route-map-btn">📍 ${label}</a>`;
    });

    // 5. Regular Links
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // 6. Bold
    html = html.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');

    // 7. Pill Item Formatter (Metro, Theme, Crowd, Walk, Time, Food)
    function formatPillItem(raw) {
      let content = raw.replace(/^[\-\*]\s+/, '').trim();
      
      // Metro / মেট্রো
      if (content.match(/^(?:🚇\s*)?(?:<strong>)?(?:Metro|Nearest Metro|নিকটবর্তী মেট্রো|মেট্রো)(?:<\/strong>)?:\s*(.*)/i)) {
        const val = content.replace(/^(?:🚇\s*)?(?:<strong>)?(?:Metro|Nearest Metro|নিকটবর্তী মেট্রো|মেট্রো)(?:<\/strong>)?:\s*/i, '');
        return `<div class="pandal-pill-row"><span class="info-pill pill-metro">🚇 Metro</span><span class="pill-text">${val}</span></div>`;
      }
      // Theme / থিম / Heritage
      if (content.match(/^(?:🎨\s*)?(?:<strong>)?(?:Theme|Theme & Heritage|থিম|থিম ও ঐতিহ্য|ঐতিহ্য)(?:<\/strong>)?:\s*(.*)/i)) {
        const val = content.replace(/^(?:🎨\s*)?(?:<strong>)?(?:Theme|Theme & Heritage|থিম|থিম ও ঐতিহ্য|ঐতিহ্য)(?:<\/strong>)?:\s*/i, '');
        return `<div class="pandal-pill-row"><span class="info-pill pill-theme">🎨 Theme</span><span class="pill-text">${val}</span></div>`;
      }
      // Crowd / ভিড় / Best Time
      if (content.match(/^(?:👥\s*)?(?:<strong>)?(?:Crowd|Crowd & Best Time|Crowd \/ Tip|Crowd & Tips|ভিড়|ভিড় ও সেরা সময়|ভিড় \/ টিপ)(?:<\/strong>)?:\s*(.*)/i)) {
        const val = content.replace(/^(?:👥\s*)?(?:<strong>)?(?:Crowd|Crowd & Best Time|Crowd \/ Tip|Crowd & Tips|ভিড়|ভিড় ও সেরা সময়|ভিড় \/ টিপ)(?:<\/strong>)?:\s*/i, '');
        return `<div class="pandal-pill-row"><span class="info-pill pill-crowd">👥 Crowd & Tips</span><span class="pill-text">${val}</span></div>`;
      }
      // Next Stop / Direction / Walk / হাঁটার রুট
      if (content.match(/^(?:🚶\s*)?(?:<strong>)?(?:Next Stop|Next Stop Direction|To Next Stop|Direction|Walk|পরবর্তী গন্তব্যে হাঁটার পথ|হাঁটার রুট|পরবর্তী গন্তব্য)(?:<\/strong>)?:\s*(.*)/i)) {
        const val = content.replace(/^(?:🚶\s*)?(?:<strong>)?(?:Next Stop|Next Stop Direction|To Next Stop|Direction|Walk|পরবর্তী গন্তব্যে হাঁটার পথ|হাঁটার রুট|পরবর্তী গন্তব্য)(?:<\/strong>)?:\s*/i, '');
        return `<div class="pandal-pill-row"><span class="info-pill pill-walk">🚶 Walk Next</span><span class="pill-text">${val}</span></div>`;
      }
      // Best Time / Timing / সময়
      if (content.match(/^(?:⏱️\s*)?(?:<strong>)?(?:Best Time|Timing|সময়)(?:<\/strong>)?:\s*(.*)/i)) {
        const val = content.replace(/^(?:⏱️\s*)?(?:<strong>)?(?:Best Time|Timing|সময়)(?:<\/strong>)?:\s*/i, '');
        return `<div class="pandal-pill-row"><span class="info-pill pill-time">⏱️ Timing</span><span class="pill-text">${val}</span></div>`;
      }
      // Food / খাবার / Sweets
      if (content.match(/^(?:🍽️\s*)?(?:<strong>)?(?:Food|Food Stop|খাবার|মিষ্টি|Restaurant)(?:<\/strong>)?:\s*(.*)/i)) {
        const val = content.replace(/^(?:🍽️\s*)?(?:<strong>)?(?:Food|Food Stop|খাবার|মিষ্টি|Restaurant)(?:<\/strong>)?:\s*/i, '');
        return `<div class="pandal-pill-row"><span class="info-pill pill-food">🍽️ Food Stop</span><span class="pill-text">${val}</span></div>`;
      }
      return content;
    }

    // 8. Paragraphs & Lists processing
    const paragraphs = html.split(/\n\n+/);
    html = paragraphs.map(p => {
      p = p.trim();
      if (!p) return '';
      if (p.startsWith('<h2') || p.startsWith('<h3') || p.startsWith('<div class="pandal-img-card"')) {
        return p;
      }
      
      // Process bullet lists (including multi-line blocks with bullets)
      if (p.includes('\n- ') || p.includes('\n* ') || p.startsWith('- ') || p.startsWith('* ')) {
        const rawLines = p.split(/\n+/).map(l => l.trim()).filter(Boolean);
        const outputBlocks = [];
        let currentBullets = [];

        function flushBullets() {
          if (currentBullets.length > 0) {
            const hasPills = currentBullets.some(bl => /Metro|মেট্রো|Theme|থিম|Crowd|ভিড়|Next Stop|Walk|Food|খাবার/i.test(bl));
            const items = currentBullets.map(li => `<li>${formatPillItem(li)}</li>`).join('');
            outputBlocks.push(`<ul class="${hasPills ? 'pandal-info-list' : ''}">${items}</ul>`);
            currentBullets = [];
          }
        }

        rawLines.forEach(line => {
          if (line.startsWith('- ') || line.startsWith('* ')) {
            currentBullets.push(line);
          } else {
            flushBullets();
            outputBlocks.push(`<p>${line}</p>`);
          }
        });
        flushBullets();
        return outputBlocks.join('\n');
      }

      if (p.startsWith('1. ') || p.startsWith('2. ')) {
        const items = p.split(/\n\d+\.\s+/).map(li => `<li>${formatPillItem(li)}</li>`).join('');
        return `<ol>${items}</ol>`;
      }
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

    return html;
  }

  // Modals
  function showQuotaModal() {
    quotaModal.style.display = 'flex';
  }

  async function performReset() {
    try {
      const resp = await fetch('/api/reset-quota', { method: 'POST' });
      if (resp.ok) {
        const data = await resp.json();
        updateQuotaDisplay(data.remaining, data.limit);
        quotaModal.style.display = 'none';
      }
    } catch (e) {
      console.error('Reset error:', e);
    }
  }

  const modalResetBtn = document.getElementById('modal-reset-btn');
  if (modalResetBtn) modalResetBtn.addEventListener('click', performReset);
  quotaBadge.style.cursor = 'pointer';
  quotaBadge.title = 'Click to reset questions for testing';
  quotaBadge.addEventListener('click', performReset);

  // API Key Settings Modal
  const apiKeyModal = document.getElementById('api-key-modal');
  const openKeysBtn = document.getElementById('open-keys-btn');
  const closeKeysBtn = document.getElementById('close-keys-btn');
  const saveKeysBtn = document.getElementById('save-keys-btn');
  const clearKeysBtn = document.getElementById('clear-keys-btn');
  const modalAddKeyBtn = document.getElementById('modal-add-key-btn');

  const inputGeminiKey = document.getElementById('user-gemini-key');
  const inputGroqKey = document.getElementById('user-groq-key');
  const inputOpenaiKey = document.getElementById('user-openai-key');
  const inputClaudeKey = document.getElementById('user-claude-key');

  function openKeyModal() {
    if (inputGeminiKey) inputGeminiKey.value = userKeys.gemini || '';
    if (inputGroqKey) inputGroqKey.value = userKeys.groq || '';
    if (inputOpenaiKey) inputOpenaiKey.value = userKeys.openai || '';
    if (inputClaudeKey) inputClaudeKey.value = userKeys.anthropic || '';
    if (apiKeyModal) apiKeyModal.style.display = 'flex';
  }

  if (openKeysBtn) openKeysBtn.addEventListener('click', openKeyModal);
  if (modalAddKeyBtn) {
    modalAddKeyBtn.addEventListener('click', () => {
      quotaModal.style.display = 'none';
      openKeyModal();
    });
  }

  // Toggle "How to get key?" guide accordions
  document.querySelectorAll('.key-guide-toggle').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = link.getAttribute('data-target');
      const box = document.getElementById(targetId);
      if (box) {
        box.style.display = box.style.display === 'none' ? 'block' : 'none';
      }
    });
  });

  if (closeKeysBtn) {
    closeKeysBtn.addEventListener('click', () => {
      if (apiKeyModal) apiKeyModal.style.display = 'none';
    });
  }

  if (saveKeysBtn) {
    saveKeysBtn.addEventListener('click', () => {
      userKeys.gemini = (inputGeminiKey?.value || '').trim();
      userKeys.groq = (inputGroqKey?.value || '').trim();
      userKeys.openai = (inputOpenaiKey?.value || '').trim();
      userKeys.anthropic = (inputClaudeKey?.value || '').trim();

      localStorage.setItem('user_key_gemini', userKeys.gemini);
      localStorage.setItem('user_key_groq', userKeys.groq);
      localStorage.setItem('user_key_openai', userKeys.openai);
      localStorage.setItem('user_key_anthropic', userKeys.anthropic);

      // Auto-switch provider dropdown to configured key if current provider has no custom key
      const current = modelSelect.value;
      if (!hasCustomKeyForProvider(current)) {
        const configuredProvider = ['gemini', 'groq', 'openai', 'anthropic'].find(p => hasCustomKeyForProvider(p));
        if (configuredProvider) {
          modelSelect.value = configuredProvider;
        }
      }

      if (hasCustomKeyForProvider(modelSelect.value)) {
        remainingQuestions = 9999;
      }

      updateKeyBadgeStatus();
      updateQuotaDisplay(remainingQuestions);
      if (apiKeyModal) apiKeyModal.style.display = 'none';
      if (quotaModal) quotaModal.style.display = 'none';

      alert("API keys saved securely in your browser! You now have unlimited questions for your configured models.");
    });
  }

  if (clearKeysBtn) {
    clearKeysBtn.addEventListener('click', () => {
      ['user_key_gemini', 'user_key_groq', 'user_key_openai', 'user_key_anthropic'].forEach(k => localStorage.removeItem(k));
      userKeys.gemini = '';
      userKeys.groq = '';
      userKeys.openai = '';
      userKeys.anthropic = '';
      if (inputGeminiKey) inputGeminiKey.value = '';
      if (inputGroqKey) inputGroqKey.value = '';
      if (inputOpenaiKey) inputOpenaiKey.value = '';
      if (inputClaudeKey) inputClaudeKey.value = '';

      updateKeyBadgeStatus();
      updateQuotaDisplay(guestRemainingQuestions);
      alert("All custom API keys cleared from browser storage.");
    });
  }

  modelSelect.addEventListener('change', () => {
    updateModelSelectLabels();
    updateQuotaDisplay(guestRemainingQuestions);
  });

  // On page load, auto-select provider if user has a custom key configured
  const savedKeyProvider = ['gemini', 'groq', 'openai', 'anthropic'].find(p => hasCustomKeyForProvider(p));
  if (savedKeyProvider && !hasCustomKeyForProvider(modelSelect.value)) {
    modelSelect.value = savedKeyProvider;
  }

  // Start session
  updateModelSelectLabels();
  updateKeyBadgeStatus();
  initSession().then(() => {
    updateModelSelectLabels();
    updateKeyBadgeStatus();
  });
});
