FROM node:18-slim

# Install PDFtk (The engine that adds passwords)
RUN apt-get update && \
    apt-get install -y pdftk && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Node dependencies
COPY package*.json ./
RUN npm install

# Copy app source
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
