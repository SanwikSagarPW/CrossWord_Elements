const AnalyticsManager = require('../dist/analytics-bridge.js');

// Mock window and ReactNativeWebView
global.window = {
  ReactNativeWebView: {
    postMessage: jest.fn()
  }
};

describe('AnalyticsManager', () => {
  let analytics;
  
  beforeEach(() => {
    // Use the singleton instance or create new one
    // Since we exported the class, we can instantiate it
    analytics = new AnalyticsManager();
    
    // Clear mock
    global.window.ReactNativeWebView.postMessage.mockClear();
  });
  
  test('should initialize correctly', () => {
    analytics.initialize('game_123', 'session_456');
    const data = analytics.getReportData();
    
    expect(data.gameId).toBe('game_123');
    expect(data.name).toBe('session_456');
    expect(data.xpEarnedTotal).toBe(0);
  });
  
  test('should add raw metrics', () => {
    analytics.initialize('game_123', 'session_456');
    analytics.addRawMetric('fps', '60');
    
    const data = analytics.getReportData();
    expect(data.rawData).toHaveLength(1);
    expect(data.rawData[0].key).toBe('fps');
    expect(data.rawData[0].value).toBe('60');
  });
  
  test('should track levels correctly', () => {
    analytics.initialize('game_123', 'session_456');
    analytics.startLevel('level_1');
    analytics.endLevel('level_1', true, 5000, 100);
    
    const data = analytics.getReportData();
    expect(data.diagnostics.levels).toHaveLength(1);
    expect(data.diagnostics.levels[0].successful).toBe(true);
    expect(data.xpEarnedTotal).toBe(100);
  });
  
  test('should record tasks', () => {
    analytics.initialize('game_123', 'session_456');
    analytics.startLevel('level_1');
    analytics.recordTask('level_1', 'q1', 'What is 2+2?', '4', '4', 1000, 10);
    
    const data = analytics.getReportData();
    const level = data.diagnostics.levels[0];
    expect(level.tasks).toHaveLength(1);
    expect(level.tasks[0].successful).toBe(true);
  });

  test('should submit report to React Native', () => {
    analytics.initialize('game_123', 'session_456');
    analytics.submitReport();
    
    expect(global.window.ReactNativeWebView.postMessage).toHaveBeenCalled();
    const payload = JSON.parse(global.window.ReactNativeWebView.postMessage.mock.calls[0][0]);
    expect(payload.gameId).toBe('game_123');
  });
});
