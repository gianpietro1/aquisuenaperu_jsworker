FROM node:alpine AS build
WORKDIR /app
COPY package.json ./
COPY package-lock.json ./
COPY ./ ./
RUN npm install

FROM gcr.io/distroless/nodejs:16
COPY --from=build /app /app
WORKDIR /app
CMD ["src/index.js"]
