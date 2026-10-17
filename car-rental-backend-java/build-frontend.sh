#!/bin/bash
set -e

echo "Building frontend..."

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing npm dependencies..."
  npm install
fi

# Build the frontend
echo "Running Vite build..."
npm run build

# Copy built files to Spring Boot static resources
echo "Copying build to Spring Boot resources..."
rm -rf src/main/resources/static/*
cp -r dist/* src/main/resources/static/

echo "Frontend build complete and copied to src/main/resources/static/"
