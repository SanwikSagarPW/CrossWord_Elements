/**
 * AnalyticsManager - Tracks game analytics and submits to React Native WebView
 */
class AnalyticsManager {
  constructor() {
    if (AnalyticsManager.instance) {
      return AnalyticsManager.instance;
    }

    this._isInitialized = false;
    this._gameId = '';
    this._sessionName = '';
    
    this._reportData = {
      gameId: '',
      name: '',
      xpEarnedTotal: 0,
      rawData: [],
      diagnostics: {
        levels: []
      }
    };

    AnalyticsManager.instance = this;
  }
  
  static getInstance() {
    if (!AnalyticsManager.instance) {
      AnalyticsManager.instance = new AnalyticsManager();
    }
    return AnalyticsManager.instance;
  }
  
  /**
   * Initialize the analytics session
   * @param {string} gameId - Unique game identifier
   * @param {string} sessionName - Session/player identifier
   */
  initialize(gameId, sessionName) {
    this._gameId = gameId;
    this._sessionName = sessionName;
    
    this._reportData.gameId = gameId;
    this._reportData.name = sessionName;
    this._reportData.diagnostics.levels = [];
    this._reportData.rawData = [];
    this._reportData.xpEarnedTotal = 0;
    
    this._isInitialized = true;
    console.log(`[Analytics] Initialized for: ${gameId}`);
  }
  
  /**
   * Add a generic metric (FPS, Latency, etc)
   * @param {string} key - Metric name
   * @param {string|number} value - Metric value
   */
  addRawMetric(key, value) {
    if (!this._isInitialized) {
      console.warn('[Analytics] Not initialized');
      return;
    }
    
    this._reportData.rawData.push({ key, value: String(value) });
  }
  
  /**
   * Start tracking a new level
   * @param {string} levelId - Unique level identifier
   */
  startLevel(levelId) {
    if (!this._isInitialized) {
      console.warn('[Analytics] Not initialized');
      return;
    }
    
    const levelEntry = {
      levelId,
      successful: false,
      timeTaken: 0,
      timeDirection: false,
      xpEarned: 0,
      tasks: []
    };
    
    this._reportData.diagnostics.levels.push(levelEntry);
  }
  
  /**
   * Complete a level and update totals
   * @param {string} levelId - Level identifier
   * @param {boolean} successful - Whether level was completed successfully
   * @param {number} timeTakenMs - Time taken in milliseconds
   * @param {number} xp - XP earned for this level
   */
  endLevel(levelId, successful, timeTakenMs, xp) {
    const level = this._getLevelById(levelId);
    
    if (level) {
      level.successful = successful;
      level.timeTaken = timeTakenMs;
      level.xpEarned = xp;
      
      // Update global session totals
      this._reportData.xpEarnedTotal += xp;
    } else {
      console.warn(`[Analytics] End Level called for unknown level: ${levelId}`);
    }
  }
  
  /**
   * Record a specific user action/task within a level
   * @param {string} levelId - Level identifier
   * @param {string} taskId - Task identifier
   * @param {string} question - Question text
   * @param {string} correctChoice - Correct answer
   * @param {string} choiceMade - User's answer
   * @param {number} timeMs - Time taken in milliseconds
   * @param {number} xp - XP earned for this task
   */
  recordTask(levelId, taskId, question, correctChoice, choiceMade, timeMs, xp) {
    const level = this._getLevelById(levelId);
    
    if (level) {
      const isSuccessful = (correctChoice === choiceMade);
      const taskData = {
        taskId,
        question,
        options: '[]',
        correctChoice,
        choiceMade,
        successful: isSuccessful,
        timeTaken: timeMs,
        xpEarned: xp
      };
      
      level.tasks.push(taskData);
    } else {
      console.warn(`[Analytics] Record Task called for unknown level: ${levelId}`);
    }
  }
  
  /**
   * Submit the final report to React Native WebView
   */
  submitReport() {
    if (!this._isInitialized) {
      console.error('[Analytics] Attempted to submit without initialization.');
      return;
    }
    // Build canonical payload
    const payload = JSON.parse(JSON.stringify(this._reportData));
    // ensure canonical fields expected by hosts
    if (!payload.sessionId) payload.sessionId = (Date.now() + '-' + Math.random().toString(36));
    if (!payload.timestamp) payload.timestamp = new Date().toISOString();
    // map existing fields to common names
    payload.xpEarned = payload.xpEarned || payload.xpEarnedTotal || 0;
    payload.xpTotal = payload.xpTotal || payload.xpEarnedTotal || 0;
    payload.bestXp = payload.bestXp || payload.xpEarnedTotal || 0;

    // Try delivery via several bridges, best-effort. If window is not present (test/node), just return payload
    if (typeof window === 'undefined') {
      return payload;
    }

    // helpers for persistence/queueing
    const LS_KEY = 'ignite_pending_sessions_jsplugin';
    function savePending(p) {
      try {
        const list = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
        list.push(p);
        localStorage.setItem(LS_KEY, JSON.stringify(list));
      } catch (e) { /* ignore */ }
    }

    function trySend(p) {
      let sent = false;
      // site-local bridge
      try {
        if (window.myJsAnalytics && typeof window.myJsAnalytics.trackGameSession === 'function') {
          window.myJsAnalytics.trackGameSession(p);
          sent = true;
        }
      } catch (e) { /* continue */ }

      // React Native WebView
      try {
        if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
          window.ReactNativeWebView.postMessage(JSON.stringify(p));
          sent = true;
        }
      } catch (e) { /* continue */ }

      // parent/frame
      try {
        const target = window.__GodotAnalyticsParentOrigin || '*';
        window.parent.postMessage(p, target);
        sent = true;
      } catch (e) { /* continue */ }

      // debug fallback - console
      if (!sent) {
        try { console.log('Payload:' + JSON.stringify(p)); } catch (e) { /* swallow */ }
      }

      return sent;
    }

    function flushPending() {
      try {
        const list = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
        if (!list || !list.length) return;
        list.forEach(function (p) { trySend(p); });
        localStorage.removeItem(LS_KEY);
      } catch (e) { /* ignore */ }
    }

    // attempt send
    const ok = trySend(payload);
    if (!ok) savePending(payload);

    // ensure pending flush is registered once
    try {
      if (typeof window !== 'undefined') {
        window.addEventListener && window.addEventListener('online', flushPending);
        window.addEventListener && window.addEventListener('load', flushPending);
        // listen for handshake message to set parent origin
        window.addEventListener && window.addEventListener('message', function (ev) {
          try {
            const msg = (typeof ev.data === 'string') ? JSON.parse(ev.data) : ev.data;
            if (msg && msg.type === 'ANALYTICS_CONFIG' && msg.parentOrigin) {
              window.__GodotAnalyticsParentOrigin = msg.parentOrigin;
            }
          } catch (e) { /* ignore */ }
        });
        // try flushing shortly after submit to catch same-page parent
        setTimeout(flushPending, 2000);
      }
    } catch (e) { /* ignore */ }
  }
  
  /**
   * Get current report data (for debugging)
   * @returns {Object} Current analytics data
   */
  getReportData() {
    return JSON.parse(JSON.stringify(this._reportData)); // Deep clone
  }
  
  /**
   * Reset analytics data (useful for new sessions)
   */
  reset() {
    this._reportData.xpEarnedTotal = 0;
    this._reportData.rawData = [];
    this._reportData.diagnostics.levels = [];
    console.log('[Analytics] Data reset');
  }
  
  // --- Internal Helpers ---
  
  /**
   * Find level by ID (searches backwards for most recent)
   * @private
   * @param {string} levelId
   * @returns {Object|null}
   */
  _getLevelById(levelId) {
    const levels = this._reportData.diagnostics.levels;
    for (let i = levels.length - 1; i >= 0; i--) {
      if (levels[i].levelId === levelId) {
        return levels[i];
      }
    }
    return null;
  }
}

export default AnalyticsManager;
