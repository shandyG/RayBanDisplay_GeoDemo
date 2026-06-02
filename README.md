# Ray-Ban Display Marker Demo

新桜ケ丘第二公園 `35.448977, 139.564211` を中心に、GPS + 方位センサーで周辺マーカーをHUD風に表示する静的Webアプリです。GitHub Pagesで公開して、Meta AIアプリの Web apps にURLを追加する想定です。

## 使い方

1. このフォルダの中身をGitHubリポジトリに置く
2. GitHub Pagesを有効化する
3. `https://<username>.github.io/<repo>/` を開く
4. スマホでは「センサー許可」を押す
5. 実地でGPSを許可するか、「デモ位置」で公園中心に固定して確認する

## 操作

- ← / →: マーカー切り替え
- Enter / Space: 詳細表示
- Esc: 閉じる
- 画面下ボタン: タッチ検証用

## Neural Band接続ポイント

`app.js` の `setupInput()` 内で以下のCustomEventを受けています。

```js
window.dispatchEvent(new CustomEvent('neuralbandgesture', {
  detail: { gesture: 'select' } // left / right / select / back
}));
```

Meta Web Apps側のNeural Bandイベント名が確定したら、このアダプタ部分だけ差し替えれば、本体ロジックはそのまま使えます。

## 注意

このMVPはGPSと方位から2D HUDに投影する「AR風」表示です。SLAM/VPSによる空間固定ARではありません。公園内設備や周辺施設の緯度経度はデモ用の近似値を含みます。現地検証時に `markers.js` を微調整してください。
