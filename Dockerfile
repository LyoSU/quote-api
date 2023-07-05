FROM nikolaik/python-nodejs:python3.11-nodejs18 AS builder

ENV NODE_WORKDIR /app
WORKDIR $NODE_WORKDIR

ADD . $NODE_WORKDIR

RUN curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add -
RUN apt-get update && apt-get install -y build-essential gcc wget git libvips && rm -rf /var/lib/apt/lists/*


RUN npm install canvas@2.11.0 && npm install # TODO: canvas crashes if installed via npm install from package.json
