FROM node:20-bookworm-slim

# Install system dependencies for media processing + native module compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    imagemagick \
    webp \
    libpangocairo-1.0-0 \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    build-essential \
    python3 \
    make \
    g++ \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
# Bust cache: bump BUILD_PIN to force fresh npm install when package.json changes
ARG BUILD_PIN=v3
RUN echo "BUILD_PIN=$BUILD_PIN  $(date)" && \
    npm install && \
    echo "=== Installed packages ===" && \
    ls node_modules | grep -E "^(js-confuser|acrcloud|performance-now|google-tts-api|check-disk-space|@google|awesome-phonenumber)$" && \
    npm cache clean --force

# Copy application code
COPY . .

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV production

# Run command
CMD ["npm", "run", "start"]