FROM beevelop/nodejs
WORKDIR /app
COPY package.json ./
COPY package-lock.json ./
COPY ./ ./
RUN npm i
CMD ["node", "src/index.js"]
