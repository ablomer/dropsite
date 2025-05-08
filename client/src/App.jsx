import React, { useState, useCallback, useRef, useEffect } from 'react';
import * as tus from 'tus-js-client';
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
import ProgressGraph from './components/ProgressGraph';
import { formatBytes, formatSpeed } from './utils/formatters';

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

// Always use HTTPS in production, use the current protocol in development
const UPLOAD_ENDPOINT = `${window.location.protocol}//${window.location.host}/files/`;
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

  // Function to update transfer rate and ETA
  const updateTransferStats = useCallback((bytesUploaded, bytesTotal) => {
    const currentTime = Date.now();
    const timeElapsed = (currentTime - lastUploadTime.current) / 1000; // in seconds
    
    if (timeElapsed > 0) {
      const bytesDelta = bytesUploaded - lastBytesUploaded.current;
      
      if (bytesDelta > 0) { // Only update rate and related states if new bytes were transferred
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
        
        // Calculate ETA (currentRate will be > 0 here)
        const remainingBytes = bytesTotal - bytesUploaded;
        const estimatedSeconds = remainingBytes / currentRate;
        setEta(estimatedSeconds);
      }
      // If bytesDelta is 0, we don't update transferRate, history, or ETA,
      // preventing the flicker to 0.
      
      // Update refs for next calculation, regardless of bytesDelta, as long as time has passed.
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
    if (upload) {
      if (isUploading) {
        upload.abort();
        setIsUploading(false);
        setEta(null);
      } else {
        lastUploadTime.current = Date.now();
        lastBytesUploaded.current = upload.offset;
        upload.start();
        setIsUploading(true);
        uploadStartTime.current = Date.now() - (progress / 100 * file.size / (transferRate || 1));
      }
    } else {
      startUpload();
    }
  };

  // Clear upload data when a file is completed
  useEffect(() => {
    if (uploadComplete) {
      // Keep the file selected but clear the upload object
      setUpload(null);
    }
  }, [uploadComplete]);

  return (
    <div className="gradient-bg flex flex-col">
      <header className="dark-gradient-bg">
        <div className="max-w-6xl mx-auto px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex items-center space-x-3">
            <img src="/vite.svg" alt="DropSite Logo" className="w-10 h-10" />
            <h1 className="text-2xl font-bold text-slate-500">DropSite</h1>
          </div>
        </div>
      </header>
      
      <main className="flex-grow container mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white p-6">
            {/* Simplified Drag & Drop Area */}
            <div 
              className={`mb-6 transition-all duration-300 ${
                isDragging ? 'bg-sky-50' : 'bg-slate-50'
              } ${isUploading || uploadComplete ? 'hidden' : 'block'}`}
              style={{ borderRadius: '1rem' }}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <label 
                htmlFor="file-upload"
                className="flex flex-col items-center justify-center p-8 cursor-pointer"
              >
                <svg 
                  className="w-14 h-14 text-sky-500 mb-4"
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" 
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                </svg>
                <p className="text-slate-600 text-center mb-2 font-medium">
                  {isDragging ? 'Drop to upload' : 'Drag & drop files or click to browse'}
                </p>
                <p className="text-sm text-slate-500">Supports files up to {formatBytes(MAX_FILE_SIZE_BYTES)}</p>
              </label>
              <input 
                id="file-upload" 
                ref={fileInputRef}
                type="file" 
                onChange={handleFileChange} 
                className="hidden"
                disabled={isUploading}
              />
            </div>

            {/* Selected File Info */}
            {file && (
              <div className="mb-6 p-4 bg-slate-50 rounded-lg">
                <div className="flex justify-between items-center">
                  <div className="flex items-center space-x-3">
                    <svg className="w-6 h-6 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                    <div>
                      <p className="font-medium text-slate-800 break-all">{file.name}</p>
                      <p className="text-sm text-slate-600">{formatBytes(file.size)}</p>
                    </div>
                  </div>
                  <button 
                    className={`btn ${isUploading ? 'bg-red-500 hover:bg-red-600' : 'bg-sky-500 hover:bg-sky-600'} text-white`}
                    onClick={toggleUpload}
                  >
                    {isUploading ? 'Pause Upload' : 'Start Upload'}
                  </button>
                </div>
              </div>
            )}

            {/* Error Message - Simplified */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg">
                <div className="flex items-center">
                  <svg className="w-5 h-5 mr-2 text-red-500" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  <p>{error}</p>
                </div>
              </div>
            )}

            {/* Progress Section - Cleaner Layout */}
            {(isUploading || (progress > 0 && !uploadComplete)) && (
              <div className="mb-6 space-y-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-sm font-medium text-slate-600 mb-1">Transferring</p>
                      <p className="text-2xl font-semibold text-slate-800">{progress}%</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-600">
                        <span className="font-medium">{formatSpeed(transferRate)}</span>
                      </p>
                      <p className="text-xs text-slate-500">{formatDuration(eta)} remaining</p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="relative">
                    <ProgressGraph 
                      progress={parseFloat(progress)}
                      transferRates={transferRateHistory}
                      currentSpeed={transferRate}
                      height={120}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Success State - Simplified */}
            {uploadComplete && uploadURL && (
              <div className="mt-6 p-4 bg-emerald-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M5 13l4 4L19 7"/>
                  </svg>
                  <div>
                    <p className="font-medium text-emerald-800">Transfer Complete</p>
                    <a 
                      href={uploadURL}
                      className="mt-1 block text-sky-600 hover:text-sky-700 text-sm break-all"
                      target="_blank" 
                      rel="noreferrer noopener"
                    >
                      {uploadURL}
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
      
      <footer className="dark-gradient-bg mt-auto py-5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-sm text-slate-400/80 text-center">
            © {new Date().getFullYear()} DropSite
          </p>
          <a
            href="https://github.com/yourusername/dropsite"
            className="text-blue-500 hover:text-blue-700"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}

export default App; 