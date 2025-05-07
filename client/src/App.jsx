import React, { useState, useCallback, useRef, useEffect } from 'react';
import * as tus from 'tus-js-client';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import './App.css';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// Check if we're in development mode
const isDev = import.meta.env.DEV;
// Make sure UPLOAD_ENDPOINT has the correct URL structure
const UPLOAD_ENDPOINT = '/files/';
const CHUNK_SIZE = parseInt(import.meta.env.VITE_CHUNK_SIZE || '10485760'); // 10MB default, from .env or default
const MAX_FILE_SIZE_BYTES = parseInt(import.meta.env.VITE_MAX_FILE_SIZE || '21474836480'); // 20GB default
const TRANSFER_RATE_HISTORY_LENGTH = 30; // Number of data points to keep for the graph

function App() {
  const [file, setFile] = useState(null);
  const [upload, setUpload] = useState(null);
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadURL, setUploadURL] = useState(null);
  const [error, setError] = useState(null);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // New state variables for the additional features
  const [transferRate, setTransferRate] = useState(0); // bytes per second
  const [eta, setEta] = useState(null); // estimated time of arrival (in seconds)
  const [transferRateHistory, setTransferRateHistory] = useState([]);
  const [timeLabels, setTimeLabels] = useState([]);

  // Refs for tracking upload progress and time
  const lastBytesUploaded = useRef(0);
  const lastUploadTime = useRef(Date.now());
  const uploadStartTime = useRef(null);
  const fileInputRef = useRef(null);

  // Initialize chart data
  const chartData = {
    labels: timeLabels,
    datasets: [
      {
        label: 'Transfer Rate (MB/s)',
        data: transferRateHistory.map(rate => (rate / (1024 * 1024)).toFixed(2)), // Convert to MB/s
        fill: true,
        backgroundColor: 'rgba(14, 165, 233, 0.2)',
        borderColor: 'rgba(14, 165, 233, 1)',
        tension: 0.4,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: true,
        text: 'Upload Speed Over Time',
        color: '#475569',
        font: {
          size: 16,
        },
      },
      tooltip: {
        callbacks: {
          label: (context) => `${context.parsed.y} MB/s`,
        },
      },
    },
    scales: {
      x: {
        display: true,
        title: {
          display: false,
        },
        ticks: {
          maxTicksLimit: 5,
        },
      },
      y: {
        display: true,
        title: {
          display: true,
          text: 'MB/s',
        },
        min: 0,
      },
    },
    animation: {
      duration: 500,
    },
  };

  // Function to update transfer rate and ETA
  const updateTransferStats = useCallback((bytesUploaded, bytesTotal) => {
    const currentTime = Date.now();
    const timeElapsed = (currentTime - lastUploadTime.current) / 1000; // in seconds
    
    if (timeElapsed > 0) {
      const bytesDelta = bytesUploaded - lastBytesUploaded.current;
      const currentRate = bytesDelta / timeElapsed; // bytes per second
      
      setTransferRate(currentRate);
      
      // Update the transfer rate history
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      setTransferRateHistory(prevHistory => {
        const newHistory = [...prevHistory, currentRate];
        // Keep only the most recent data points
        if (newHistory.length > TRANSFER_RATE_HISTORY_LENGTH) {
          return newHistory.slice(newHistory.length - TRANSFER_RATE_HISTORY_LENGTH);
        }
        return newHistory;
      });
      
      setTimeLabels(prevLabels => {
        const newLabels = [...prevLabels, timestamp];
        if (newLabels.length > TRANSFER_RATE_HISTORY_LENGTH) {
          return newLabels.slice(newLabels.length - TRANSFER_RATE_HISTORY_LENGTH);
        }
        return newLabels;
      });
      
      // Calculate ETA
      if (currentRate > 0) {
        const remainingBytes = bytesTotal - bytesUploaded;
        const estimatedSeconds = remainingBytes / currentRate;
        setEta(estimatedSeconds);
      }
      
      // Update refs for next calculation
      lastBytesUploaded.current = bytesUploaded;
      lastUploadTime.current = currentTime;
    }
  }, []);

  // Format time duration to human-readable format
  const formatDuration = (seconds) => {
    if (seconds === null || isNaN(seconds)) return 'Calculating...';
    
    if (seconds < 1) {
      return 'Less than a second';
    }
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    let result = '';
    if (hours > 0) result += `${hours}h `;
    if (minutes > 0 || hours > 0) result += `${minutes}m `;
    result += `${remainingSeconds}s`;
    
    return result;
  };

  // Drag and drop handlers
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isUploading) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isUploading) setIsDragging(true);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (isUploading) return;
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelection(droppedFile);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      handleFileSelection(selectedFile);
    }
  };

  const handleFileSelection = (selectedFile) => {
    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      setError(`File is too large. Maximum size is ${formatBytes(MAX_FILE_SIZE_BYTES)}.`);
      setFile(null);
      return;
    }
    setFile(selectedFile);
    setError(null);
    setProgress(0);
    setUploadURL(null);
    setUploadComplete(false);
    setTransferRate(0);
    setEta(null);
    setTransferRateHistory([]);
    setTimeLabels([]);
  };

  const startUpload = useCallback(() => {
    if (!file) {
      setError('Please select a file first.');
      return;
    }

    setError(null);
    setUploadComplete(false);
    setProgress(0);
    setTransferRate(0);
    setEta(null);
    setTransferRateHistory([]);
    setTimeLabels([]);
    
    // Reset refs
    lastBytesUploaded.current = 0;
    lastUploadTime.current = Date.now();
    uploadStartTime.current = Date.now();

    // Debug information
    console.log("Starting upload to:", UPLOAD_ENDPOINT);
    
    const tusUpload = new tus.Upload(file, {
      endpoint: UPLOAD_ENDPOINT,
      retryDelays: [0, 3000, 5000, 10000, 20000], // Retry delays in milliseconds
      chunkSize: CHUNK_SIZE,
      metadata: {
        filename: file.name,
        filetype: file.type,
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        const percentage = ((bytesUploaded / bytesTotal) * 100).toFixed(2);
        setProgress(percentage);
        updateTransferStats(bytesUploaded, bytesTotal);
      },
      onChunkComplete: (chunkSize, bytesAccepted, bytesTotal) => {
        console.log(`Chunk complete: ${bytesAccepted}/${bytesTotal}`);
      },
      onSuccess: () => {
        console.log('Download %s from %s', tusUpload.file.name, tusUpload.url);
        setUploadURL(tusUpload.url);
        setIsUploading(false);
        setUploadComplete(true);
      },
      onError: (err) => {
        console.error('Failed because: ', err);
        let details = 'Unknown error';
        if (err.originalRequest) {
          console.log('Original request:', {
            status: err.originalRequest.status,
            responseText: err.originalRequest.responseText,
            responseHeaders: err.originalRequest.getAllResponseHeaders?.() || 'N/A'
          });
          
          details = `Status: ${err.originalRequest.status}, Response: ${err.originalRequest.responseText || '(empty response text)'}`;
          
          // Specific error handling for common issues
          if (err.originalRequest.status === 500) {
            details = `Server error (500). This could be due to server configuration issues or file processing limits.`;
          } else if (err.originalRequest.status === 0 || err.originalRequest.status === 404) {
            details = `Cannot connect to server at ${UPLOAD_ENDPOINT}. Please check if the server is running.`;
          } else if (err.originalRequest.status === 403) {
            details = `Permission denied. Please check your authorization.`;
          }
        } else if (err.cause) {
          details = `Caused by: ${err.cause}`;
        } else if (err.message) {
          details = err.message;
        }
        setError(`Upload failed. ${details}`);
        setIsUploading(false);
      },
    });

    // Log some debug info
    console.log("File upload configuration:", {
      fileName: file.name,
      fileSize: formatBytes(file.size),
      chunkSize: formatBytes(CHUNK_SIZE),
      endpoint: UPLOAD_ENDPOINT
    });

    setUpload(tusUpload);
    tusUpload.start();
    setIsUploading(true);
  }, [file, updateTransferStats]);

  const toggleUpload = () => {
    if (isUploading && upload) {
      upload.abort();
      setIsUploading(false);
      console.log('Upload paused/aborted.');
    } else if (file) {
      if (upload && !uploadComplete && progress > 0) { // Resuming an aborted upload
        console.log('Resuming upload...');
        upload.start();
        setIsUploading(true);
        // Reset time tracking for resumed upload
        lastUploadTime.current = Date.now();
      } else { // Starting a new upload
        // If there was a previous error, clear it
        setError(null);
        startUpload();
      }
    }
  };

  // Add a function to restart the upload from scratch
  const restartUpload = () => {
    if (file) {
      console.log('Restarting upload from scratch');
      // Clear previous upload
      setUpload(null);
      // Reset state
      setProgress(0);
      setUploadURL(null);
      setError(null);
      setUploadComplete(false);
      // Start new upload
      setTimeout(() => {
        startUpload();
      }, 100);
    }
  };
  
  const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  // Clear upload data when a file is completed
  useEffect(() => {
    if (uploadComplete) {
      // Keep the file selected but clear the upload object
      setUpload(null);
    }
  }, [uploadComplete]);

  return (
    <div className="min-h-screen flex flex-col bg-secondary-50">
      <header className="bg-secondary-900 text-white py-6">
        <div className="container mx-auto px-4 flex flex-col items-center">
          <h1 className="text-3xl font-bold text-primary-300 mb-2">DropSite</h1>
          <p className="text-secondary-300">Transfer large files at maximum speed</p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 flex-grow flex flex-col">
        <div className="card max-w-3xl mx-auto w-full">
          <h2 className="text-2xl font-semibold text-secondary-800 mb-6">Upload File</h2>
          
          {/* File Upload Area */}
          <div 
            className={`mb-6 ${isUploading || uploadComplete ? 'hidden' : 'block'}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <label 
              htmlFor="file-upload" 
              className={`file-input-label ${isDragging ? 'active' : ''} ${isUploading ? 'disabled' : ''}`}
            >
              <div className="flex flex-col items-center justify-center p-6">
                <svg className="w-12 h-12 text-secondary-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                </svg>
                <p className="text-secondary-600 mb-1 font-medium">Drag & drop your file here or</p>
                <button 
                  type="button" 
                  onClick={triggerFileInput}
                  className="btn btn-primary mt-2"
                  disabled={isUploading}
                >
                  Browse Files
                </button>
                <p className="text-xs text-secondary-400 mt-2">Max file size: {formatBytes(MAX_FILE_SIZE_BYTES)}</p>
              </div>
            </label>
            <input 
              id="file-upload" 
              ref={fileInputRef}
              type="file" 
              onChange={handleFileChange} 
              disabled={isUploading}
              className="file-input-hidden"
            />
          </div>

          {/* Selected File Info */}
          {file && (
            <div className="mb-6 p-4 bg-secondary-100 rounded-lg">
              <h3 className="font-medium text-secondary-800 mb-2">Selected File</h3>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
                <div className="flex items-center">
                  <svg className="w-8 h-8 text-secondary-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                  </svg>
                  <div>
                    <p className="font-medium text-secondary-800 break-all">{file.name}</p>
                    <p className="text-sm text-secondary-500">{formatBytes(file.size)}</p>
                  </div>
                </div>
                
                <button 
                  className={`mt-3 md:mt-0 btn ${isUploading ? 'btn-error' : uploadComplete ? 'btn-success' : 'btn-primary'}`}
                  onClick={toggleUpload}
                  disabled={!file && !isUploading}
                >
                  {isUploading ? 'Pause Upload' : (upload && !uploadComplete && progress > 0 ? 'Resume Upload' : uploadComplete ? 'Upload Complete' : 'Start Upload')}
                </button>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-error-50 text-error-700 border border-error-200 rounded-lg">
              <div className="flex flex-col">
                <div className="flex">
                  <svg className="w-5 h-5 mr-2 text-error-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  <p>{error}</p>
                </div>
                <div className="mt-3 flex justify-end">
                  <button 
                    className="btn btn-secondary mr-2"
                    onClick={restartUpload}
                  >
                    Retry Upload
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Upload Progress Section */}
          {(isUploading || (progress > 0 && !uploadComplete)) && (
            <div className="mb-6">
              <div className="mb-4 flex flex-col md:flex-row md:justify-between md:items-end">
                <div>
                  <h3 className="font-medium text-secondary-800 mb-1">Upload Progress</h3>
                  <p className="text-3xl font-semibold text-primary-600">{progress}%</p>
                </div>
                <div className="mt-3 md:mt-0 flex flex-col items-start md:items-end">
                  <p className="text-sm text-secondary-600">
                    <span className="font-medium">Transfer Rate:</span> {formatBytes(transferRate)}/s
                  </p>
                  <p className="text-sm text-secondary-600">
                    <span className="font-medium">ETA:</span> {formatDuration(eta)}
                  </p>
                </div>
              </div>

              <div className="w-full bg-secondary-200 rounded-full h-4 mb-6">
                <div 
                  className="bg-primary-500 h-4 rounded-full transition-all duration-300 ease-out"
                  style={{width: `${progress}%`}}
                ></div>
              </div>

              {/* Transfer Rate Graph */}
              <div className="h-64 mt-6">
                <Line data={chartData} options={chartOptions} />
              </div>
            </div>
          )}

          {/* Upload Success Information */}
          {uploadComplete && uploadURL && (
            <div className="mb-6 p-4 bg-success-50 border border-success-200 rounded-lg">
              <div className="flex items-start">
                <svg className="w-5 h-5 mt-0.5 mr-2 text-success-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <div>
                  <p className="font-medium text-success-700">Upload successful!</p>
                  <p className="mt-1 text-secondary-600">Your file is now available at:</p>
                  <a 
                    href={uploadURL} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="mt-2 block p-2 bg-white border border-secondary-200 rounded break-all text-primary-600 hover:text-primary-800"
                  >
                    {uploadURL}
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="bg-secondary-900 text-white py-4">
        <div className="container mx-auto px-4 text-center text-secondary-400 text-sm">
          <p>DropSite - A high-performance, self-hosted file drop site</p>
        </div>
      </footer>
    </div>
  );
}

export default App; 