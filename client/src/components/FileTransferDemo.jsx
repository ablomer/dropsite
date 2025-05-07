import React, { useState, useEffect, useRef } from 'react';
import ProgressGraph from './ProgressGraph';

const FileTransferDemo = ({
  speedUpdateFrequency = 200, // How often to update the displayed speed (milliseconds)
  timeUpdateFrequency = 500,  // How often to update the displayed time (milliseconds)
}) => {
  const [progress, setProgress] = useState(0);
  const [transferRates, setTransferRates] = useState([]);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [displayedTimeRemaining, setDisplayedTimeRemaining] = useState(0);
  const [fileSize, setFileSize] = useState(222); // MB
  const [fileName, setFileName] = useState('IC_latest_Win.zip');
  
  // Maximum number of data points to display
  const MAX_DATA_POINTS = 100; // Increased for smoother appearance
  
  // Use refs to keep track of the last update time and animation frame
  const lastUpdateTimeRef = useRef(Date.now());
  const lastTimeDisplayUpdateRef = useRef(Date.now());
  const animationFrameRef = useRef(null);
  
  // Pattern reference to create more realistic variation
  const patternRef = useRef({
    baseline: 20, // MB/s
    trend: 0,     // upward/downward trend
    volatility: 0.3, // how much randomness
    trendChance: 0.05, // chance of trend change
    speedRange: { min: 5, max: 40 }, // min-max speed in MB/s
    // Add interlacing properties
    lastGeneratedValues: [], // Store recently generated values for interpolation
    updateCounter: 0, // Counter for interlacing updates
  });
  
  // Update displayed time remaining at a slower rate
  useEffect(() => {
    const now = Date.now();
    // Only update displayed time value using the provided frequency
    if (now - lastTimeDisplayUpdateRef.current >= timeUpdateFrequency) {
      lastTimeDisplayUpdateRef.current = now;
      setDisplayedTimeRemaining(timeRemaining);
    }
  }, [timeRemaining, timeUpdateFrequency]);
  
  // Generate realistic speed value (in MB/s)
  const generateSpeed = () => {
    const pattern = patternRef.current;
    
    // Potentially change trend direction
    if (Math.random() < pattern.trendChance) {
      pattern.trend = Math.random() * 2 - 1; // Between -1 and 1
    }
    
    // Calculate new speed with trend and volatility
    let newSpeed = pattern.baseline + 
      (pattern.trend * Math.random() * 3) + 
      (Math.random() * pattern.volatility * 10 - pattern.volatility * 5);
    
    // Ensure speed stays within range
    newSpeed = Math.max(pattern.speedRange.min, 
              Math.min(pattern.speedRange.max, newSpeed));
    
    // Occasional speed spike or drop (5% chance)
    if (Math.random() < 0.05) {
      if (Math.random() < 0.5) {
        // Spike up
        newSpeed = Math.min(pattern.speedRange.max, newSpeed * (1 + Math.random()));
      } else {
        // Drop down
        newSpeed = Math.max(pattern.speedRange.min, newSpeed * (0.5 + Math.random() * 0.5));
      }
    }
    
    // Update baseline for next iteration (with smoothing)
    pattern.baseline = pattern.baseline * 0.95 + newSpeed * 0.05;
    
    return newSpeed; // This is in MB/s
  };
  
  // Create initial rates array
  const initializeRates = () => {
    const initialRates = Array(MAX_DATA_POINTS).fill(null).map((_, i) => {
      if (i < MAX_DATA_POINTS / 2) return null;
      // Convert baseline MB/s to B/s for the transferRates array if ProgressGraph expects B/s
      // However, ProgressGraph `transferRates` are plotted directly.
      // If `currentSpeed` prop for ProgressGraph is B/s, then `transferRates` should also be B/s for consistency in scale.
      return patternRef.current.baseline * 1024 * 1024; // Convert to B/s
    });
    setTransferRates(initialRates); // Storing B/s
    setCurrentSpeed(patternRef.current.baseline * 1024 * 1024); // Starting speed in B/s
  };
  
  // Animation loop for smooth updates
  const animationLoop = () => {
    const now = Date.now();
    const elapsed = now - lastUpdateTimeRef.current;
    
    // Run updates at approximately 60fps (16.6ms)
    if (elapsed >= 16) {
      lastUpdateTimeRef.current = now;
      
      // Update progress more frequently but in smaller increments
      setProgress(prev => {
        const increment = 0.1; // Smaller increment for smoother progress
        return Math.min(prev + increment, 100);
      });
      
      const pattern = patternRef.current;
      pattern.updateCounter++;
      
      // Every 3rd frame, generate a new actual value
      if (pattern.updateCounter % 3 === 0) {
        const newSpeedMBs = generateSpeed(); // This is in MB/s
        
        pattern.lastGeneratedValues.push(newSpeedMBs);
        if (pattern.lastGeneratedValues.length > 5) {
          pattern.lastGeneratedValues.shift();
        }
        
        // Convert MB/s to B/s for setCurrentSpeed and transferRates
        const newSpeedBs = newSpeedMBs * 1024 * 1024;
        setCurrentSpeed(newSpeedBs); // Update current speed display with B/s
        
        setTransferRates(prev => {
          const newRates = [...prev];
          const positionToFill = newRates.findIndex(rate => rate === null);
          
          if (positionToFill === -1) {
            return newRates;
          } else {
            newRates[positionToFill] = newSpeedBs; // Add new rate in B/s
            return newRates;
          }
        });
        
        const remainingMB = fileSize * (1 - progress / 100);
        // newSpeedMBs is used here for remainingSecs calculation as fileSize is in MB
        const remainingSecs = remainingMB / newSpeedMBs; 
        setTimeRemaining(Math.round(remainingSecs));
      } 
      // On other frames, update with interpolated values
      else if (pattern.lastGeneratedValues.length >= 2) {
        const lastValueMBs = pattern.lastGeneratedValues[pattern.lastGeneratedValues.length - 1];
        const prevValueMBs = pattern.lastGeneratedValues[pattern.lastGeneratedValues.length - 2];
        
        const ratio = (pattern.updateCounter % 3) / 3;
        const interpolatedMBs = prevValueMBs + (lastValueMBs - prevValueMBs) * ratio + 
                            (Math.random() - 0.5) * 0.5; 
        
        setCurrentSpeed(interpolatedMBs * 1024 * 1024); // Convert interpolated MB/s to B/s
      }
    }
    
    // Stop animation if progress is complete
    if (progress >= 100) {
      return;
    }
    
    // Continue the animation loop
    animationFrameRef.current = requestAnimationFrame(animationLoop);
  };
  
  // Initialize and start animation loop
  useEffect(() => {
    // Initialize if needed
    if (transferRates.length === 0) {
      initializeRates();
    }
    
    // Start animation loop
    animationFrameRef.current = requestAnimationFrame(animationLoop);
    
    // Cleanup
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [progress, transferRates, currentSpeed, fileSize]);

  // Format displayed time remaining
  const formatTimeRemaining = (seconds) => {
    if (seconds <= 0) return 'Complete';
    if (seconds < 60) return `${seconds} seconds`;
    return `${Math.round(seconds / 60)} minutes`;
  };

  return (
    <div className="border border-gray-400 shadow-md w-full max-w-md p-4 bg-gray-100 font-sans">
      {/* Title bar */}
      <div className="flex justify-between mb-3">
        <div className="text-sm font-medium">Copying</div>
        <div className="text-sm">{Math.round(progress)}% complete</div>
      </div>
      
      {/* Progress Graph */}
      <ProgressGraph 
        progress={progress} 
        // transferRates are already B/s from initializeRates and animationLoop
        transferRates={transferRates.filter(rate => rate !== null)}
        // currentSpeed is already B/s from setCurrentSpeed calls
        currentSpeed={currentSpeed}
        speedUpdateFrequency={speedUpdateFrequency}
      />
      
      {/* File Details */}
      <div className="mt-3 text-sm space-y-1">
        <div className="flex">
          <div className="w-32 text-gray-600">Name:</div>
          <div className="font-medium">{fileName}</div>
        </div>
        <div className="flex">
          <div className="w-32 text-gray-600">Time remaining:</div>
          <div className="font-medium text-purple-900">
            About {formatTimeRemaining(displayedTimeRemaining)}
          </div>
        </div>
        <div className="flex">
          <div className="w-32 text-gray-600">Items remaining:</div>
          <div className="font-medium text-purple-900">
            {progress >= 100 ? '0' : `1 (${fileSize} MB)`}
          </div>
        </div>
      </div>
      
      {/* Action Buttons */}
      <div className="mt-4 flex justify-end space-x-2">
        <button 
          className="px-4 py-1 text-sm border border-gray-300 shadow-sm bg-gray-50 hover:bg-gray-100"
          onClick={() => {
            // Reset the demo
            setProgress(0);
            patternRef.current.baseline = 20;
            patternRef.current.trend = 0;
            patternRef.current.lastGeneratedValues = [];
            patternRef.current.updateCounter = 0;
            initializeRates();
          }}
        >
          Cancel
        </button>
        <button 
          className="px-4 py-1 text-sm border border-gray-300 shadow-sm bg-gray-50 hover:bg-gray-100"
          onClick={() => setProgress(100)}
        >
          Skip
        </button>
      </div>
    </div>
  );
};

export default FileTransferDemo; 