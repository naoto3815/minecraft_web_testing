# マインクラフト風プロトタイプ (Web版)

Three.js を使った、ブラウザで動くボクセルゲーム。
インストール不要・ブラウザ1つで動く。

## 起動方法

ターミナルで:

```bash
cd ~/Downloads/minecraft_web
python3 -m http.server 8000
```

ブラウザで http://localhost:8000/ を開く。サーバーを止めるときはターミナルで Ctrl+C。

## 操作

| キー | 動作 |
|---|---|
| W / A / S / D | 移動 |
| Space | ジャンプ |
| マウス | 視点 |
| 左クリック | ブロック破壊 |
| 右クリック | ブロック設置 |
| 1〜4 | 設置するブロック種類の切替（草・土・石・砂） |
| Esc | 一時停止（マウスロック解除） |

## ファイル構成

- `index.html` — HTML / CSS / JavaScript がすべて入った1ファイル
  - **HTML部分** (`<body>`): 画面のHUD要素（操作説明、ブロック表示、照準、開始ボタン）
  - **CSS部分** (`<style>`): HUDの見た目（位置・色・フォント）
  - **JavaScript部分** (`<script type="module">`): Three.jsを使った3D描画とゲームロジック

## コードの全体像

JavaScript部分は以下のセクションに分かれている:

1. **ブロック種類** — 設置できるブロックを配列で定義
2. **シーン・カメラ・レンダラ** — Three.jsで3D描画する3つの基本要素
3. **ライト** — 環境光と太陽光
4. **ブロック管理** — `Map` でブロックを座標キーで管理する仕組み
5. **地形生成** — 正弦波を重ねた疑似ノイズで起伏のある地形
6. **一人称コントロール** — `PointerLockControls` でマウス視点
7. **移動入力** — キーボード入力の状態管理 + 重力 + ジャンプ
8. **クリック処理** — `Raycaster` で「照準が指してるブロック」を判定
9. **ゲームループ** — `requestAnimationFrame` で毎フレーム描画

## 学習ロードマップ

### Phase 1: 動かして遊ぶ（今日）
ブロックを置いたり壊したりして感触を掴む。

### Phase 2: コードを読む（1〜3日）
`index.html` を上から順に読む。分からない単語は調べる:

- `THREE.Scene` / `Camera` / `Renderer` — 3D描画の3つの基本要素
- `PointerLockControls` — マウスでの一人称視点
- `Raycaster` — 「画面のあの位置にあるオブジェクト」を判定する仕組み
- `requestAnimationFrame` — ブラウザのゲームループ

数値を変えて遊ぶ:
- `GROUND = 24` → `48` にしてワールドを4倍広く
- `JUMP = 8.5` → `15` でスーパージャンプ
- `SPEED = 5` → `15` で爆速移動
- `scene.background = new THREE.Color(0x87CEEB)` の色を `0x000033` にして夜空風に

### Phase 3: 機能を足す（1〜2週間）
- ブロックの種類を増やす（`blockTypes` に1行追加）
- BGM を流す: `new Audio('bgm.mp3').play()`
- 効果音: クリック時に「コツン」と鳴らす
- 木を生やす: 地形生成のループ内で確率的に縦5マスの木ブロックを置く
- セーブ機能: ブロックの座標を `localStorage.setItem('world', JSON.stringify(...))` で保存
- インベントリ UI: 画面下にスロットアイコンを並べる

### Phase 4: 本格化（1ヶ月〜）
- もっと大きなワールド（チャンク分割で必要部分だけ描画）
- 本格的なパーリンノイズで自然な地形
- `THREE.InstancedMesh` で大量のブロックを高速描画
- 簡単な敵 Mob（追ってくる立方体）
- マルチプレイ（WebSocket）

## 困ったとき

- **ページが真っ白** → ブラウザのDevTools (Cmd+Opt+I) を開いて「Console」タブのエラーを確認
- **マウスがロックされない** → 必ず最初に「クリックして開始」を押す
- **動きが重い** → ブロック数が多すぎる可能性。`GROUND` を小さくする
- **`localhost:8000` に繋がらない** → `python3 -m http.server 8000` が動いてるか確認
- **コードを変えても反映されない** → ブラウザを強制リロード（Cmd+Shift+R）

## 参考リンク

- Three.js 公式: https://threejs.org/
- Three.js Examples（コピペで動くサンプル集）: https://threejs.org/examples/
- MDN JavaScript リファレンス: https://developer.mozilla.org/ja/docs/Web/JavaScript
