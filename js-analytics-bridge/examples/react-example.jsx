import React, { useEffect, useState, useRef } from 'react';
import AnalyticsManager from '../dist/analytics-bridge.esm.js'; 
// In a real project installed via npm, you would use:
// import AnalyticsManager from 'analytics-bridge-js';

const GameComponent = () => {
  const [levelActive, setLevelActive] = useState(false);
  const analyticsRef = useRef(null);

  // 1. Initialize on Mount
  useEffect(() => {
    // Create an instance (or use the singleton approach)
    analyticsRef.current = new AnalyticsManager();
    
    // Initialize with IDs
    analyticsRef.current.initialize('react_game_id', 'user_session_1');

    console.log('Analytics Initialized');

    // Cleanup (optional, depending on if you want to submit partial data or just clear refs)
    return () => {
        // analyticsRef.current.submitReport(); // Optional: submit on unmount
    };
  }, []);

  const handleStartLevel = () => {
    if (analyticsRef.current) {
      analyticsRef.current.startLevel('level_react_1');
      setLevelActive(true);
      console.log('Level Started');
    }
  };

  const handleEndLevel = (success) => {
    if (analyticsRef.current && levelActive) {
      // Simulate level duration
      const duration = 5000; 
      const xp = success ? 100 : 20;

      analyticsRef.current.endLevel('level_react_1', success, duration, xp);
      setLevelActive(false);
      console.log('Level Ended');
    }
  };

  const handleTask = () => {
      if(analyticsRef.current && levelActive) {
          analyticsRef.current.recordTask(
              'level_react_1',
              'question_1',
              'Is React great?',
              'yes',
              'yes',
              1000,
              10
          );
          console.log('Task Recorded');
      }
  }

  const submitMetrics = () => {
    if (analyticsRef.current) {
      analyticsRef.current.submitReport();
      alert('Report Submitted (Check Console)');
    }
  };

  return (
    <div className="game-wrapper">
      <h1>React Game Analytics Demo</h1>
      
      <div className="controls">
        <button onClick={handleStartLevel} disabled={levelActive}>
          Start Level
        </button>
        
        <button onClick={handleTask} disabled={!levelActive}>
            Answer Question
        </button>

        <button onClick={() => handleEndLevel(true)} disabled={!levelActive}>
          Win Level
        </button>
        
        <button onClick={() => handleEndLevel(false)} disabled={!levelActive}>
          Lose Level
        </button>
        
        <hr />
        
        <button onClick={submitMetrics}>
          Submit Report
        </button>
      </div>
    </div>
  );
};

export default GameComponent;
