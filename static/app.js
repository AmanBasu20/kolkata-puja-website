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
  const apiKeyModal = document.getElementById('api-key-modal');
  const openKeysBtn = document.getElementById('open-keys-btn');
  const closeKeysBtn = document.getElementById('close-keys-btn');
  const saveKeysBtn = document.getElementById('save-keys-btn');
  const clearKeysBtn = document.getElementById('clear-keys-btn');
  const modalAddKeyBtn = document.getElementById('modal-add-key-btn');
  const modalResetBtn = document.getElementById('modal-reset-btn');

  const inputGeminiKey = document.getElementById('user-gemini-key');
  const inputGroqKey = document.getElementById('user-groq-key');
  const inputOpenaiKey = document.getElementById('user-openai-key');
  const inputClaudeKey = document.getElementById('user-claude-key');

  const imageModal = document.getElementById('image-modal');
  const imageModalImg = document.getElementById('image-modal-img');
  const imageModalCaption = document.getElementById('image-modal-caption');
  const imageModalClose = document.getElementById('image-modal-close');

  // Sidebar Elements
  const sidebarDrawer = document.getElementById('sidebar-drawer');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
  const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
  const navNewChatBtn = document.getElementById('nav-new-chat-btn');
  const sidebarNewChatBtn = document.getElementById('sidebar-new-chat-btn');
  const chatHistoryList = document.getElementById('chat-history-list');
  const langSelect = document.getElementById('lang-select');

  let conversationHistory = [];
  let remainingQuestions = 5;
  let guestRemainingQuestions = 5;
  let isGenerating = false;
  let currentLang = 'en'; // 'en', 'bn', or 'hi'

  // Chat History & Session State (localStorage)
  const SESSIONS_STORAGE_KEY = 'pujo_parikrama_sessions';
  let chatSessions = [];
  let currentSessionId = null;

  // Multi-Backend Pool Configuration (Sticky Session + Automatic Failover)
  const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const BACKEND_POOLS = isLocalHost
    ? [
        'http://localhost:8000',
        'http://localhost:8001',
        'http://localhost:8002'
      ]
    : [
        'https://kolkata-puja-website.onrender.com',
        'https://kolkata-puja-backend-2.onrender.com',
        'https://kolkata-puja-backend-3.onrender.com'
      ];

  function getBackendCandidates(sessionId) {
    if (!BACKEND_POOLS || BACKEND_POOLS.length === 0) return [''];
    let hash = 0;
    const str = String(sessionId || 'default');
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const primaryIdx = Math.abs(hash) % BACKEND_POOLS.length;
    const candidates = [];
    for (let i = 0; i < BACKEND_POOLS.length; i++) {
      candidates.push(BACKEND_POOLS[(primaryIdx + i) % BACKEND_POOLS.length]);
    }
    return candidates;
  }

  function loadSessions() {
    try {
      const saved = localStorage.getItem(SESSIONS_STORAGE_KEY);
      if (saved) {
        chatSessions = JSON.parse(saved);
        if (!Array.isArray(chatSessions)) chatSessions = [];
      }
    } catch (e) {
      console.warn("Could not load chat sessions:", e);
      chatSessions = [];
    }
  }

  function saveSessions() {
    try {
      if (chatSessions.length > 30) {
        chatSessions = chatSessions.slice(0, 30);
      }
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(chatSessions));
    } catch (e) {
      console.warn("Could not save chat sessions:", e);
    }
  }

  function formatSessionTitle(text) {
    if (!text) return 'Puja Conversation';
    let clean = text.trim()
      .replace(/^I am currently located at GPS coordinates.*?\.\s*/i, '')
      .replace(/\s+/g, ' ');
    if (clean.length > 36) {
      const trimmed = clean.substring(0, 36);
      const lastSpace = trimmed.lastIndexOf(' ');
      clean = (lastSpace > 18 ? trimmed.substring(0, lastSpace) : trimmed) + '...';
    }
    return clean || 'Puja Conversation';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
      tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag)
    );
  }

  function renderChatHistory() {
    if (!chatHistoryList) return;
    chatHistoryList.innerHTML = '';

    if (chatSessions.length === 0) {
      const t = translations[currentLang] || translations.en;
      const empty = document.createElement('div');
      empty.className = 'chat-history-empty';
      empty.textContent = t.emptyHistory || 'No saved chats yet. Ask a question to begin!';
      chatHistoryList.appendChild(empty);
      return;
    }

    chatSessions.forEach(session => {
      const item = document.createElement('div');
      item.className = `chat-history-item ${session.id === currentSessionId ? 'active' : ''}`;
      
      const main = document.createElement('div');
      main.className = 'chat-item-main';
      main.innerHTML = `<span class="chat-item-icon">💬</span><span class="chat-item-title">${escapeHtml(session.title || 'Conversation')}</span>`;
      
      const delBtn = document.createElement('button');
      delBtn.className = 'chat-item-del-btn';
      delBtn.innerHTML = '🗑️';
      delBtn.title = 'Delete chat';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSession(session.id);
      });

      item.appendChild(main);
      item.appendChild(delBtn);

      item.addEventListener('click', () => {
        openSession(session.id);
      });

      chatHistoryList.appendChild(item);
    });
  }

  let activePendingSessionId = null;

  function openSession(sessionId) {
    const session = chatSessions.find(s => s.id === sessionId);
    if (!session) return;

    currentSessionId = sessionId;
    conversationHistory = (session.conversationHistory || []).slice();

    // Clear messages and re-populate
    messagesList.innerHTML = '';
    (session.messages || []).forEach(msg => {
      appendMessage(msg.role, msg.content, false);
    });

    // If this session is currently awaiting response, show loading indicator
    if (activePendingSessionId === sessionId) {
      appendLoadingBubble();
    }

    // Switch view to chat
    heroView.style.display = 'none';
    chatView.style.display = 'flex';
    navBrand.style.display = 'flex';

    renderChatHistory();
    closeSidebar();
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  function startNewChat() {
    currentSessionId = null;
    conversationHistory = [];
    messagesList.innerHTML = '';

    heroView.style.display = 'flex';
    chatView.style.display = 'none';

    renderChatHistory();
    closeSidebar();
    if (heroInput) {
      heroInput.value = '';
      heroInput.focus();
    }
  }

  function deleteSession(sessionId) {
    const confirmMsg = currentLang === 'bn'
      ? 'আপনি কি এই চ্যাটটি মুছে ফেলতে চান?'
      : (currentLang === 'hi'
        ? 'क्या आप इस बातचीत को हटाना चाहते हैं?'
        : 'Are you sure you want to delete this chat?');
    if (!confirm(confirmMsg)) return;

    chatSessions = chatSessions.filter(s => s.id !== sessionId);
    saveSessions();
    if (currentSessionId === sessionId) {
      startNewChat();
    } else {
      renderChatHistory();
    }
  }

  function ensureCurrentSession(firstUserPrompt) {
    if (!currentSessionId) {
      const title = formatSessionTitle(firstUserPrompt);
      const newSession = {
        id: 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        title: title,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        conversationHistory: []
      };
      chatSessions.unshift(newSession);
      currentSessionId = newSession.id;
      saveSessions();
      renderChatHistory();
    }
    return currentSessionId;
  }

  function recordSessionMessage(sessionId, role, content, historyTurn = null) {
    if (!sessionId) return;
    const session = chatSessions.find(s => s.id === sessionId);
    if (session) {
      if (!session.messages) session.messages = [];
      session.messages.push({ role, content });
      if (historyTurn) {
        if (!session.conversationHistory) session.conversationHistory = [];
        session.conversationHistory.push(historyTurn);
      }
      session.updatedAt = Date.now();
      saveSessions();
    }
  }

  // Sidebar Drawer Open/Close controls
  function openSidebar() {
    if (sidebarDrawer) sidebarDrawer.classList.add('open');
    if (sidebarOverlay) sidebarOverlay.classList.add('active');
  }

  function closeSidebar() {
    if (sidebarDrawer) sidebarDrawer.classList.remove('open');
    if (sidebarOverlay) sidebarOverlay.classList.remove('active');
  }

  if (sidebarToggleBtn) sidebarToggleBtn.addEventListener('click', openSidebar);
  if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', closeSidebar);
  if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);
  if (navNewChatBtn) navNewChatBtn.addEventListener('click', startNewChat);
  if (sidebarNewChatBtn) sidebarNewChatBtn.addEventListener('click', startNewChat);
  if (navBrand) navBrand.addEventListener('click', startNewChat);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (quotaModal && quotaModal.style.display !== 'none') {
        quotaModal.style.display = 'none';
      }
      if (apiKeyModal && apiKeyModal.style.display !== 'none') {
        apiKeyModal.style.display = 'none';
      }
      if (imageModal && imageModal.style.display !== 'none') {
        imageModal.style.display = 'none';
      }
      if (sidebarDrawer && sidebarDrawer.classList.contains('open')) {
        closeSidebar();
      }
    }
  });

  const translations = {
    en: {
      assistantLabel: '🤖 Assistant:',
      langLabel: '🌐 Language / ভাষা:',
      motifText: 'শুভ শারদীয়া',
      title: 'Kolkata Pujo Parikrama',
      placeholder: 'Ask about pandals, routes, Metro timings, or traffic...',
      chatPlaceholder: 'Ask a follow-up question...',
      suggestionsLabel: 'Popular Puja Inquiries',
      quotaChecking: 'Checking questions...',
      quotaFreeLeft: '{n} of {limit} free left',
      quotaUnlimited: 'Unlimited (Testing)',
      quotaMyKey: 'Unlimited (My Key)',
      consulting: 'Consulting Kolkata Puja MCP server & tools...',
      connError: '⚠️ Connection error. Please check your network and try again.',
      shareWa: 'Share to WhatsApp',
      copyPlan: 'Copy Plan',
      copied: 'Copied!',
      sidebarTitle: 'Conversations',
      newChat: 'New Conversation',
      recentChats: 'Recent Chats',
      emptyHistory: 'No saved chats yet. Start asking questions above!'
    },
    bn: {
      assistantLabel: '🤖 সহকারী:',
      langLabel: '🌐 ভাষা:',
      motifText: 'শুভ শারদীয়া',
      title: 'কলকাতা পুজো পরিক্রমা',
      placeholder: 'মণ্ডপ, রুট, মেট্রো সময়সূচী বা ট্র্যাফিক সম্পর্কে জিজ্ঞাসা করুন...',
      chatPlaceholder: 'পরবর্তী প্রশ্নটি এখানে লিখুন...',
      suggestionsLabel: 'জনপ্রিয় পুজো অনুসন্ধান',
      quotaChecking: 'প্রশ্ন গণনা হচ্ছে...',
      quotaFreeLeft: '{limit} টির মধ্যে {n} টি বাকি',
      quotaUnlimited: 'সীমাহীন (টেস্টিং)',
      quotaMyKey: 'সীমাহীন (আমার কি)',
      consulting: 'কলকাতা পুজো এমসিপি টুল থেকে তথ্য আনা হচ্ছে...',
      connError: '⚠️ সংযোগ সমস্যা। দয়া করে ইন্টারনেট চেক করে আবার চেষ্টা করুন।',
      shareWa: 'হোয়াটসঅ্যাপে পাঠান',
      copyPlan: 'প্ল্যান কপি করুন',
      copied: 'কপি হয়েছে!',
      sidebarTitle: 'কথোপকথন',
      newChat: 'নতুন চ্যাট',
      recentChats: 'পূর্ববর্তী চ্যাটসমূহ',
      emptyHistory: 'এখনও কোনো সেভ করা চ্যাট নেই। প্রশ্ন করে শুরু করুন!'
    },
    hi: {
      assistantLabel: '🤖 सहायक:',
      langLabel: '🌐 भाषा:',
      motifText: 'शुभ शारदीय',
      title: 'कोलकाता पूजा परिक्रमा',
      placeholder: 'पंडाल, रूट, मेट्रो समय या ट्रैफिक के बारे में पूछें...',
      chatPlaceholder: 'अगला प्रश्न यहाँ पूछें...',
      suggestionsLabel: 'लोकप्रिय पूजा प्रश्न',
      quotaChecking: 'प्रश्न गिने जा रहे हैं...',
      quotaFreeLeft: '{limit} में से {n} प्रश्न शेष',
      quotaUnlimited: 'असीमित (परीक्षण)',
      quotaMyKey: 'असीमित (मेरी की)',
      consulting: 'कोलकाता पूजा डेटा से जानकारी खोजी जा रही है...',
      connError: '⚠️ कनेक्शन त्रुटि। कृपया नेटवर्क जांचें और पुनः प्रयास करें।',
      shareWa: 'व्हाट्सएप पर शेयर करें',
      copyPlan: 'योजना कॉपी करें',
      copied: 'कॉपी हो गया!',
      sidebarTitle: 'बातचीत',
      newChat: 'नई बातचीत',
      recentChats: 'पिछली बातचीत',
      emptyHistory: 'अभी तक कोई चैट नहीं है। ऊपर प्रश्न पूछकर शुरुआत करें!'
    }
  };

  // Dynamic Daily Puja Tithi / Greeting Helper (Asia/Kolkata timezone)
  function getDailyPujaGreeting(lang = 'en') {
    let month = 10;
    let day = 13;
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        month: 'numeric',
        day: 'numeric'
      }).formatToParts(new Date());
      month = parseInt(parts.find(p => p.type === 'month')?.value || '10', 10);
      day = parseInt(parts.find(p => p.type === 'day')?.value || '13', 10);
    } catch (e) {
      const now = new Date();
      month = now.getMonth() + 1;
      day = now.getDate();
    }

    const tithiMap = {
      '10-11': { motifBn: 'শুভ মহালয়া', motifHi: 'शुभ महालया', subEn: 'Shubho Mahalaya • শারদ শুভেচ্ছা', subBn: 'দেবীপক্ষের সূচনা • শারদ শুভেচ্ছা', subHi: 'शुभ महालया • शारदीय शुभकामनाएं', greetEn: 'Shubho Mahalaya!' },
      '10-13': { motifBn: 'শুভ তৃতীয়া', motifHi: 'शुभ तृतीया', subEn: 'Shubho Tritiya • শারদ শুভেচ্ছা', subBn: 'শারদীয়া দুর্গাপুজোর শুভেচ্ছা', subHi: 'शुभ तृतीया • शारदीय शुभकामनाएं', greetEn: 'Shubho Tritiya!' },
      '10-14': { motifBn: 'শুভ চতুর্থী', motifHi: 'शुभ चतुर्थी', subEn: 'Shubho Chaturthi • শারদ শুভেচ্ছা', subBn: 'শারদীয়া দুর্গাপুজোর শুভেচ্ছা', subHi: 'शुभ चतुर्थी • शारदीय शुभकामनाएं', greetEn: 'Shubho Chaturthi!' },
      '10-15': { motifBn: 'শুভ পঞ্চমী', motifHi: 'शुभ पंचमी', subEn: 'Shubho Panchami • শারদ শুভেচ্ছা', subBn: 'মহা পঞ্চমীর প্রীতি ও শুভেচ্ছা', subHi: 'शुभ पंचमी • शारदीय शुभकामनाएं', greetEn: 'Shubho Panchami!' },
      '10-16': { motifBn: 'শুভ ষষ্ঠী', motifHi: 'शुभ षष्ठी', subEn: 'Shubho Shasthi • দেবীর বোধন', subBn: 'মহা ষষ্ঠীর প্রীতি ও শুভেচ্ছা', subHi: 'शुभ षष्ठी • शारदीय शुभकामनाएं', greetEn: 'Shubho Shasthi!' },
      '10-17': { motifBn: 'শুভ মহাসপ্তমী', motifHi: 'शुभ महासप्तमी', subEn: 'Shubho Maha Saptami • শারদ শুভেচ্ছা', subBn: 'মহাসপ্তমীর প্রীতি ও শুভেচ্ছা', subHi: 'शुभ महासप्तमी • शारदीय शुभकामनाएं', greetEn: 'Shubho Saptami!' },
      '10-18': { motifBn: 'শুভ মহাষ্টমী', motifHi: 'शुभ महाअष्टमी', subEn: 'Shubho Maha Ashtami • অঞ্জলি ও সন্ধিপুজো', subBn: 'মহাষ্টমীর প্রীতি ও শুভেচ্ছা', subHi: 'शुभ महाअष्टमी • शारदीय शुभकामनाएं', greetEn: 'Shubho Ashtami!' },
      '10-19': { motifBn: 'শুভ মহানবমী', motifHi: 'शुभ महानवमी', subEn: 'Shubho Maha Navami • শারদ শুভেচ্ছা', subBn: 'মহানবমীর প্রীতি ও শুভেচ্ছা', subHi: 'शुभ महानवमी • शारदीय शुभकामनाएं', greetEn: 'Shubho Navami!' },
      '10-20': { motifBn: 'শুভ বিজয়া দশমী', motifHi: 'शुभ विजया दशमी', subEn: 'Shubho Bijoya Dashami • সিঁদুর খেলা', subBn: 'শুভ বিজয়ার প্রীতি ও শুভেচ্ছা', subHi: 'शुभ विजया दशमी • हार्दिक शुभकामनाएं', greetEn: 'Shubho Bijoya!' },
      '10-21': { motifBn: 'শুভ বিজয়া', motifHi: 'शुभ विजया', subEn: 'Shubho Bijoya • প্রীতি ও শুভেচ্ছা', subBn: 'শুভ বিজয়ার আন্তরিক শুভেচ্ছা', subHi: 'शुभ विजया • हार्दिक शुभकामनाएं', greetEn: 'Shubho Bijoya!' },
      '10-22': { motifBn: 'শুভ বিজয়া', motifHi: 'शुभ विजয়া', subEn: 'Shubho Bijoya • প্রীতি ও শুভেচ্ছা', subBn: 'শুভ বিজয়ার আন্তরিক শুভেচ্ছা', subHi: 'शुभ विजया • हार्दिक शुभकामनाएं', greetEn: 'Shubho Bijoya!' }
    };

    const key = `${month}-${day}`;
    const entry = tithiMap[key] || {
      motifBn: 'শুভ শারদীয়া',
      motifHi: 'शुभ शारदीय',
      subEn: 'Shubho Sharodiya • শারদ শুভেচ্ছা',
      subBn: 'শারদীয়া দুর্গাপুজোর শুভেচ্ছা',
      subHi: 'शारदीय दुर्गा पूजा की शुभकामनाएं',
      greetEn: 'Shubho Sharodiya!'
    };

    return {
      motif: lang === 'hi' ? entry.motifHi : entry.motifBn,
      subtitle: lang === 'bn' ? entry.subBn : (lang === 'hi' ? entry.subHi : entry.subEn),
      greetPrefix: lang === 'bn' ? `${entry.motifBn}! ` : (lang === 'hi' ? `${entry.motifHi}! ` : `🌸 ${entry.greetEn} `)
    };
  }

  function applyLanguage(lang) {
    if (!translations[lang]) lang = 'en';
    currentLang = lang;
    const t = translations[lang];
    const dailyGreeting = getDailyPujaGreeting(lang);

    const assistantLabel = document.getElementById('assistant-label');
    if (assistantLabel) assistantLabel.textContent = t.assistantLabel;

    const langLabel = document.getElementById('lang-label');
    if (langLabel) langLabel.textContent = t.langLabel;

    const heroMotifText = document.getElementById('hero-motif-text');
    if (heroMotifText) heroMotifText.textContent = dailyGreeting.motif;

    const heroTithiSub = document.getElementById('hero-tithi-sub');
    if (heroTithiSub) heroTithiSub.textContent = dailyGreeting.subtitle;

    const heroTitle = document.querySelector('.hero-title');
    if (heroTitle) heroTitle.textContent = t.title;

    const navBrandText = document.querySelector('.nav-brand-text');
    if (navBrandText) navBrandText.textContent = t.title;

    if (heroInput) heroInput.placeholder = t.placeholder;
    if (chatInput) chatInput.placeholder = t.chatPlaceholder;

    const suggestionsLabel = document.getElementById('suggestions-label');
    if (suggestionsLabel) suggestionsLabel.textContent = t.suggestionsLabel;

    const sidebarTitleText = document.getElementById('sidebar-title-text');
    if (sidebarTitleText) sidebarTitleText.textContent = t.sidebarTitle;

    const sidebarNewChatText = document.getElementById('sidebar-new-chat-text');
    if (sidebarNewChatText) sidebarNewChatText.textContent = t.newChat;

    const navNewChatText = document.getElementById('nav-new-chat-text');
    if (navNewChatText) navNewChatText.textContent = t.newChat;

    const sidebarHistoryLabel = document.getElementById('sidebar-history-label');
    if (sidebarHistoryLabel) sidebarHistoryLabel.textContent = t.recentChats;

    if (langSelect && langSelect.value !== lang) {
      langSelect.value = lang;
    }

    updateModelSelectLabels();
    updateQuotaDisplay(remainingQuestions);
    renderChatHistory();
    if (typeof renderRotatingSuggestions === 'function') {
      renderRotatingSuggestions();
    }
  }

  // Traditional Authentic Sharodiya Dhak Audio Player
  const dhakAudioBtn = document.getElementById('dhak-audio-btn');
  const dhakAudioIcon = document.getElementById('dhak-audio-icon');
  const dhakAudioLabel = document.getElementById('dhak-audio-label');
  let dhakHtmlAudio = null;
  let isDhakPlaying = false;

  function toggleDhakAudio() {
    if (isDhakPlaying) {
      if (dhakHtmlAudio) {
        dhakHtmlAudio.pause();
      }
      isDhakPlaying = false;
      if (dhakAudioBtn) dhakAudioBtn.classList.remove('playing');
      if (dhakAudioIcon) dhakAudioIcon.textContent = '🔇';
      if (dhakAudioLabel) dhakAudioLabel.textContent = 'Dhak';
      return;
    }

    try {
      if (!dhakHtmlAudio) {
        // Zero network impact on page load: loads only on explicit user click!
        dhakHtmlAudio = new Audio('/static/dhak.mp3');
        dhakHtmlAudio.loop = true;
        dhakHtmlAudio.volume = 0.65; // Pleasant, gentle festive ambient volume
      }

      dhakHtmlAudio.play().then(() => {
        isDhakPlaying = true;
        if (dhakAudioBtn) dhakAudioBtn.classList.add('playing');
        if (dhakAudioIcon) dhakAudioIcon.textContent = '🥁';
        if (dhakAudioLabel) dhakAudioLabel.textContent = 'Dhak 🔊';
      }).catch(err => {
        console.warn('Audio play error (requires user interaction):', err);
      });
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  }

  if (dhakAudioBtn) {
    dhakAudioBtn.addEventListener('click', toggleDhakAudio);
  }

  if (langSelect) {
    langSelect.addEventListener('change', () => {
      applyLanguage(langSelect.value);
      try {
        localStorage.setItem('pujo_selected_lang', langSelect.value);
      } catch (e) {}
    });
  }

  // Initialize session and quota
  async function initSession() {
    try {
      const resp = await fetch('/api/session');
      if (resp.ok) {
        const data = await resp.json();
        const storedUsed = parseInt(localStorage.getItem('pujo_guest_used') || '0', 10);
        const serverRemaining = data.remaining !== undefined ? data.remaining : 5;
        // Strict limit: lowest remaining between server and local storage
        guestRemainingQuestions = Math.min(serverRemaining, Math.max(0, 5 - storedUsed));
        const currentProvider = modelSelect.value;
        if (hasCustomKeyForProvider(currentProvider)) {
          remainingQuestions = 9999;
          updateQuotaDisplay(9999);
        } else {
          remainingQuestions = guestRemainingQuestions;
          updateQuotaDisplay(guestRemainingQuestions, data.limit || 5);
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
    const isHi = currentLang === 'hi';
    const options = modelSelect.querySelectorAll('option');
    options.forEach(opt => {
      const val = opt.value;
      const isCustom = hasCustomKeyForProvider(val);
      if (val === 'gemini') {
        if (isCustom) {
          opt.textContent = isBn ? 'গুগল জেমিনি ⚡ (আমার কি)' : (isHi ? 'गूगल जेमिनी ⚡ (मेरी की)' : 'Google Gemini ⚡ (My Key)');
        } else {
          opt.textContent = isBn ? 'গুগল জেমিনি (ফ্রি গেস্ট)' : (isHi ? 'गूगल जेमिनी (मुफ़्त अतिथि)' : 'Google Gemini (Free Guest)');
        }
      } else if (val === 'groq') {
        if (isCustom) {
          opt.textContent = isBn ? 'গ্রক ⚡ (আমার কি)' : (isHi ? 'ग्रॉक ⚡ (मेरी की)' : 'Groq ⚡ (My Key)');
        } else {
          opt.textContent = isBn ? 'গ্রক (ফ্রি গেস্ট)' : (isHi ? 'ग्रॉक (मुफ़्त अतिथि)' : 'Groq (Free Guest)');
        }
      } else if (val === 'openai') {
        if (isCustom) {
          opt.textContent = isBn ? 'ওপেনএআই ⚡ (আমার কি)' : (isHi ? 'ओपनएआई ⚡ (मेरी की)' : 'OpenAI ChatGPT ⚡ (My Key)');
        } else {
          opt.textContent = isBn ? 'ওপেনএআই (চ্যাটজিপিটি)' : (isHi ? 'ओपनएआई (चैटजीपीटी)' : 'OpenAI (ChatGPT)');
        }
      } else if (val === 'anthropic') {
        if (isCustom) {
          opt.textContent = isBn ? 'অ্যানথ্রপিক ক্লদ ⚡ (আমার কি)' : (isHi ? 'एंथ्रोपिक ⚡ (मेरी की)' : 'Anthropic Claude ⚡ (My Key)');
        } else {
          opt.textContent = isBn ? 'অ্যানথ্রপিক (ক্লদ)' : (isHi ? 'एंथ्रोपिक (क्लॉड)' : 'Anthropic (Claude)');
        }
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
    const t = translations[currentLang] || translations.en;
    const currentProvider = modelSelect.value;
    
    if (hasCustomKeyForProvider(currentProvider)) {
      remainingQuestions = 9999;
      quotaText.textContent = t.quotaMyKey || "Unlimited (My Key)";
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
    if (!textarea) return;
    textarea.style.height = 'auto';
    const newHeight = Math.min(textarea.scrollHeight, 120);
    textarea.style.height = newHeight + 'px';
    textarea.style.overflowY = textarea.scrollHeight > 120 ? 'auto' : 'hidden';
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

  // Rotating Question Suggestions Pool (English, Bengali, Hindi)
  const SUGGESTION_POOLS = {
    en: [
      { icon: '🚶', title: 'North Heritage Walk', desc: 'Baghbazar → Kumartuli → Sovabazar walking route', prompt: 'Plan a traditional heritage walking Puja route in North Kolkata around Baghbazar and Sovabazar with Metro and food stops' },
      { icon: '🚇', title: 'South Metro Hopper', desc: 'Kalighat → Chetla → Suruchi Sangha route', prompt: 'Plan a 5-pandal Metro tour in South Kolkata starting from Kalighat Metro with timings' },
      { icon: '🌙', title: 'Salt Lake & East Themes', desc: 'FD Block, BJ Block & Sreebhumi guide', prompt: 'Which pandals in Salt Lake and East Kolkata have low crowd and big themes right now?' },
      { icon: '📍', title: 'Pandals Near Me', desc: 'Closest pandals based on my current GPS', prompt: 'near me' },
      { icon: '🚦', title: 'Live Traffic & Roads', desc: 'EM Bypass, Central Ave & Rashbehari status', prompt: 'What is the current traffic update on EM Bypass, Rashbehari Avenue, and Central Avenue?' },
      { icon: '⏱️', title: 'Night Metro Schedule', desc: 'All-night Blue & Green Line special trains', prompt: 'What are the all-night Kolkata Metro timings and service hours for Durga Puja?' },
      { icon: '🌦️', title: 'Weather & What to Wear', desc: 'Sharodiya rain alerts & attire tips', prompt: 'What is the weather advisory for Kolkata pandal-hopping today, and should I carry an umbrella?' },
      { icon: '🎨', title: 'Top Contemporary Themes', desc: 'Tala Prattoy, Suruchi & Chetla Agrani', prompt: 'Which Kolkata Durga Puja pandals have the most acclaimed artistic themes and lighting installations this year?' }
    ],
    bn: [
      { icon: '🚶', title: 'উত্তর কলকাতার সাবেকি পরিক্রমা', desc: 'বাগবাজার → কুমারটুলি → শোভাবাজার হাঁটার পথ', prompt: 'উত্তর কলকাতার বাগবাজার, কুমারটুলি এবং শোভাবাজারের সাবেকি পুজোর হাঁটার রুট প্ল্যান করুন' },
      { icon: '🚇', title: 'দক্ষিণ কলকাতা মেট্রো ট্যুর', desc: 'কালীঘাট → চেতলা → সুরুচি সংঘ মেট্রো রুট', prompt: 'কালীঘাট মেট্রো থেকে শুরু করে দক্ষিণ কলকাতার ৫টি সেরা পুজোর মেট্রো পরিক্রমা তৈরি করুন' },
      { icon: '🌙', title: 'সল্টলেক ও শ্রীভূমি থিম', desc: 'এফডি ব্লক, বিজে ব্লক ও শ্রীভূমি স্পোর্টিং', prompt: 'সল্টলেক ও শ্রীভূমি এলাকায় কম ভিড় এবং সেরা থিমযুক্ত পুজোগুলি কোনগুলি?' },
      { icon: '📍', title: 'আমার কাছের মণ্ডপ', desc: 'জিপিএস অনুযায়ী নিকটবর্তী পুজো', prompt: 'কাছের পুজো' },
      { icon: '⏱️', title: 'সারারাত মেট্রো সময়সূচী', desc: 'ব্লু ও গ্রিন লাইনের বিশেষ পুজো ট্রেন', prompt: 'দুর্গাপুজোর দিনগুলিতে কলকাতার সারারাত মেট্রো পরিষেবার সময়সূচী কী?' },
      { icon: '🌦️', title: 'আবহাওয়া ও পোশাকের টিপস', desc: 'বৃষ্টির সম্ভাবনা ও ছাতা নেওয়ার পরামর্শ', prompt: 'আজ কলকাতায় পুজো দেখার সময় আবহাওয়া কেমন থাকবে? ছাতা বা হালকা পোশাক পরা কি দরকার?' }
    ],
    hi: [
      { icon: '🚶', title: 'उत्तर कोलकाता हेरिटेज वॉक', desc: 'बागबाजार → कुमारटुली → शोभाबाजार पैदल मार्ग', prompt: 'उत्तर कोलकाता के बागबाजार और शोभाबाजार की पारंपरिक पूजा का पैदल रूट प्लान करें' },
      { icon: '🚇', title: 'दक्षिण कोलकाता मेट्रो टूर', desc: 'कालीघाट → चेतला → सुरुचि संघ मेट्रो मार्ग', prompt: 'कालीघाट मेट्रो से शुरू करके दक्षिण कोलकाता के 5 प्रसिद्ध पंडालों का मेट्रो टूर बताएं' },
      { icon: '🌙', title: 'साल्ट लेक और थीम पंडाल', desc: 'एफडी ब्लॉक, बीजे ब्लॉक और श्रीभूमि', prompt: 'साल्ट लेक और ईस्ट कोलकाता में कम भीड़ वाले प्रसिद्ध थीम पंडाल कौन से हैं?' },
      { icon: '📍', title: 'मेरे पास के पंडाल', desc: 'जीपीएस के आधार पर नजदीकी पूजा', prompt: 'मेरे पास के पंडाल' },
      { icon: '⏱️', title: 'रात की मेट्रो समय सारिणी', desc: 'ब्लू और ग्रीन लाइन विशेष ट्रेन सेवा', prompt: 'दुर्गा पूजा के दौरान कोलकाता मेट्रो की रात भर चलने वाली ट्रेनों का समय क्या है?' },
      { icon: '🌦️', title: 'मौसम और पहनावे की सलाह', desc: 'बारिश की चेतावनी और छाते की जरूरत', prompt: 'आज कोलकाता में पूजा घूमने के लिए मौसम कैसा रहेगा और क्या छाता ले जाना चाहिए?' }
    ]
  };

  let currentSuggestionIndex = 0;
  const rotatingSuggestionsEl = document.getElementById('rotating-suggestions');
  const refreshSuggestionsBtn = document.getElementById('refresh-suggestions-btn');

  function renderRotatingSuggestions() {
    if (!rotatingSuggestionsEl) return;
    const pool = SUGGESTION_POOLS[currentLang] || SUGGESTION_POOLS.en;
    rotatingSuggestionsEl.innerHTML = '';

    // Choose at maximum two suggested queries side-by-side
    const count = Math.min(2, pool.length);
    for (let i = 0; i < count; i++) {
      const item = pool[(currentSuggestionIndex + i) % pool.length];
      const card = document.createElement('button');
      card.className = 'suggestion-card';
      card.setAttribute('type', 'button');
      card.innerHTML = `
        <span class="suggestion-icon">${item.icon}</span>
        <div class="suggestion-info">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.desc)}</span>
        </div>
      `;

      card.addEventListener('click', () => {
        if (item.prompt === 'near me' || item.prompt === 'কাছের পুজো' || item.prompt === 'मेरे पास के पंडाल') {
          requestUserLocation();
        } else {
          const inputEl = heroView.style.display !== 'none' ? heroInput : chatInput;
          inputEl.value = item.prompt;
          sendMessage(); // Automatically submit upon click!
        }
      });

      rotatingSuggestionsEl.appendChild(card);
    }
  }

  function rotateSuggestions() {
    const pool = SUGGESTION_POOLS[currentLang] || SUGGESTION_POOLS.en;
    currentSuggestionIndex = (currentSuggestionIndex + 2) % pool.length;
    renderRotatingSuggestions();
  }

  if (refreshSuggestionsBtn) {
    refreshSuggestionsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      rotateSuggestions();
    });
  }

  // Auto-rotate suggestions every 12 seconds if user is idle on hero view
  setInterval(() => {
    if (heroView && heroView.style.display !== 'none') {
      rotateSuggestions();
    }
  }, 12000);

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



  // Helper: Haversine distance in km between two lat/lon points
  function calculateDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Get closest pandals from registered 222 dataset
  function getClosestPandals(lat, lon, count = 5) {
    if (!allKolkataPandals || allKolkataPandals.length === 0) return [];
    const userLat = parseFloat(lat);
    const userLon = parseFloat(lon);
    if (isNaN(userLat) || isNaN(userLon)) return [];

    return allKolkataPandals
      .map(p => ({
        ...p,
        distKm: calculateDistanceKm(userLat, userLon, p.lat, p.lon)
      }))
      .sort((a, b) => a.distKm - b.distKm)
      .slice(0, count);
  }

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
    const storedGuestCount = parseInt(localStorage.getItem('pujo_guest_used') || '0', 10);
    if (!isCustom && (remainingQuestions <= 0 || storedGuestCount >= 5)) {
      guestRemainingQuestions = 0;
      updateQuotaDisplay(0);
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

    // Check if user is explicitly asking for pandals near their own live GPS location ("near me", "around me", or clicked 📍)
    // Do NOT trigger device GPS override when user says "nearby pandals along VIP Road" or "closest to Dum Dum Park"
    const hasSpecificPlace = /\b(dum\s*dum|vip\s*road|baghbazar|sovabazar|shobhabazar|kumartuli|kalighat|chetla|suruchi|sreebhumi|salt\s*lake|tala|maddox|deshapriya|tridhara|ballygunge|gariahat|behala|college\s*square|santosh\s*mitra|ekdalia|mudiali|shib\s*mandir|shyambazar|girish\s*park|ultadanga|lake\s*town|simla|these\s*pandals|same\s*pandals)\b/i.test(text);
    const isNearbyQuery = (!hasSpecificPlace && /\b(near\s+me|around\s+me|closest\s+to\s+me|near\s+my\s+location|আমার\s*কাছে|আমার\s*কাছের|কাছের\s*পুজো|मेरे\s*पास)\b/i.test(text)) || /^near\s*me$/i.test(text.trim()) || /\bGPS coordinates\b/i.test(text);
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

      // Check if text already has GPS coordinates or use cached userGps
      let detectedLat = userGps ? userGps.lat : null;
      let detectedLon = userGps ? userGps.lon : null;
      const coordMatch = text.match(/\b([0-9]{2}\.[0-9]{3,6})\b[,\s]+([0-9]{2}\.[0-9]{3,6})\b/);
      if (coordMatch) {
        detectedLat = coordMatch[1];
        detectedLon = coordMatch[2];
      }

      if (detectedLat && detectedLon) {
        const closest = getClosestPandals(detectedLat, detectedLon, 4);
        if (closest.length > 0) {
          const listStr = closest.map(p => `- ${p.name} (${p.distKm.toFixed(1)} km away, Area: ${p.area || p.zone}, Zone: ${p.zone})`).join('\n');
          backendMessage = `User request: "${text}"\nI am currently located at GPS coordinates (${detectedLat}, ${detectedLon}).\nBased on distance calculations, the closest registered Kolkata Durga Puja pandals to my location are:\n${listStr}\n\nPlease provide a complete guide for these closest accessible pandals including their nearest Kolkata Metro station, theme & heritage, and crowd/best time to visit. Do NOT use markdown tables; use card headings with bullets.`;
        } else {
          backendMessage = `I am currently located at GPS coordinates (${detectedLat}, ${detectedLon}). ${text}`;
        }
      } else {
        backendMessage = `${text} (Note: Device location is unavailable. Please recommend the most famous Durga Puja pandals across South and North Kolkata)`;
      }
    }

    // Lock target session ID for this request
    const targetSessionId = ensureCurrentSession(text);
    activePendingSessionId = targetSessionId;

    // Record user turn to targetSession in storage
    recordSessionMessage(targetSessionId, 'user', text, { role: 'user', content: backendMessage });

    // Only render to UI if user is currently viewing targetSessionId
    if (currentSessionId === targetSessionId) {
      appendMessage('user', text);
      conversationHistory.push({ role: 'user', content: backendMessage });
    }

    // Get conversation history turns specifically for this target session
    const targetSession = chatSessions.find(s => s.id === targetSessionId);
    const sessionHistoryToSend = targetSession ? (targetSession.conversationHistory || []).slice(-6) : [];

    // Show Loading Bubble only if user is currently looking at targetSessionId
    let loadingId = null;
    if (currentSessionId === targetSessionId) {
      loadingId = appendLoadingBubble();
    }

    isGenerating = true;
    heroSendBtn.disabled = true;
    chatSendBtn.disabled = true;

    try {
      provider = modelSelect.value;
      let queryMessage = backendMessage;
      if (currentLang === 'bn') {
        queryMessage = `${backendMessage} (দয়া করে বাংলায় উত্তর দিন)`;
      } else if (currentLang === 'hi') {
        queryMessage = `${backendMessage} (कृपया हिंदी में उत्तर दें)`;
      }

      const customKey = userKeys[provider] || null;

      const candidates = getBackendCandidates(targetSessionId);
      let resp = null;
      let data = null;
      let lastErr = null;

      const payload = JSON.stringify({
        message: queryMessage,
        provider: provider,
        history: sessionHistoryToSend,
        custom_api_key: customKey
      });

      for (const base of candidates) {
        try {
          const endpoint = base ? `${base}/api/chat` : '/api/chat';
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 95000);

          const attemptResp = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (attemptResp.status === 429) {
            const errData = await attemptResp.json().catch(() => ({}));
            if (errData && errData.error === 'guest_limit_reached') {
              resp = attemptResp;
              data = errData;
              break;
            } else {
              console.warn(`Backend ${endpoint} returned 429 (temporary rate limit). Retrying next candidate...`);
              lastErr = new Error(errData?.message || 'Server rate limit');
              continue;
            }
          }

          if (attemptResp.status >= 500) {
            console.warn(`Backend ${endpoint} returned HTTP ${attemptResp.status}. Retrying candidate...`);
            lastErr = new Error(`HTTP ${attemptResp.status}`);
            continue;
          }

          resp = attemptResp;
          data = await attemptResp.json();
          break;
        } catch (fetchErr) {
          console.warn(`Fetch candidate error for ${base}:`, fetchErr);
          lastErr = fetchErr;
        }
      }

      if (loadingId) {
        removeLoadingBubble(loadingId);
      }

      if (!resp) {
        throw (lastErr || new Error('All backends failed to respond'));
      }

      if (resp.status === 429) {
        if (!isCustom) {
          guestRemainingQuestions = 0;
          updateQuotaDisplay(0);
          showQuotaModal();
        }
        const quotaErrMsg = '⚠️ ' + (data.message || 'Free guest question limit reached.');
        recordSessionMessage(targetSessionId, 'assistant', quotaErrMsg);
        if (currentSessionId === targetSessionId) {
          appendMessage('assistant', quotaErrMsg);
        }
        return;
      }

      if (!resp.ok) {
        updateQuotaDisplay(data.remaining !== undefined ? data.remaining : remainingQuestions);
        const errMsg = `⚠️ ${data.message || 'Error occurred while contacting assistant.'}`;
        recordSessionMessage(targetSessionId, 'assistant', errMsg);
        if (currentSessionId === targetSessionId) {
          appendMessage('assistant', errMsg);
        }
        return;
      }

      // Success - track guest quota strictly in localStorage
      if (!isCustom) {
        const currentCount = parseInt(localStorage.getItem('pujo_guest_used') || '0', 10) + 1;
        localStorage.setItem('pujo_guest_used', currentCount.toString());
        const serverRemaining = data.remaining !== undefined ? data.remaining : 5;
        guestRemainingQuestions = Math.min(serverRemaining, Math.max(0, 5 - currentCount));
        updateQuotaDisplay(guestRemainingQuestions);
      } else {
        updateQuotaDisplay(data.remaining);
      }

      recordSessionMessage(targetSessionId, 'assistant', data.reply, { role: 'assistant', content: data.reply });

      // ONLY append to screen UI if user is STILL viewing targetSessionId!
      if (currentSessionId === targetSessionId) {
        appendMessage('assistant', data.reply);
        conversationHistory.push({ role: 'assistant', content: data.reply });
      }

      if (guestRemainingQuestions === 0 && !isCustom) {
        setTimeout(showQuotaModal, 1500);
      }
    } catch (err) {
      if (loadingId) removeLoadingBubble(loadingId);
      const connErrMsg = '⚠️ Connection error. Please check your network and try again.';
      recordSessionMessage(targetSessionId, 'assistant', connErrMsg);
      if (currentSessionId === targetSessionId) {
        appendMessage('assistant', connErrMsg);
      }
    } finally {
      if (activePendingSessionId === targetSessionId) {
        activePendingSessionId = null;
      }
      isGenerating = false;
      heroSendBtn.disabled = false;
      chatSendBtn.disabled = false;
    }
  }

  function appendMessage(role, rawContent, autoScroll = true) {
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
    if (autoScroll) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }

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

      // Copy full response to clipboard
      const cleanText = rawContent
        .replace(/!\[.*?\]\(.*?\)/g, '')
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .replace(/[*_#]/g, '')
        .trim();

      actionsBar.innerHTML = `
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

      // Contextual 1-Tap Quick Follow-up & Travel Mode Chips (0 tokens from LLM)
      if (!rawContent.startsWith('⚠️')) {
        const chipsBar = document.createElement('div');
        chipsBar.className = 'followup-chips-bar';
        
        // Strict Language Control: Only use Bengali/Hindi if user explicitly chose it in the UI dropdown
        const isBn = currentLang === 'bn';
        const isHi = currentLang === 'hi';

        // Check if message discusses routes, itineraries, pandal tours, or multi-stop visits
        const isRoutePlan = /(route|itinerary|tour|parikrama|walking|metro|distance|stop|পরিক্রমা|রুট|হাঁটা|মেট্রো|मार्ग|दौरा|पैदल)/i.test(rawContent);

        // Travel Mode Chips (displayed only for route / pandal parikrama replies)
        if (isRoutePlan) {
          // Extract mentioned pandals from numbered headings (in exact stop sequence) + dataset
          const activePandalNames = [];
          const headingRegex = /^#{2,4}\s*\d+[\.\)]\s*([^\n\r]+)/gm;
          let hMatch;
          while ((hMatch = headingRegex.exec(rawContent)) !== null) {
            const cleanName = hMatch[1].replace(/[*_🏛️]/g, '').trim();
            if (cleanName && !activePandalNames.some(n => n.toLowerCase() === cleanName.toLowerCase())) {
              activePandalNames.push(cleanName);
            }
          }
          if (activePandalNames.length === 0 && allKolkataPandals && allKolkataPandals.length > 0) {
            allKolkataPandals.forEach(p => {
              if (rawContent.toLowerCase().includes(p.name.toLowerCase()) && !activePandalNames.includes(p.name)) {
                activePandalNames.push(p.name);
              }
            });
          }
          const pandalsContext = activePandalNames.length > 0 
            ? activePandalNames.slice(0, 6).join(', ')
            : 'the exact same pandals mentioned above';

          const transportChips = isBn ? [
            { text: '🚇+🚶 মেট্রো + হাঁটার পথ', query: `মেট্রো ও হাঁটার পথের সমন্বয়ে শুধুমাত্র এই মণ্ডপগুলির (${pandalsContext}) জন্য ভ্রমণ পরিকল্পনা দিন। জিপিএস বা অন্য মণ্ডপে পরিবর্তন করবেন না।` },
            { text: '🚶 সম্পূর্ণ হাঁটার রুট', query: `যানজট এড়িয়ে শুধুমাত্র এই মণ্ডপগুলির (${pandalsContext}) মধ্যে হাঁটার সরাসরি পথ ও দূরত্ব জানান।` },
            { text: '🛺 টোটো / অটো + হাঁটা', query: `টোটো (ই-রিকশা) ও অটো সংযোগ ব্যবহার করে শুধুমাত্র এই মণ্ডপগুলির (${pandalsContext}) জন্য সহজ রুট পরিকল্পনা দিন। অন্য মণ্ডপে পরিবর্তন করবেন না।` },
            { text: '🚕 ট্যাক্সি / ক্যাব রুট', query: `শুধুমাত্র এই মণ্ডপগুলির (${pandalsContext}) জন্য ট্যাক্সি/ক্যাব রুট, ট্র্যাফিক ও পার্কিং ড্রপ-অফ পয়েন্ট দিন।` },
            { text: '🏍️ বাইক / টু-হুইলার', query: `শুধুমাত্র এই মণ্ডপগুলির (${pandalsContext}) জন্য বাইকের শর্টকাট রুট ও বাইক পার্কিং নির্দেশিকা দিন।` }
          ] : (isHi ? [
            { text: '🚇+🚶 मेट्रो + पैदल मार्ग', query: `मेट्रो और पैदल मार्ग के साथ केवल इन्हीं पंडालों (${pandalsContext}) के लिए योजना बताएं। जीपीएस या अन्य पंडालों पर न जाएं।` },
            { text: '🚶 केवल पैदल रूट', query: `ट्रैफिक से बचते हुए केवल इन्हीं पंडालों (${pandalsContext}) के बीच पैदल चलने का मार्ग बताएं।` },
            { text: '🛺 टोटो / ऑटो + पैदल', query: `टोटो (ई-रिक्शा) और ऑटो कनेक्टिविटी के साथ केवल इन्हीं पंडालों (${pandalsContext}) का मार्ग बताएं।` },
            { text: '🚕 टैक्सी / कैब रूट', query: `केवल इन्हीं पंडालों (${pandalsContext}) के लिए टैक्सी/कैब रूट और ड्रॉप-ऑफ पॉइंट बताएं।` },
            { text: '🏍️ बाइक मार्ग', query: `केवल इन्हीं पंडालों (${pandalsContext}) के लिए बाइक से जाने का सुगम मार्ग और पार्किंग बताएं।` }
          ] : [
            { text: '🚇+🚶 Metro + Walk Route', query: `Plan the optimal Metro and walking route strictly between: ${pandalsContext}. Do not switch to user GPS location or other pandals.` },
            { text: '🚶 Walking Only Route', query: `Plan a pure walking route strictly between: ${pandalsContext}. Do not switch to other pandals.` },
            { text: '🛺 Toto / Auto + Walk', query: `Plan this route strictly for: ${pandalsContext} using local Toto (e-rickshaw), Auto-rickshaw connectors, and short walks. Do not switch pandals.` },
            { text: '🚕 Taxi / Car Route', query: `Plan a Taxi / Cab / Car route strictly for: ${pandalsContext} with nearest drop-off points and road traffic. Do not switch pandals.` },
            { text: '🏍️ Bike / Two-Wheeler', query: `Plan a Bike route strictly for: ${pandalsContext} with two-wheeler parking and bypass lanes. Do not switch pandals.` }
          ]);

          transportChips.forEach(item => {
            const chipBtn = document.createElement('button');
            chipBtn.className = 'followup-chip-btn transport-chip-btn';
            chipBtn.type = 'button';
            chipBtn.innerHTML = item.text;
            chipBtn.title = `Switch itinerary mode: ${item.text}`;
            chipBtn.addEventListener('click', () => {
              const inputEl = heroView.style.display !== 'none' ? heroInput : chatInput;
              inputEl.value = item.query;
              sendMessage();
            });
            chipsBar.appendChild(chipBtn);
          });
        }

        // Standard Contextual Chips (Food, Metro Timings, Traffic)
        const followUps = isBn ? [
          { text: '🍽️ আশেপাশের খাবার ও মিষ্টি', query: 'এই মণ্ডপগুলির কাছাকাছি বিখ্যাত ঐতিহ্যবাহী খাবার ও মিষ্টির দোকান কোনটি?' },
          { text: '🚇 রাতের মেট্রো শেষ ট্রেন', query: 'আজ রাতের পুজোর স্পেশাল মেট্রো ট্রেনের শেষ সময় কখন?' },
          { text: '🚨 বর্তমান ট্র্যাফিক ও ভিড়', query: 'এই রুটের বর্তমান রাস্তা ও ট্র্যাফিক পরিস্থিতি কেমন?' }
        ] : (isHi ? [
          { text: '🍽️ नजदीकी प्रसिद्ध खान-पान', query: 'इन पंडालों के पास प्रसिद्ध भोजन और पारंपरिक मिठाइयों की दुकानें कौन सी हैं?' },
          { text: '🚇 रात की विशेष मेट्रो समय', query: 'दुर्गा पूजा विशेष मेट्रो की आखिरी ट्रेन का समय क्या है?' },
          { text: '🚨 लाइव ट्रैफिक व भीड़', query: 'इस रूट पर वर्तमान सड़क ट्रैफिक और भीड़ की स्थिति कैसी है?' }
        ] : [
          { text: '🍽️ Famous Food & Sweets Nearby', query: 'What are the best authentic food and sweet shops near these pandals?' },
          { text: '🚇 Late Night Metro Timings', query: 'What are the late-night Puja special Metro timings and last train schedules?' },
          { text: '🚨 Live Traffic & Crowds', query: 'What is the current road traffic and crowd status for this route?' }
        ]);

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

  // Helper to normalize Bengali-English pandal name variations for reliable matching
  function normalizePandalKey(str) {
    return (str || '')
      .toLowerCase()
      .replace(/\(.*?\)/g, ' ')
      .replace(/\bdum\s+dum\b/g, 'dumdum')
      .replace(/\bshobhabazar\b/g, 'sovabazar')
      .replace(/\bbaghbazar\b/g, 'bagbazar')
      .replace(/\bkumortuli\b/g, 'kumartuli')
      .replace(/\bvyayam\b/g, 'byayam')
      .replace(/\bsamiti\b/g, 'samity')
      .replace(/\bsarbajanin\b|\bsarbojonin\b/g, 'sarbojanin')
      .replace(/\bdurgotsab\b|\bdurgotsav\b/g, 'durgotsav')
      .replace(/\bjubak\b|\byuvak\b/g, 'yubak')
      .replace(/\bbrindo\b/g, 'brinda')
      .replace(/\bpalli\b/g, 'pally')
      .replace(/\bbhowanipore\b|\bbhawanipur\b|\bbhawanipore\b/g, 'bhowanipur')
      .replace(/\bhindustan\b/g, 'hindusthan')
      .replace(/\bkhidirpur\b|\bkhidderpore\b/g, 'kidderpore')
      .replace(/\bsree\s+bhumi\b/g, 'sreebhumi')
      .replace(/\bnoboday\b|\bnaboday\b/g, 'nabauday')
      .replace(/\bnaba\s+uday\b/g, 'nabauday')
      .replace(/[^a-z0-9]/g, '');
  }

  // Detect coordinates or Google Maps links to render an interactive Leaflet Map
  function renderInteractiveMapIfPossible(bubble, text) {
    const coords = [];
    const seenNames = new Set();
    const lowerText = text.toLowerCase();
    const normFullText = normalizePandalKey(text);

    // Extract numbered stop headings (e.g., "### 1. Dum Dum Park Tarun Sangha") to guarantee exact route order
    const headingLines = [];
    const headingRegex = /(?:^|\n)\s*(?:#{1,4}\s*)?(?:🏛️\s*)?(\d+)[\.\)]\s*([^\n]+)/g;
    let hMatch;
    while ((hMatch = headingRegex.exec(text)) !== null) {
      headingLines.push({
        step: parseInt(hMatch[1], 10),
        raw: hMatch[2].trim(),
        norm: normalizePandalKey(hMatch[2]),
        index: hMatch.index
      });
    }

    // 1. Search against all 222 Kolkata pandals from the dataset
    if (allKolkataPandals && allKolkataPandals.length > 0) {
      // First pass: match pandals directly against numbered headings in exact stop order (1 -> 2 -> 3)
      if (headingLines.length > 0) {
        headingLines.forEach((h, hIdx) => {
          let bestPandal = null;
          let bestLen = 0;
          allKolkataPandals.forEach(p => {
            const pNorm = normalizePandalKey(p.name);
            if (pNorm.length >= 4 && (h.norm.includes(pNorm) || pNorm.includes(h.norm))) {
              if (pNorm.length > bestLen) {
                bestLen = pNorm.length;
                bestPandal = p;
              }
            }
          });
          if (bestPandal && !seenNames.has(bestPandal.name)) {
            seenNames.add(bestPandal.name);
            coords.push({
              lat: bestPandal.lat,
              lon: bestPandal.lon,
              name: bestPandal.name,
              area: bestPandal.area || '',
              pos: hIdx * 1000 // Strictly preserve 1 -> 2 -> 3 heading order
            });
          }
        });
      }

      // Second pass: search full text only if there were no numbered headings or if some numbered headings didn't match
      if (headingLines.length === 0 || coords.length < headingLines.length) {
        allKolkataPandals.forEach(p => {
          if (seenNames.has(p.name)) return;
          const pNameLower = p.name.toLowerCase();
          let pos = lowerText.indexOf(pNameLower);
          if (pos === -1) {
            const pNorm = normalizePandalKey(p.name);
            const normPos = pNorm.length >= 5 ? normFullText.indexOf(pNorm) : -1;
            if (normPos !== -1) {
              pos = 50000 + normPos;
            }
          } else {
            pos = 10000 + pos;
          }
          if (pos !== -1) {
            seenNames.add(p.name);
            coords.push({
              lat: p.lat,
              lon: p.lon,
              name: p.name,
              area: p.area || '',
              pos: pos
            });
          }
        });
      }

      // Sort coords in the exact sequence mentioned in the itinerary
      coords.sort((a, b) => a.pos - b.pos);
    }

    // 2. Check for lat, lng in Google Maps links
    const gmapsRegex = /destination=([0-9]+\.[0-9]+),([0-9]+\.[0-9]+)/g;
    let match;
    while ((match = gmapsRegex.exec(text)) !== null) {
      const lat = parseFloat(match[1]);
      const lon = parseFloat(match[2]);
      if (!coords.some(c => Math.abs(c.lat - lat) < 0.002 && Math.abs(c.lon - lon) < 0.002)) {
        coords.push({
          lat: lat,
          lon: lon,
          name: 'Pandal Destination',
          area: '',
          pos: 90000 + match.index
        });
      }
    }

    // 3. Check for explicit coordinates in text: (22.5xxx, 88.3xxx)
    const coordRegex = /\b(22\.[4-6][0-9]{2,5})\b[^\d]+(88\.[2-4][0-9]{2,5})\b/g;
    while ((match = coordRegex.exec(text)) !== null) {
      const lat = parseFloat(match[1]);
      const lon = parseFloat(match[2]);
      if (!coords.some(c => Math.abs(c.lat - lat) < 0.002 && Math.abs(c.lon - lon) < 0.002)) {
        coords.push({
          lat: lat,
          lon: lon,
          name: 'Puja Location',
          area: '',
          pos: 95000 + match.index
        });
      }
    }

    if (coords.length === 0) return;

    // Prevent identical coordinates from stacking markers directly on top of each other
    for (let i = 0; i < coords.length; i++) {
      for (let j = 0; j < i; j++) {
        if (Math.abs(coords[i].lat - coords[j].lat) < 0.00015 && Math.abs(coords[i].lon - coords[j].lon) < 0.00015) {
          const angle = (i * 2.4);
          coords[i].lat = +(coords[i].lat + Math.cos(angle) * 0.00045).toFixed(6);
          coords[i].lon = +(coords[i].lon + Math.sin(angle) * 0.00045).toFixed(6);
        }
      }
    }

    // Determine optimal Google Maps travelmode based on itinerary transport mode
    const isDrivingMode = /🚕|🚗|🏍️|\b(taxi|cab|car route|driving|bike|two-wheeler|scooter)\b/i.test(text.slice(0, 350));
    const travelMode = isDrivingMode ? 'driving' : 'walking';
    const modeLabel = isDrivingMode ? 'driving' : 'walking';

    // Build multi-stop Google Maps URL connecting ALL pandals in exact sequence!
    let gmapsUrl = "";
    if (coords.length === 1) {
      gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${coords[0].lat},${coords[0].lon}&travelmode=${travelMode}`;
    } else {
      const origin = `${coords[0].lat},${coords[0].lon}`;
      const destination = `${coords[coords.length - 1].lat},${coords[coords.length - 1].lon}`;
      const intermediateCoords = coords.slice(1, -1);
      const waypoints = intermediateCoords.slice(0, 9).map(c => `${c.lat},${c.lon}`).join('|');
      gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints ? `&waypoints=${waypoints}` : ''}&travelmode=${travelMode}`;
    }

    // Synchronize ANY Google Maps route buttons rendered in the message bubble from markdown
    // so that clicking "Open route in Google Maps" directs to the FULL multi-stop route with all pandals!
    const existingMapBtns = bubble.querySelectorAll('.route-map-btn');
    existingMapBtns.forEach(btn => {
      btn.href = gmapsUrl;
      if (coords.length > 1) {
        btn.innerHTML = `📍 Open Full Route in Google Maps (${coords.length} stops)`;
        btn.title = `Full ${modeLabel} tour connecting all ${coords.length} pandals in Google Maps`;
      }
    });

    // Create Map Container
    const mapContainer = document.createElement('div');
    mapContainer.className = 'map-card-container';
    const mapId = 'map-' + Math.random().toString(36).substring(2, 9);

    const stopSummary = coords.length > 1
      ? `${coords.length} stops: ${coords.map((c, idx) => `${idx + 1}. ${c.name}`).join(' ➔ ')}`
      : `1 pandal plotted: ${coords[0].name}`;

    mapContainer.innerHTML = `
      <div class="map-card-header" title="${stopSummary.replace(/"/g, '&quot;')}">
        <span>🗺️ Interactive Puja Map Preview (${coords.length} ${coords.length === 1 ? 'pandal' : 'stops'} plotted)</span>
      </div>
      <div id="${mapId}" class="pandal-leaflet-map"></div>
      <div class="map-card-footer">
        <span>Tap numbered pins (1–${coords.length}) for pandal details</span>
        <a href="${gmapsUrl}" target="_blank" rel="noopener noreferrer" class="route-map-btn" style="padding: 6px 14px; font-size: 0.82rem; margin: 0;">
          📍 Open Full Route in Google Maps (${coords.length} ${coords.length === 1 ? 'stop' : 'stops'})
        </a>
      </div>
    `;

    bubble.appendChild(mapContainer);

    setTimeout(() => {
      try {
        const map = L.map(mapId, { scrollWheelZoom: false }).setView([coords[0].lat, coords[0].lon], coords.length > 1 ? 14 : 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap'
        }).addTo(map);

        const group = [];
        coords.forEach((c, idx) => {
          const numberedIcon = L.divIcon({
            className: 'pandal-numbered-pin',
            html: `<div style="background:#C0392B;color:#FFF8F0;width:26px;height:26px;border-radius:50%;border:2px solid #FFF8F0;box-shadow:0 2px 6px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;font-family:sans-serif;">${idx + 1}</div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
            popupAnchor: [0, -14]
          });
          const marker = L.marker([c.lat, c.lon], { icon: numberedIcon }).addTo(map);
          marker.bindPopup(`<strong>${idx + 1}. ${c.name}</strong>${c.area ? `<br><small>Area: ${c.area}</small>` : ''}<br><a href="https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lon}&travelmode=${travelMode}" target="_blank" rel="noopener noreferrer" style="color: #2E7D5B; font-weight: bold; font-size: 11px;">Directions to Stop #${idx + 1} &rarr;</a>`);
          if (idx === 0) marker.openPopup();
          group.push([c.lat, c.lon]);
        });

        // If multiple pandals, draw a route line connecting them in sequence
        if (coords.length > 1) {
          const linePoints = coords.map(c => [c.lat, c.lon]);
          L.polyline(linePoints, {
            color: '#C0392B',
            weight: 3,
            opacity: 0.85,
            dashArray: '6, 8'
          }).addTo(map);
          map.fitBounds(group, { padding: [36, 36], maxZoom: 16 });
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

    // 1. Markdown Images: ![caption](url) (Only verified dataset URLs allowed; block stock photo hallucinations)
    html = html.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, (match, caption, url) => {
      if (/unsplash\.com|pexels\.com|pixabay\.com|placeholder\.com/i.test(url)) {
        return '';
      }
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
      // Weather / আবহাওয়া / Attire / Umbrella
      if (content.match(/^(?:🌦️\s*|⛅\s*|☔\s*)?(?:<strong>)?(?:Weather|Weather & Attire|Weather & Tips|আবহাওয়া|আবহাওয়া ও পোশাক|পোশাকের পরামর্শ)(?:<\/strong>)?:\s*(.*)/i)) {
        const val = content.replace(/^(?:🌦️\s*|⛅\s*|☔\s*)?(?:<strong>)?(?:Weather|Weather & Attire|Weather & Tips|আবহাওয়া|আবহাওয়া ও পোশাক|পোশাকের পরামর্শ)(?:<\/strong>)?:\s*/i, '');
        return `<div class="pandal-pill-row"><span class="info-pill pill-crowd" style="background: #EBF5FB; color: #2471A3; border-color: #AED6F1;">🌦️ Weather & Tips</span><span class="pill-text">${val}</span></div>`;
      }
      // Metro Service Window / মেট্রো সময়সূচী
      if (content.match(/^(?:🚇\s*)?(?:<strong>)?(?:Metro Service Window|Metro Hours|Metro Timings|মেট্রো সময়সূচী|মেট্রো সার্ভিস)(?:<\/strong>)?:\s*(.*)/i)) {
        const val = content.replace(/^(?:🚇\s*)?(?:<strong>)?(?:Metro Service Window|Metro Hours|Metro Timings|মেট্রো সময়সূচী|মেট্রো সার্ভিস)(?:<\/strong>)?:\s*/i, '');
        return `<div class="pandal-pill-row"><span class="info-pill pill-metro">🚇 Metro Service</span><span class="pill-text">${val}</span></div>`;
      }
      // Food / খাবার / Sweets
      if (content.match(/^(?:🍽️\s*)?(?:<strong>)?(?:Food|Food Stop|খাবার|মিষ্টি|Restaurant)(?:<\/strong>)?:\s*(.*)/i)) {
        const val = content.replace(/^(?:🍽️\s*)?(?:<strong>)?(?:Food|Food Stop|খাবার|মিষ্টি|Restaurant)(?:<\/strong>)?:\s*/i, '');
        return `<div class="pandal-pill-row"><span class="info-pill pill-food">🍽️ Food Stop</span><span class="pill-text">${val}</span></div>`;
      }
      // Facebook / Social Media / ফেসবুক
      if (content.match(/^(?:📘\s*|🌐\s*)?(?:<strong>)?(?:Official Facebook Page|Facebook|Social Media|ফেসবুক|অফিসিয়াল ফেসবুক)(?:<\/strong>)?:\s*(.*)/i)) {
        const val = content.replace(/^(?:📘\s*|🌐\s*)?(?:<strong>)?(?:Official Facebook Page|Facebook|Social Media|ফেসবুক|অফিসিয়াল ফেসবুক)(?:<\/strong>)?:\s*/i, '');
        return `<div class="pandal-pill-row"><span class="info-pill" style="background: #E8F0FE; color: #1877F2; border-color: #C2DBFE;">📘 Facebook</span><span class="pill-text">${val}</span></div>`;
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

  function hideQuotaModal() {
    if (quotaModal) quotaModal.style.display = 'none';
  }

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', hideQuotaModal);
  }

  // Close modals when clicking the dimmed background backdrop
  if (quotaModal) {
    quotaModal.addEventListener('click', (e) => {
      if (e.target === quotaModal) hideQuotaModal();
    });
  }

  if (apiKeyModal) {
    apiKeyModal.addEventListener('click', (e) => {
      if (e.target === apiKeyModal) apiKeyModal.style.display = 'none';
    });
  }

  if (imageModal) {
    imageModal.addEventListener('click', (e) => {
      if (e.target === imageModal || (imageModalClose && e.target === imageModalClose)) {
        imageModal.style.display = 'none';
      }
    });
  }
  if (imageModalClose) {
    imageModalClose.addEventListener('click', () => {
      if (imageModal) imageModal.style.display = 'none';
    });
  }

  async function performReset() {
    try {
      localStorage.removeItem('pujo_guest_used');
      const resp = await fetch('/api/reset-quota', { method: 'POST' });
      if (resp.ok) {
        const data = await resp.json();
        guestRemainingQuestions = data.remaining;
        updateQuotaDisplay(data.remaining, data.limit);
        quotaModal.style.display = 'none';
      }
    } catch (e) {
      console.error('Reset error:', e);
    }
  }

  // API Key Settings Modal
  function openKeyModal() {
    closeSidebar();
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

  document.querySelectorAll('.open-keys-trigger').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openKeyModal();
    });
  });

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

  // Load saved sessions and language preference
  loadSessions();
  const savedLang = localStorage.getItem('pujo_selected_lang');
  if (savedLang && ['en', 'bn', 'hi'].includes(savedLang)) {
    applyLanguage(savedLang);
  } else {
    applyLanguage('en');
  }
  renderChatHistory();
  renderRotatingSuggestions();

  // Start session
  updateModelSelectLabels();
  updateKeyBadgeStatus();
  initSession().then(() => {
    updateModelSelectLabels();
    updateKeyBadgeStatus();
  });
});
