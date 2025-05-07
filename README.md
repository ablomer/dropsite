
# DropSite

A high-performance, self-hosted file drop site for transferring large files at maximum available bandwidth.

## Features

- Handles files up to 20GB in size
- Maximizes bandwidth utilization between client and server
- Resumable uploads for reliability
- Chunked file transfer for optimal performance
- Simple, intuitive web interface

## Architecture

DropSite uses a modern tech stack optimized for large file transfers:

- **Backend**: Node.js with Express
- **Frontend**: React with streaming upload components
- **File Storage**: Direct filesystem storage
- **Upload Technology**: TUS (Resumable Upload Protocol) for chunked, resumable uploads

## Installation

### Prerequisites

- Node.js 18+
- npm or yarn
- Nginx
- Sufficient disk space for uploads

### Quick Start

```bash
# Clone the repository
git clone https://github.com/ablomer/dropsite.git
cd dropsite

# Install dependencies
npm install

# Configure settings
cp .env.example .env
# Edit .env with your settings

# Start the application
npm run start
```

## Usage

1. Access the web interface at your configured domain
2. Drag and drop files or use the file selector
3. Files will be accessible by link

## Performance Optimization

DropSite maximizes upload speeds through:

- **Chunked Uploads**: Files are split into optimal-sized chunks (typically 5MB)
- **Parallel Transfers**: Multiple chunks are uploaded simultaneously
- **Progress Monitoring**: Real-time feedback on transfer rates and ETAs

## Configuration Options

Edit the `.env` file to customize:

```
PORT=3000
UPLOAD_DIR=/path/to/upload/storage
MAX_FILE_SIZE=21474836480  # 20GB in bytes
```

## License

MIT
