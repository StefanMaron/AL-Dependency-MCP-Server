#!/bin/bash

# Test script to verify environment variables are working
export NODE_ENV=production
export REPO_TYPE=bc-history-sandbox
export REPO_URL=https://github.com/StefanMaron/MSDyn365BC.Sandbox.Code.History.git
export DEFAULT_BRANCH=w1-26
export CLONE_DEPTH=1
export AUTO_CLEANUP=true
export CLEANUP_INTERVAL=24h
export MAX_BRANCHES=10
export LOG_LEVEL=info

echo "Environment variables set:"
echo "DEFAULT_BRANCH=$DEFAULT_BRANCH"
echo "REPO_TYPE=$REPO_TYPE"
echo "REPO_URL=$REPO_URL"

# Build and run the server
npm run build
node dist/server.js
