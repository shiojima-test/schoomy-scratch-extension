/**
 * スクーミー Scratch 共有サーバー v1.0
 * 班ごとの数値を預かって、集計画面に渡すだけの中継役です。
 *
 * 使い方
 *  1. script.google.com で新規プロジェクトを作り、このコードを貼り付ける
 *  2. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *  3. 次のとおり設定する
 *       実行するユーザー          ： 自分
 *       アクセスできるユーザー    ： 全員
 *  4. 発行された /exec で終わるURLを Scratch の
 *     「共有サーバーを〔　〕にする」ブロックに貼る
 *
 * 注意
 *  ・コードを直したら必ず「新しいデプロイ」をやり直してください。
 *    保存しただけではURLの中身は変わりません。
 *  ・URLを知っている人は誰でも書き込み・リセットができます。
 *    イベント担当者のみで扱ってください。
 */

var PROP_KEY = 'SCHOOMY_SHARE';

function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var mode = params.mode || 'get';
  var lock = LockService.getScriptLock();
  var out;

  try {
    lock.waitLock(10000);

    var props = PropertiesService.getScriptProperties();
    var data = {};
    var raw = props.getProperty(PROP_KEY);
    if (raw) {
      try { data = JSON.parse(raw); } catch (parseErr) { data = {}; }
    }

    if (mode === 'set') {
      var team = String(params.team || '').trim();
      var value = Number(params.value);
      if (team === '') {
        out = { ok: false, error: '班名が空です。' };
      } else if (isNaN(value)) {
        out = { ok: false, error: '値が数値ではありません。' };
      } else {
        data[team] = value;
        props.setProperty(PROP_KEY, JSON.stringify(data));
        out = { ok: true, data: data };
      }

    } else if (mode === 'reset') {
      data = {};
      props.setProperty(PROP_KEY, JSON.stringify(data));
      out = { ok: true, data: data };

    } else {
      out = { ok: true, data: data };
    }

  } catch (err) {
    out = { ok: false, error: String(err) };

  } finally {
    try { lock.releaseLock(); } catch (releaseErr) {}
  }

  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}
