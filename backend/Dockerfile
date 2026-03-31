FROM node:20-bullseye-slim

WORKDIR /app

# Copy ALL source first — ensures cache is invalidated on any code change
COPY . .

# Install dependencies
RUN npm install

# Build TypeScript
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/index.js"]
