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
      highestLevelPlayed: 0,
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
    this._reportData.highestLevelPlayed = 0;
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
   * @param {string|number} levelId - Unique level identifier
   * @param {Object} options - Optional level metadata
   * @param {number} options.levelNumber - Numeric level number for backend XP progression
   */
  startLevel(levelId, options = {}) {
    if (!this._isInitialized) {
      console.warn('[Analytics] Not initialized');
      return;
    }
    
    // Normalize to string to allow matching 1 vs '1'
    const idString = String(levelId);
    const levelNumber = this._resolveLevelNumber(levelId, options.levelNumber);

    const levelEntry = {
      levelId: idString,
      levelNumber,
      completed: false,
      successful: false,
      timeTaken: 0,
      timeDirection: false,
      xpEarned: 0,
      tasks: []
    };
    
    this._reportData.diagnostics.levels.push(levelEntry);
    this._updateHighestLevel(levelNumber);
  }
  
  /**
   * Complete a level and update totals
   * @param {string|number} levelId - Level identifier
   * @param {boolean} successful - Whether level was completed successfully
   * @param {number} timeTakenMs - Time taken in milliseconds
   * @param {number} xp - XP earned for this level
   * @param {Object} options - Optional submit metadata
   * @param {boolean} options.submit - Submit this level immediately after ending it
   * @param {string} options.runId - Game-generated run id override for this submit
   */
  endLevel(levelId, successful, timeTakenMs, xp, options = {}) {
    const level = this._getLevelById(String(levelId));
    
    if (level) {
      level.successful = successful;
      level.timeTaken = timeTakenMs;
      level.xpEarned = xp;
      level.completed = true;
      
      // Update global session totals
      this._reportData.xpEarnedTotal += xp;

      if (options.submit) {
        return this.submitLevel(levelId, { runId: options.runId });
      }
    } else {
      console.warn(`[Analytics] End Level called for unknown level: ${levelId}`);
    }
  }
  
  /**
   * Record a specific user action/task within a level
   * @param {string|number} levelId - Level identifier
   * @param {string} taskId - Task identifier
   * @param {string} question - Question text
   * @param {string} correctChoice - Correct answer
   * @param {string} choiceMade - User's answer
   * @param {number} timeMs - Time taken in milliseconds
   * @param {number} xp - XP earned for this task
   */
  recordTask(levelId, taskId, question, correctChoice, choiceMade, timeMs, xp) {
    const level = this._getLevelById(String(levelId));
    
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

    return this._sendPayload(payload);
  }

  /**
   * Submit exactly one completed level using the backend level-wise contract.
   * The game must provide a stable runId for the current continuous play run.
   * @param {string|number} levelId - Level identifier already tracked by startLevel/endLevel
   * @param {Object} options - Optional submit metadata
   * @param {string} options.runId - Game-generated run id override
   */
  submitLevel(levelId, options = {}) {
    if (!this._isInitialized) {
      console.error('[Analytics] Attempted to submit level without initialization.');
      return { success: false, errors: ['Analytics is not initialized'] };
    }

    const level = this._getLevelById(String(levelId));
    if (!level) {
      const message = `Level not found: ${levelId}`;
      console.error(`[Analytics] ${message}`);
      return { success: false, errors: [message] };
    }

    const runId = this._normalizeRunId(options.runId);
    const levelPayload = JSON.parse(JSON.stringify(level));
    const levelNumber = this._resolveLevelNumber(
      levelPayload.levelNumber || levelPayload.levelId,
      options.levelNumber,
    );

    if (levelNumber !== undefined) {
      levelPayload.levelNumber = levelNumber;
    }

    const highestLevelPlayed = Math.max(
      this._reportData.highestLevelPlayed || 0,
      levelPayload.levelNumber || 0,
    );
    const payload = {
      gameId: this._gameId,
      name: this._sessionName,
      runId,
      highestLevelPlayed,
      level: levelPayload,
      xpEarned: Number(levelPayload.xpEarned || 0),
      xpEarnedTotal: Number(levelPayload.xpEarned || 0),
      rawData: JSON.parse(JSON.stringify(this._reportData.rawData)),
      diagnostics: {
        levels: [levelPayload]
      },
      timestamp: new Date().toISOString()
    };
    const validation = this.validateLevelPayload(payload);

    if (!validation.valid) {
      console.error('[Analytics] Invalid level analytics payload:', validation.errors);
      return { success: false, errors: validation.errors };
    }

    this._reportData.highestLevelPlayed = highestLevelPlayed;
    return this._sendPayload(payload);
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
    this._reportData.highestLevelPlayed = 0;
    this._reportData.rawData = [];
    this._reportData.diagnostics.levels = [];
    console.log('[Analytics] Data reset');
  }

  /**
   * Validate the level-wise backend analytics contract before sending.
   * @param {Object} payload
   * @returns {{valid: boolean, errors: string[]}}
   */
  validateLevelPayload(payload) {
    const errors = [];
    const level = payload && payload.level;

    if (!payload || typeof payload !== 'object') {
      return { valid: false, errors: ['Payload must be an object'] };
    }
    if (!this._isNonEmptyString(payload.gameId)) {
      errors.push('gameId is required');
    }
    if (!this._isNonEmptyString(payload.name)) {
      errors.push('name is required');
    }
    if (!this._isNonEmptyString(payload.runId)) {
      errors.push('runId is required and must be provided by the game');
    }
    if (!this._isNonNegativeNumber(payload.highestLevelPlayed)) {
      errors.push('highestLevelPlayed must be a non-negative number');
    }
    if (!this._isNonNegativeNumber(payload.xpEarned)) {
      errors.push('xpEarned must be a non-negative number');
    }
    if (!this._isNonNegativeNumber(payload.xpEarnedTotal)) {
      errors.push('xpEarnedTotal must be a non-negative number');
    }
    if (!this._isIsoDateString(payload.timestamp)) {
      errors.push('timestamp must be a valid ISO date string');
    }
    if (!Array.isArray(payload.rawData)) {
      errors.push('rawData must be an array');
    } else {
      payload.rawData.forEach((metric, index) => {
        if (!metric || typeof metric !== 'object') {
          errors.push(`rawData[${index}] must be an object`);
          return;
        }
        if (!this._isNonEmptyString(metric.key)) {
          errors.push(`rawData[${index}].key is required`);
        }
        if (typeof metric.value !== 'string') {
          errors.push(`rawData[${index}].value must be a string`);
        }
      });
    }
    if (
      !payload.diagnostics ||
      typeof payload.diagnostics !== 'object' ||
      !Array.isArray(payload.diagnostics.levels)
    ) {
      errors.push('diagnostics.levels must be an array');
    } else if (payload.diagnostics.levels.length !== 1) {
      errors.push('diagnostics.levels must contain exactly one level');
    } else if (payload.diagnostics.levels[0] !== level) {
      errors.push('diagnostics.levels[0] must match level');
    }
    if (!level || typeof level !== 'object') {
      errors.push('level is required');
    } else {
      if (!this._isPositiveNumber(level.levelNumber)) {
        errors.push('level.levelNumber must be a positive number');
      }
      if (!this._isNonEmptyString(level.levelId)) {
        errors.push('level.levelId is required');
      }
      if (!this._isNonNegativeNumber(level.xpEarned)) {
        errors.push('level.xpEarned must be a non-negative number');
      }
      if (typeof level.successful !== 'boolean') {
        errors.push('level.successful must be a boolean');
      }
      if (level.completed !== true) {
        errors.push('level.completed must be true before submit');
      }
      if (!this._isNonNegativeNumber(level.timeTaken)) {
        errors.push('level.timeTaken must be a non-negative number');
      }
      if (!Array.isArray(level.tasks)) {
        errors.push('level.tasks must be an array');
      } else {
        level.tasks.forEach((task, index) => {
          this._validateTask(task, index, errors);
        });
      }
    }

    return { valid: errors.length === 0, errors };
  }
  
  // --- Internal Helpers ---

  _sendPayload(payload) {
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
        const flushTimer = setTimeout(flushPending, 2000);
        if (flushTimer && typeof flushTimer.unref === 'function') {
          flushTimer.unref();
        }
      }
    } catch (e) { /* ignore */ }

    return payload;
  }

  _normalizeRunId(runId) {
    return typeof runId === 'string' && runId.trim() ? runId.trim() : '';
  }

  _resolveLevelNumber(levelId, explicitLevelNumber) {
    const value =
      explicitLevelNumber !== undefined && explicitLevelNumber !== null
        ? explicitLevelNumber
        : levelId;
    const num = Number(value);
    return !isNaN(num) && isFinite(num) ? num : undefined;
  }

  _isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  _isNonNegativeNumber(value) {
    return typeof value === 'number' && isFinite(value) && value >= 0;
  }

  _isPositiveNumber(value) {
    return typeof value === 'number' && isFinite(value) && value > 0;
  }

  _isIsoDateString(value) {
    return (
      typeof value === 'string' &&
      value.trim().length > 0 &&
      !Number.isNaN(Date.parse(value))
    );
  }

  _validateTask(task, index, errors) {
    if (!task || typeof task !== 'object') {
      errors.push(`level.tasks[${index}] must be an object`);
      return;
    }
    if (!this._isNonEmptyString(task.taskId)) {
      errors.push(`level.tasks[${index}].taskId is required`);
    }
    if (task.question !== undefined && typeof task.question !== 'string') {
      errors.push(`level.tasks[${index}].question must be a string`);
    }
    if (task.options !== undefined && typeof task.options !== 'string') {
      errors.push(`level.tasks[${index}].options must be a string`);
    }
    if (
      task.correctChoice !== undefined &&
      typeof task.correctChoice !== 'string'
    ) {
      errors.push(`level.tasks[${index}].correctChoice must be a string`);
    }
    if (task.choiceMade !== undefined && typeof task.choiceMade !== 'string') {
      errors.push(`level.tasks[${index}].choiceMade must be a string`);
    }
    if (typeof task.successful !== 'boolean') {
      errors.push(`level.tasks[${index}].successful must be a boolean`);
    }
    if (!this._isNonNegativeNumber(task.timeTaken)) {
      errors.push(`level.tasks[${index}].timeTaken must be a non-negative number`);
    }
    if (!this._isNonNegativeNumber(task.xpEarned)) {
      errors.push(`level.tasks[${index}].xpEarned must be a non-negative number`);
    }
  }
  
  /**
   * Update highest level reached based on numeric value in level ID
   * @private
   * @param {string|number} levelId
   */
  _updateHighestLevel(levelNumber) {
    if (this._isPositiveNumber(levelNumber)) {
      const current = this._reportData.highestLevelPlayed;
      if (levelNumber > current) {
        this._reportData.highestLevelPlayed = levelNumber;
      }
    } else {
      // If any non-numeric level is encountered, reset to 0
      this._reportData.highestLevelPlayed = 0;
    }
  }
  
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

export { AnalyticsManager as default };
