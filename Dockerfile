# Build stage - compile native modules
FROM node:22-bookworm AS builder

WORKDIR /app

# Install build dependencies for canvas and sharp
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    g++ \
    make \
    python3 \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libpixman-1-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm ci --omit=dev

# Production stage
FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

# Install runtime dependencies and fonts
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-noto \
    fonts-noto-cjk \
    fonts-noto-extra \
    fontconfig \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    libpixman-1-0 \
    libvips42 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && fc-cache -f -v

# Vazirmatn for Arabic-script text (Persian, Arabic, …) — the typeface Telegram
# uses for it. Pinned release, checksum-verified by BuildKit (the slim image
# has no CA bundle for curl); the renderer asks for the family by name
# (constants.js FONT_FAMILY_ARABIC).
ADD --chmod=644 --checksum=sha256:b69fd4c680b8f3f225feabcc655a2c585d97627b8f5f5c0f9985e894069f3a56 \
    https://raw.githubusercontent.com/rastikerdar/vazirmatn/v33.003/fonts/ttf/Vazirmatn-Regular.ttf \
    /usr/local/share/fonts/vazirmatn/Vazirmatn-Regular.ttf
ADD --chmod=644 --checksum=sha256:f635fdbea28f265de395ba83b4b1570dcf2f58d13c65469e61903b1c2d2ae723 \
    https://raw.githubusercontent.com/rastikerdar/vazirmatn/v33.003/fonts/ttf/Vazirmatn-Bold.ttf \
    /usr/local/share/fonts/vazirmatn/Vazirmatn-Bold.ttf
RUN fc-cache -f

# Create non-root user first
RUN groupadd -r nodejs && useradd -r -g nodejs nodejs

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY --chown=nodejs:nodejs . .

USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "index.js"]
