# JavaScript Analytics Bridge Plugin

A lightweight, framework-agnostic analytics bridge for JavaScript games to communicate with a React Native WebView host.

## Features

- **Session Management**: Track game sessions with unique IDs.
- **Level Tracking**: Monitor level start, completion, success status, and time taken.
- **Task Recording**: Log individual user actions, questions, and choices within levels.
- **Raw Metrics**: Capture generic key-value metrics like FPS, latency, etc.
- **React Native Bridge**: Automatically detects and sends data to React Native WebView via `postMessage`.
- **Singleton Pattern**: Easy access across your game architecture.

## Installation

### NPM
```bash
npm install analytics-bridge-js
```

### Direct Script Include
Include the UMD build in your HTML:
```html
<script src="dist/analytics-bridge.min.js"></script>
```

## Usage

### Initialization
Initialize the analytics manager at the start of your game.

```javascript
import AnalyticsManager from 'analytics-bridge-js';

// Create instance
const analytics = new AnalyticsManager();
// OR use singleton
// const analytics = AnalyticsManager.getInstance();

// Initialize with Game ID and Session Name
analytics.initialize('my_game_id', 'session_user_123');
```

### Tracking Levels
```javascript
// Start a level
analytics.startLevel('level_1');

// ... game play ...

// End a level (id, success, timeTakenMs, xpEarned)
analytics.endLevel('level_1', true, 45000, 100);
```

### Recording Tasks
Track specific interactions like answering a question.

```javascript
analytics.recordTask(
  'level_1',       // Level ID
  'task_01',       // Task ID
  'What is 2+2?',  // Question
  '4',             // Correct Choice
  '4',             // User Choice
  2000,            // Time taken (ms)
  10               // XP Earned
);
```

### Raw Metrics
Track performance or other custom data.

```javascript
analytics.addRawMetric('fps', '60');
analytics.addRawMetric('memory_usage', '128MB');
```

### Submitting Data
Send the collected data to the host environment.

```javascript
analytics.submitReport();
```

## Framework Examples

### Phaser 3
```javascript
class GameScene extends Phaser.Scene {
  create() {
    this.analytics = new AnalyticsManager();
    this.analytics.initialize('phaser_game', 'session_1');
  }
  
  onLevelComplete() {
    this.analytics.endLevel('level_1', true, 5000, 100);
    this.analytics.submitReport();
  }
}
```

### Vanilla JS
```javascript
const analytics = new AnalyticsManager(); // Global from script tag
analytics.initialize('canvas_game', 'session_1');
```

### React / React Native
```jsx
// npm install analytics-bridge-js
import AnalyticsManager from 'analytics-bridge-js';

const MyGameComponent = () => {
  // Use ref to keep the instance stable across renders
  const analytics = React.useRef(new AnalyticsManager());

  React.useEffect(() => {
    analytics.current.initialize('my_game', 'session_1');
  }, []);

  const finishLevel = () => {
    analytics.current.endLevel('avg_level', true, 3000, 50);
    analytics.current.submitReport();
  };

  return <button onClick={finishLevel}>Win Game</button>;
};
```

## Build

To build the project from source:

```bash
npm install
npm run build
```

This will generate:
- `dist/analytics-bridge.js` (UMD)
- `dist/analytics-bridge.min.js` (UMD Minified)
- `dist/analytics-bridge.esm.js` (ES Module)

## License
MIT
