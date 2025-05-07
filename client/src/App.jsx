import React, { useState, useCallback } from 'react';
import * as tus from 'tus-js-client';
import './App.css';

const UPLOAD_ENDPOINT = '/files/';
const CHUNK_SIZE = parseInt(import.meta.env.VITE_CHUNK_SIZE || '10485760'); // 10MB default, from .env or default
const MAX_FILE_SIZE_BYTES = parseInt(import.meta.env.VITE_MAX_FILE_SIZE || '21474836480'); // 20GB default

function App() {
  const [file, setFile] = useState(null);
  const [upload, setUpload] = useState(null);
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadURL, setUploadURL] = useState(null);
  const [error, setError] = useState(null);
  const [uploadComplete, setUploadComplete] = useState(false);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
        setError(`File is too large. Maximum size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024 * 1024)} GB.`);
        setFile(null);
        return;
      }
      setFile(selectedFile);
      setError(null);
      setProgress(0);
      setUploadURL(null);
      setUploadComplete(false);
    }
  };

  const startUpload = useCallback(() => {
    if (!file) {
      setError('Please select a file first.');
      return;
    }

    setError(null);
    setUploadComplete(false);
    setProgress(0);

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
      },
      onChunkComplete: (chunkSize, bytesAccepted, bytesTotal) => {
        console.log(`Chunk complete: ${bytesAccepted}/${bytesTotal}`);
      },
      onSuccess: () => {
        console.log('Download %s from %s', tusUpload.file.name, tusUpload.url);
        setUploadURL(tusUpload.url);
        setIsUploading(false);
        setUploadComplete(true);
        // The file is fully uploaded
        // tusUpload.url will give you the URL of the uploaded file on the server
      },
      onError: (err) => {
        console.error('Failed because: ', err);
        let details = 'Unknown error';
        if (err.originalRequest) {
            // Accessing properties directly is safer than methods like getStatus()
            details = `Status: ${err.originalRequest.status}, Response: ${err.originalRequest.responseText || '(empty response text)'}`;
        } else if (err.cause) {
            details = `Caused by: ${err.cause}`;
        } else if (err.message) {
            // Use err.message if available and other sources are not
            details = err.message;
        }
        setError(`Upload failed. ${details}`);
        setIsUploading(false);
      },
    });

    setUpload(tusUpload);
    tusUpload.start();
    setIsUploading(true);
  }, [file]);

  const toggleUpload = () => {
    if (isUploading && upload) {
      upload.abort();
      setIsUploading(false);
      console.log('Upload paused/aborted.');
    } else if (file) {
      if (upload && !uploadComplete) { // Resuming an aborted upload
        console.log('Resuming upload...');
        upload.start();
        setIsUploading(true);
      } else { // Starting a new upload
        startUpload();
      }
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

  return (
    <div className="App">
      <header className="App-header">
        <h1>DropSite File Upload</h1>
        <p>Powered by TUS resumable upload protocol.</p>
      </header>

      <div className="upload-container">
        <input type="file" onChange={handleFileChange} disabled={isUploading} />
        
        {file && (
          <div className="file-info">
            <p><strong>Selected file:</strong> {file.name} ({formatBytes(file.size)})</p>
          </div>
        )}

        {error && <p className="error-message">Error: {error}</p>}

        {file && (
          <button onClick={toggleUpload} disabled={!file && !isUploading}>
            {isUploading ? 'Pause Upload' : (upload && !uploadComplete && progress > 0 ? 'Resume Upload' : 'Start Upload')}
          </button>
        )}

        {isUploading || (progress > 0 && !uploadComplete) ? (
          <div className="progress-container">
            <p>Upload Progress: {progress}%</p>
            <progress value={progress} max="100" style={{ width: '100%'}} />
          </div>
        ) : null}

        {uploadComplete && uploadURL && (
          <div className="upload-success">
            <p>Upload successful!</p>
            <p>File URL: <a href={uploadURL} target="_blank" rel="noopener noreferrer">{uploadURL}</a></p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App; 