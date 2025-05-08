import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend,
} from 'chart.js';
import { formatSpeed } from '../utils/formatters';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend
);

// Simplified configuration for Chart.js
ChartJS.defaults.set('elements.line.tension', 0.3);
ChartJS.defaults.set('elements.point.radius', 0);

const ProgressGraph = ({
  progress = 0,
  transferRates = [],
  currentSpeed = 0,
  maxSpeed = null,
  width = '100%',
  height = 60,
  speedUpdateFrequency = 300, // How often to update the displayed speed in milliseconds
  eta = null,
  formatDuration = (seconds) => seconds ? `${seconds}s` : 'Calculating...',
}) => {
  // State for displayed speed value - updates more slowly
  const [displayedSpeed, setDisplayedSpeed] = useState(currentSpeed);
  // Track last update time for displayed speed
  const lastSpeedUpdateRef = useRef(Date.now());
  
  // Maintain a state for the adapting max speed to ensure smooth transitions
  const [adaptiveMaxSpeed, setAdaptiveMaxSpeed] = useState(30 * 1024 * 1024); // Initial guess in B/s
  
  // Update displayed speed at a slower rate for readability
  useEffect(() => {
    const now = Date.now();
    // Only update displayed speed value based on the provided frequency
    if (now - lastSpeedUpdateRef.current >= speedUpdateFrequency) {
      lastSpeedUpdateRef.current = now;
      
      // Smooth out the displayed speed with some averaging
      setDisplayedSpeed(prev => {
        // Apply 70% weight to previous value, 30% to new value
        return (prev * 0.7 + currentSpeed * 0.3); // Keep as number (B/s), format on display
      });
    }
  }, [currentSpeed, speedUpdateFrequency]);
  
  // Update the adaptive max speed whenever transfer rates or current speed changes
  useEffect(() => {
    // Filter out null values and get actual rates
    const validRates = transferRates.filter(rate => rate !== null && Number.isFinite(rate));
    
    if (validRates.length === 0 && currentSpeed === 0) {
      return; // No data yet
    }
    
    // Calculate new max based on highest rate observed plus 20% headroom
    const newMax = Math.max(
      ...validRates,
      currentSpeed,
      1 // Minimum to prevent division by zero
    ) * 1.2;
    
    // Only update if the new max is higher or significantly lower (to avoid frequent tiny adjustments)
    if (newMax > adaptiveMaxSpeed || newMax < adaptiveMaxSpeed * 0.7) {
      setAdaptiveMaxSpeed(prev => {
        // Add smoothing to the max speed updates
        return prev * 0.9 + newMax * 0.1;
      });
    }
    // Ensure adaptiveMaxSpeed doesn't become 0 if all inputs are 0 for a while
    if (adaptiveMaxSpeed < 1) setAdaptiveMaxSpeed(1 * 1024 * 1024); // Reset to a sensible minimum like 1MB/s if it gets too low
  }, [transferRates, currentSpeed]);
  
  // Create labels array based on transfer rates length
  const labels = useMemo(() => {
    return Array.from({ length: transferRates.length }, () => '');
  }, [transferRates.length]);
  
  // Prepare data for Chart.js
  const data = {
    labels,
    datasets: [
      {
        fill: true,
        label: 'Transfer Rate',
        data: transferRates,
        borderColor: 'rgba(0, 128, 0, 1)',
        backgroundColor: 'rgba(0, 200, 0, 0.3)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
      },
    ],
  };

  // Chart.js options
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false, // Disable all animations for reliability
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: false,
      },
    },
    scales: {
      x: {
        display: false,
        grid: {
          display: false,
        },
      },
      y: {
        display: false,
        min: 0,
        max: maxSpeed || adaptiveMaxSpeed,
        grid: {
          display: false,
        },
      },
    },
  };

  return (
    <div className="w-full">
      {/* Speed and time remaining display above the graph */}
      <div className="flex justify-between text-xs text-gray-700 mb-1">
        <div className="text-slate-500">{formatDuration(eta)} remaining</div>
        <div>Speed: {formatSpeed(displayedSpeed, 1)}</div>
      </div>
      
      {/* Progress area with grid background */}
      <div className="w-full bg-white border border-gray-300 p-1">
        <div 
          className="relative" 
          style={{ height: `${height}px`, width }}
        >
          {/* Grid lines (vertical) */}
          <div className="absolute inset-0 grid grid-cols-6 w-full h-full z-0">
            {Array.from({ length: 6 }).map((_, i) => (
              <div 
                key={`v-${i}`} 
                className="border-r border-gray-200 h-full" 
                style={{ 
                  gridColumn: i + 1,
                  borderRight: i === 5 ? 'none' : undefined
                }}
              />
            ))}
          </div>
          
          {/* Grid lines (horizontal) */}
          <div className="absolute inset-0 grid grid-rows-3 w-full h-full z-0">
            {Array.from({ length: 3 }).map((_, i) => (
              <div 
                key={`h-${i}`} 
                className="border-b border-gray-200 w-full" 
                style={{ 
                  gridRow: i + 1,
                  borderBottom: i === 2 ? 'none' : undefined
                }}
              />
            ))}
          </div>
          
          {/* Chart area */}
          <div className="absolute inset-0 z-10">
            <Line data={data} options={options} />
          </div>
          
          {/* Progress overlay - clip the visible area of the graph */}
          <div 
            className="absolute top-0 bottom-0 right-0 bg-white z-20"
            style={{ 
              width: `${Math.max(0, 100 - progress)}%`, 
              left: `${Math.min(100, progress)}%`,
              transition: 'width 100ms linear, left 100ms linear' 
            }} 
          />
          
          {/* Green tint over the visible area */}
          <div 
            className="absolute top-0 left-0 bottom-0 bg-green-100 opacity-30 z-10"
            style={{ 
              width: `${Math.min(100, progress)}%`,
              transition: 'width 100ms linear' 
            }} 
          />
          
          {/* Progress percentage indicator */}
          <div 
            className="absolute inset-0 flex items-end justify-start pb-1 pl-1 z-30"
            style={{
              opacity: progress > 2 ? 0.85 : 0,
              transition: 'opacity 200ms ease'
            }}
          >
            <div className="flex items-baseline">
              <span className="text-3xl sm:text-4xl font-bold text-green-800/70 w-16 text-right">
                {Math.round(progress)}
              </span>
              <span className="text-sm font-medium text-green-700/60 ml-0.5">%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProgressGraph; 