FROM mcr.microsoft.com/playwright:v1.35.0-jammy

WORKDIR /app
COPY . /app

RUN apt-get update && apt-get install -y build-essential libvips libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev && rm -rf /var/lib/apt/lists/*

RUN npm install && npx playwright install
ENTRYPOINT [ "npm", "start" ]
