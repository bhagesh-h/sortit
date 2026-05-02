# Use Node.js 20 (LTS) for better compatibility with Tailwind v4 native bindings
FROM node:20-bullseye AS builder

# Install build essentials for any native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Create and set the working directory
WORKDIR /app

# Copy package.json ONLY first to ensure we get fresh Linux-compatible native bindings
# (Ignoring package-lock.json prevents the "Cannot find native binding" error 
# caused by Windows-specific locks)
COPY package.json ./

# Install all dependencies
RUN npm install

# Copy the rest of the application source code
COPY . .

# Run the package script
RUN npm run package

# Use a minimal image to expose the binaries
FROM alpine:latest

# Set working directory
WORKDIR /output

# Copy the generated binaries from the builder stage
COPY --from=builder /app/bin /output/bin

# Default command to list the generated binaries
CMD ["ls", "-la", "/output/bin"]
