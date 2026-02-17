---
name: tauri-state-race-condition
description:
  Tauri
  コマンドにおける並行処理（競合状態）の解決方法。多数のコマンドが同時または連続して実行される際に、共有状態の不整合やデータの消失を防ぐための
  Mutex を用いた実装パターンを提供します。
---

# Tauri State Management & Race Condition Fix

## 症状

- 「新規作成」ボタンを連打すると、作成されたはずのデータが一部消える。
- 複数のウィンドウで同時に保存を行うと、片方の変更がもう片方で上書きされてしまう。
- バックエンドのログに、ほぼ同時刻に同じファイルを読み書きしている形跡がある。

## 原因

Tauri コマンド（`#[tauri::command]`）は並列で実行されるため、各コマンド内で「ファイルの読み込み -> メモリ上での変更 -> ファイルの保存」という一連の操作を排他制御なしに行うと、典型的な
**Race Condition（競合状態）** が発生します。

### 競合の例

1. コマンドAがファイルを読む (データ数: 0)
2. コマンドBがファイルを読む (データ数: 0)
3. コマンドAがノートAを追加して保存 (ファイル内容: [A])
4. コマンドBがノートBを追加して保存 (ファイル内容: [B]) -> **ノートAが消える**

## 解決策

Tauri の `tauri::State` と Rust の `std::sync::Mutex`
を組み合わせて、メモリ上でスレッドセーフな共有状態を保持します。

### 実装パターン

#### 1. 状態の定義 (`lib.rs` など)

```rust
use std::sync::Mutex;
pub struct AppState(pub Mutex<MyStore>);
```

#### 2. セットアップ (`main.rs` または `lib.rs`)

```rust
fn run() {
    let store = MyStore::load(); // 初期ロード
    tauri::Builder::default()
        .manage(AppState(Mutex::new(store))) // 状態を登録
        // ...
}
```

#### 3. コマンドでの利用

```rust
#[tauri::command]
fn save_data(app: tauri::AppHandle, state: tauri::State<'_, AppState>) -> Result<(), String> {
    // ロックを取得。MutexGuard がスコープを抜けるまで排他制御される。
    let mut store = state.0.lock().map_err(|e| e.to_string())?;

    // メモリ上のデータを更新
    store.update(new_data);

    // 同時にディスクへ永続化（ロックを保持したまま行うのが安全）
    store.save(&app)?;

    Ok(())
}
```

## 注意事項

- **ロックの範囲**: `Mutex`
  のロックを保持したまま重い I/O やネットワーク通信を行うと、他のコマンドがすべて待機状態になりパフォーマンスが低下します。ただし、一貫性が最優先されるファイル保存などの場合は、ロック内で完結させるのが最も安全です。
- **デッドロック**: `Mutex`
  を取得した状態で、さらに別のロックを取得しようとするとデッドロックの危険があります。ロックの取得順序には注意してください。
