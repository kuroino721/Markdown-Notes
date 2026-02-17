#!/bin/bash

# WSL Gateway IP を自動取得
GATEWAY_IP=$(ip route show | grep -i default | awk '{ print $3}')
CHROME_PATH="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"

if [ -z "$GATEWAY_IP" ]; then
    echo "Error: Gateway IP could not be detected."
    exit 1
fi

echo "Detected Gateway IP: $GATEWAY_IP"

echo "Starting Chrome with remote debugging..."
"$CHROME_PATH" --remote-debugging-port=9222 --no-first-run --no-default-browser-check &

echo "Starting socat bridge to $GATEWAY_IP:9222..."
# Kill existing socat if any
pkill socat 2>/dev/null
socat TCP-LISTEN:9222,fork,reuseaddr TCP:$GATEWAY_IP:9222 &

echo "Browser bridge is active."
echo "You can now use browser_subagent."
