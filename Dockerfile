# Stage 1: Build the client
FROM node:18-alpine AS client-builder

WORKDIR /app/client

# Copy client package files and install dependencies
COPY client/package.json client/package-lock.json* ./
RUN npm install

# Copy the rest of the client source code
COPY client/ ./

# Build the client
RUN npm run build
# Default output for vite build is 'dist' directory in the current WORKDIR (/app/client/dist)

# Stage 2: Setup the server
FROM node:18-alpine

WORKDIR /app/server

# Copy server package files and install dependencies
COPY server/package.json server/package-lock.json* ./
RUN npm install

# Copy the rest of the server source code
COPY server/ ./

# Copy the built client from the client-builder stage to the server's public directory
COPY --from=client-builder /app/client/dist ./public

# Application Metadata
LABEL version="1.0"
LABEL description="DropSite application"

# Expose the port the server will run on
ENV PORT=3000
EXPOSE 3000

# Set the UPLOAD_DIR to a consistent path inside the container
# server.js default is './uploads', which would be /app/server/uploads
ENV UPLOAD_DIR=/app/server/uploads

# Command to run the server
CMD ["node", "server.js"] 