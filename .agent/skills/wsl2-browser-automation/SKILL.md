---
name: wsl2-browser-automation
description: WSL2環境でAntigravityのブラウザ自動操作（browser_subagent）が「ECONNREFUSED」エラーで失敗する場合の解決方法。Windows側へのポートフォワーディング設定とWSL2側のsocatブリッジ設定を解説します。
---

# WSL2 Browser Automation Fix

## 症状

WSL2環境で `browser_subagent` を実行すると、以下のエラーが発生して失敗する。

```
failed to connect to browser via CDP: http://127.0.0.1:9222
CDP port not responsive in 5s: playwright: connect ECONNREFUSED 127.0.0.1:9222
```

## 原因

WSL2とWindowsホストのネットワーク分離により、WSL2上のプロセスがWindows側で起動しているChromeのデバッグポート（127.0.0.1:9222）に直接アクセスできないため。

## 解決策

### 1. Windows 側の設定 (管理者権限 PowerShell)

WSL2からのポート9222への通信をWindows側へ転送し、ファイアウォールを許可します。

```powershell
# WSLゲートウェイIPを確認
GATEWAY_IP=$(ip route show | grep -i default | awk '{ print $3}')
echo $GATEWAY_IP

# ポートプロキシの設定
netsh interface portproxy add v4tov4 listenport=9222 listenaddress=$GATEWAY_IP connectport=9222 connectaddress=127.0.0.1

# ファイアウォール許可設定
New-NetFirewallRule -DisplayName "Chrome Remote Debug" -Direction Inbound -LocalPort 9222 -Protocol TCP -Action Allow
```

### 2. WSL2 側の設定

`socat` をインストールし、WSL2内の `127.0.0.1:9222`
を Windows 側のゲートウェイ IP へブリッジします。

```bash
# socatのインストール
sudo apt-get install -y socat

# ブリッジの起動
socat TCP-LISTEN:9222,fork,reuseaddr TCP:$GATEWAY_IP:9222 &

# Chromeをデバッグモードで起動 (Windows側のパスを指定)
"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" --remote-debugging-port=9222 --no-first-run &
```

## 注意事項

- **セキュリティ**: ポート9222を外部に公開することになるため、信頼できないネットワーク環境（公共Wi-Fiなど）での使用は避けてください。
- **後片付け**: 作業終了後は `pkill socat`
  でブリッジを停止し、必要に応じて Windows 側の設定を削除することを推奨します。
  - 削除コマンド: `netsh interface portproxy delete v4tov4 listenport=9222 ...`
