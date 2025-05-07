require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('@tus/server');
const { FileStore } = require('@tus/file-store');
const fs = require('fs');
const path = require('path');

const app = express();

const port = process.env.PORT || 3000;
const uploadDir = process.env.UPLOAD_DIR || './uploads';
const maxFileSize = parseInt(process.env.MAX_FILE_SIZE, 10) || 20 * 1024 * 1024 * 1024; // 20GB

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log(`Created upload directory: ${uploadDir}`);
}

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, 'public')));

const tusServer = new Server({
    path: '/files',
    datastore: new FileStore({
        directory: uploadDir,
    }),
    maxSize: maxFileSize,
    // According to TUS protocol, chunkSize is determined by the client on upload creation

    namingFunction: (req) => {
        const timestamp = Date.now(); // Get current timestamp in milliseconds
        const encodedTimestamp = timestamp.toString(36); // Encode timestamp to base36
        const metadata = req.headers['upload-metadata'];
        let originalFilename = 'unknown_file'; // Default if no filename metadata

        if (metadata) {
            const filenameMatch = metadata.match(/filename (\S+)/);
            if (filenameMatch && filenameMatch[1]) {
                try {
                    originalFilename = Buffer.from(filenameMatch[1], 'base64').toString('utf-8');
                } catch (error) {
                    console.error('[TUS NamingFunction] Error decoding base64 filename:', error);
                    originalFilename = 'decoding_error_file';
                }
            }
        }

        // Sanitize the original filename
        let saneFilename = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^_+|_+$/g, '');

        if (!saneFilename) {
            // If sanitization results in an empty string (e.g., filename was all special chars)
            saneFilename = 'empty_filename_fallback';
        }

        // Combine encoded timestamp and sanitized filename for uniqueness
        const uniqueName = `${encodedTimestamp}-${saneFilename}`;
        
        console.log(`[TUS NamingFunction] Original: '${originalFilename}', Sanitized: '${saneFilename}', EncodedTS: '${encodedTimestamp}', Final ID: ${uniqueName}`);
        return uniqueName;
    },
    onUploadCreate: async (req, res, upload) => {
        if (!upload || typeof upload.id === 'undefined') {
            console.error('[TUS onUploadCreate] Critical Error: upload object or upload.id is undefined.', { uploadDetails: upload });
        } else {
            const filename = (upload.metadata && upload.metadata.filename) || 'unknown';
            console.log(`[TUS onUploadCreate] Upload creation initiated. ID: ${upload.id}, Filename: ${filename}`);
        }
        return res;
    },
    onUploadFinish: async (req, res, upload) => {
        if (!upload || typeof upload.id === 'undefined') {
            console.error('[TUS onUploadFinish] Critical Error: upload object or upload.id is undefined.');
        } else {
            const filename = (upload.metadata && upload.metadata.filename) || 'unknown';
            console.log(`[TUS onUploadFinish] Upload finished. ID: ${upload.id}, Filename: ${filename}, Path: ${uploadDir}/${upload.id}`);
        }
        return res;
    }
});

// Middleware to handle TUS uploads
app.all('/files/*', (req, res) => {
    tusServer.handle(req, res);
});

// The "catchall" handler: for any request that doesn't
// match one above (e.g., API routes, static files), send back React's index.html file.
// This enables client-side routing.
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
        console.error("Error sending index.html:", err);
        // Send a more user-friendly message or specific status code if index.html is not found
        res.status(404).send("Application resource not found");
    }
  });
});

const server = http.createServer(app);

server.listen(port, () => {
    console.log(`DropSite server listening on port ${port}`);
    console.log(`Uploads will be stored in: ${uploadDir}`);
    console.log(`Max file size: ${maxFileSize / (1024 * 1024 * 1024)} GB`);
    console.log(`TUS endpoint: /files`);
});