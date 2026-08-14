// schoomy_sensor_v2_0.js
// スクーミー Scratch 拡張機能 v2.0
// オレンジボード（USB / Web Serial 9600bps）受信専用 ＋ 班データ共有
// 2026-08-14

(function () {
  const VERSION = 'v2.0';
  const BlockType = Scratch.BlockType;
  const ArgumentType = Scratch.ArgumentType;

  const BAUD_RATE = 9600;

  class SchoomySensor {
    constructor(runtime) {
      this.runtime = runtime;

      // ── ボード受信 ──
      this.stopFlag = false;
      this.port = null;
      this.reader = null;
      this.connected = false;
      this.sensorData = 0;
      this.prevData = 0;
      this.isNewData = false;
      this.wasPressed = false;
      this.lastError = '';

      // ── 共有 ──
      this.serverUrl = '';
      this.teamName = '';
      this.shared = {};      // { 班名: 値 }
      this.sortedNames = [];
    }

    getInfo() {
      return {
        id: 'schoomysensor',
        name: 'スクーミー ' + VERSION,
        color1: '#3AABA8',
        color2: '#2E8EC4',
        blocks: [
          {
            opcode: 'connectSerial',
            blockType: BlockType.COMMAND,
            text: 'オレンジボードに接続する（USB）'
          },
          {
            opcode: 'disconnectSerial',
            blockType: BlockType.COMMAND,
            text: 'ボードから切断する'
          },
          {
            opcode: 'isConnected',
            blockType: BlockType.BOOLEAN,
            text: '接続中？'
          },
          '---',
          {
            opcode: 'onNewData',
            blockType: BlockType.HAT,
            text: 'スクーミーからデータを受信したとき'
          },
          {
            opcode: 'onPressed',
            blockType: BlockType.HAT,
            text: 'スイッチが押されたとき'
          },
          {
            opcode: 'getSensorData',
            blockType: BlockType.REPORTER,
            text: 'センサーデータ'
          },
          {
            opcode: 'getLastError',
            blockType: BlockType.REPORTER,
            text: 'エラー内容'
          },
          '---',
          {
            opcode: 'setServer',
            blockType: BlockType.COMMAND,
            text: '共有サーバーを [URL] にする',
            arguments: {
              URL: { type: ArgumentType.STRING, defaultValue: 'https://script.google.com/macros/s/.../exec' }
            }
          },
          {
            opcode: 'setTeam',
            blockType: BlockType.COMMAND,
            text: '班を [TEAM] にする',
            arguments: {
              TEAM: { type: ArgumentType.STRING, defaultValue: 'A' }
            }
          },
          {
            opcode: 'sendValue',
            blockType: BlockType.COMMAND,
            text: '自分の値 [VALUE] を送る',
            arguments: {
              VALUE: { type: ArgumentType.NUMBER, defaultValue: 0 }
            }
          },
          {
            opcode: 'fetchShared',
            blockType: BlockType.COMMAND,
            text: '共有データを取り込む'
          },
          '---',
          {
            opcode: 'teamCount',
            blockType: BlockType.REPORTER,
            text: '班の数'
          },
          {
            opcode: 'teamNameAt',
            blockType: BlockType.REPORTER,
            text: '[INDEX] 番目の班の名前',
            arguments: {
              INDEX: { type: ArgumentType.NUMBER, defaultValue: 1 }
            }
          },
          {
            opcode: 'teamValueAt',
            blockType: BlockType.REPORTER,
            text: '[INDEX] 番目の班の値',
            arguments: {
              INDEX: { type: ArgumentType.NUMBER, defaultValue: 1 }
            }
          },
          {
            opcode: 'teamValue',
            blockType: BlockType.REPORTER,
            text: '[TEAM] 班の値',
            arguments: {
              TEAM: { type: ArgumentType.STRING, defaultValue: 'A' }
            }
          },
          '---',
          {
            opcode: 'total',
            blockType: BlockType.REPORTER,
            text: '合計'
          },
          {
            opcode: 'average',
            blockType: BlockType.REPORTER,
            text: '平均'
          },
          {
            opcode: 'maxValue',
            blockType: BlockType.REPORTER,
            text: '最大'
          },
          {
            opcode: 'minValue',
            blockType: BlockType.REPORTER,
            text: '最小'
          },
          '---',
          {
            opcode: 'resetAll',
            blockType: BlockType.COMMAND,
            text: 'みんなの値をリセットする'
          }
        ]
      };
    }

    // ================================================================
    // ボード受信（オレンジボード / 9600bps / 1行1数値）
    // ================================================================

    async connectSerial() {
      try {
        this.lastError = '';

        if (!navigator.serial) {
          this.lastError = 'このブラウザはWeb Serialに未対応です。Chrome または Edge を使ってください。';
          console.error('[スクーミー] ' + this.lastError);
          return;
        }

        this.stopFlag = false;
        this.port = await navigator.serial.requestPort();
        await this.port.open({ baudRate: BAUD_RATE });
        this.connected = true;
        console.log('[スクーミー] 接続しました（' + BAUD_RATE + 'bps）');
        this._readLoop();
      } catch (e) {
        this.connected = false;
        this.lastError = String(e && e.message ? e.message : e);
        console.error('[スクーミー] 接続エラー:', e);
      }
    }

    async _readLoop() {
      try {
        const decoder = new TextDecoderStream();
        this.port.readable.pipeTo(decoder.writable).catch(() => {});
        const reader = decoder.readable.getReader();
        this.reader = reader;

        let buf = '';
        while (!this.stopFlag) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const line of lines) {
            this._parseLine(line);
          }
        }
      } catch (e) {
        this.lastError = String(e && e.message ? e.message : e);
        console.error('[スクーミー] 受信エラー:', e);
      } finally {
        this.connected = false;
      }
    }

    _parseLine(line) {
      const text = String(line).trim();
      if (text === '') return;
      const num = parseFloat(text);
      if (isNaN(num)) return;

      this.prevData = this.sensorData;
      this.sensorData = num;
      this.isNewData = true;

      // 立ち上がり検出：0 から 0以外に変わった瞬間だけ
      if (this.prevData < 0.5 && num >= 0.5) {
        this.wasPressed = true;
      }
    }

    async disconnectSerial() {
      this.stopFlag = true;
      try {
        if (this.reader) {
          await this.reader.cancel().catch(() => {});
          this.reader = null;
        }
        if (this.port) {
          await this.port.close().catch(() => {});
          this.port = null;
        }
      } catch (e) {
        console.error('[スクーミー] 切断エラー:', e);
      }
      this.connected = false;
      console.log('[スクーミー] 切断しました');
    }

    isConnected() { return this.connected; }
    getSensorData() { return this.sensorData; }
    getLastError() { return this.lastError; }

    onNewData() {
      const t = this.isNewData;
      this.isNewData = false;
      return t;
    }

    onPressed() {
      const t = this.wasPressed;
      this.wasPressed = false;
      return t;
    }

    // ================================================================
    // 共有（GAS Web App）
    // ================================================================

    setServer(args) {
      this.serverUrl = String(args.URL).trim();
    }

    setTeam(args) {
      this.teamName = String(args.TEAM).trim();
    }

    _buildUrl(params) {
      const qs = Object.keys(params)
        .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
        .join('&');
      return this.serverUrl + '?' + qs;
    }

    async _call(params) {
      if (this.serverUrl === '') {
        this.lastError = '共有サーバーが設定されていません。';
        return;
      }
      try {
        const res = await fetch(this._buildUrl(params));
        const json = await res.json();
        if (json && json.ok) {
          this._applyData(json.data || {});
          this.lastError = '';
        } else {
          this.lastError = (json && json.error) ? json.error : 'サーバーからエラーが返りました。';
        }
      } catch (e) {
        this.lastError = String(e && e.message ? e.message : e);
        console.error('[スクーミー] 通信エラー:', e);
      }
    }

    _applyData(data) {
      this.shared = data;
      this.sortedNames = Object.keys(data).sort((a, b) =>
        a.localeCompare(b, 'ja', { numeric: true })
      );
    }

    sendValue(args) {
      if (this.teamName === '') {
        this.lastError = '班が設定されていません。';
        return;
      }
      return this._call({ mode: 'set', team: this.teamName, value: args.VALUE });
    }

    fetchShared() {
      return this._call({ mode: 'get' });
    }

    resetAll() {
      return this._call({ mode: 'reset' });
    }

    // ── 集計 ──

    _values() {
      return this.sortedNames.map(n => Number(this.shared[n])).filter(v => !isNaN(v));
    }

    teamCount() { return this.sortedNames.length; }

    teamNameAt(args) {
      const i = Math.round(args.INDEX) - 1;
      return this.sortedNames[i] !== undefined ? this.sortedNames[i] : '';
    }

    teamValueAt(args) {
      const i = Math.round(args.INDEX) - 1;
      const name = this.sortedNames[i];
      return name !== undefined ? Number(this.shared[name]) : 0;
    }

    teamValue(args) {
      const name = String(args.TEAM).trim();
      return this.shared[name] !== undefined ? Number(this.shared[name]) : 0;
    }

    total() {
      return this._values().reduce((a, b) => a + b, 0);
    }

    average() {
      const v = this._values();
      if (v.length === 0) return 0;
      return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100;
    }

    maxValue() {
      const v = this._values();
      return v.length === 0 ? 0 : Math.max.apply(null, v);
    }

    minValue() {
      const v = this._values();
      return v.length === 0 ? 0 : Math.min.apply(null, v);
    }
  }

  Scratch.extensions.register(new SchoomySensor());
})();
