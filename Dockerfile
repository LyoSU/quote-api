FROM mcr.microsoft.com/playwright:v1.35.0-jammy

WORKDIR /app
ADD . /app

#RUN apt-get update && apt-get install -y build-essential gcc wget git libvips && rm -rf /var/lib/apt/lists/*

RUN npm install && npx playwright install
ENTRYPOINT [ "npm", "start" ]
