FROM node:20-alpine
WORKDIR /app
COPY . .
ENV HOST=0.0.0.0 PORT=3434 DATA_DIR=/data TRUST_PROXY=1
EXPOSE 3434
CMD ["node","server.js"]
