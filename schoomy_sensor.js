(function() {
  const BlockType = Scratch.BlockType;
  const ArgumentType = Scratch.ArgumentType;

  const BLE_SERVICE_UUID = '6e400001-b5b3-f393-e0a9-e50e24dcca9e';
  const BLE_TX_UUID = '6e400003-b5b3-f393-e0a9-e50e24dcca9e';
  const BLE_RX_UUID = '6e400002-b5b3-f393-e0a9-e50e24dcca9e';

  class SchoomySensor {
    constructor(runtime) {
      this.runtime = runtime;
      this.stopFlag = false;
      this.sensorData = 0;
      this.isNewData = false;
      this.connected = false;
      this.port = null;
      this.writer = null;
      this.bleDevice = null;
      this.bleServer = null;
      this.bleTXChar = null;
      this.bleRXChar = null;
      this.bleConnected = false;
    }

    getInfo() {
      return {
        id: 'schoomysensor',
        name: 'スクーミー',
        color1: '#3AABA8',
        color2: '#2E8EC4',
        blocks: [
          { opcode: 'connectSerial', blockType: BlockType.COMMAND, text: 'オレンジボードに接続する（USB）' },
          { opcode: 'connectBLE', blockType: BlockType.COMMAND, text: 'ブルーボードにBLEで接続する' },
          { opcode: 'disconnectSerial', blockType: BlockType.COMMAND, text: 'ボードから切断する' },
          { opcode: 'onNewData', blockType: BlockType.HAT, text: 'スクーミーからデータを受信したとき' },
          { opcode: 'getSensorData', blockType: BlockType.REPORTER, text: 'センサーデータ' },
          { opcode: 'isConnected', blockType: BlockType.BOOLEAN, text: '接続中？' },
          {
            opcode: 'setDevice',
            blockType: BlockType.COMMAND,
            text: '[DEVICE] を [STATE] にする',
            arguments: {
              DEVICE: { type: ArgumentType.STRING, menu: 'deviceMenu', defaultValue: 'LED' },
              STATE:  { type: ArgumentType.STRING, menu: 'stateMenu', defaultValue: 'ON' }
            }
          },
          {
            opcode: 'show7seg',
            blockType: BlockType.COMMAND,
            text: '7SEGに [NUM] を表示する',
            arguments: {
              NUM: { type: ArgumentType.NUMBER, defaultValue: 0 }
            }
          },
          {
            opcode: 'requestData',
            blockType: BlockType.COMMAND,
            text: 'スクーミーに最新データをリクエストする'
          },
          {
            opcode: 'getCSVValue',
            blockType: BlockType.REPORTER,
            text: 'データ [DATA] の [INDEX] 番目の値',
            arguments: {
              DATA:  { type: ArgumentType.STRING, defaultValue: '1.0,2.0,3.0' },
              INDEX: { type: ArgumentType.NUMBER, defaultValue: 1 }
            }
          }
        ],
        menus: {
          deviceMenu: { acceptReporters: true, items: ['LED', 'BUZZER'] },
          stateMenu:  { acceptReporters: true, items: ['ON', 'OFF'] }
        }
      };
    }

    async connectSerial() {
      try {
        this.stopFlag = false;
        const serial = navigator.serial || (navigator.serial = window.serial);
        this.port = await serial.requestPort();
        await this.port.open({ baudRate: 9600, flowControl: 'hardware' });
        this.writer = this.port.writable.getWriter();
        this.connected = true;
        this._readLoop();
      } catch(e) {
        console.error('[スクーミー] USB接続エラー:', e);
        this.connected = false;
      }
    }

    async connectBLE() {
      try {
        this.bleDevice = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [BLE_SERVICE_UUID]
        });
        this.bleDevice.addEventListener('gattserverdisconnected', () => {
          this.bleConnected = false;
          this.bleRXChar = null;
          console.log('[スクーミー] BLE切断');
        });
        this.bleServer = await this.bleDevice.gatt.connect();
        const service = await this.bleServer.getPrimaryService(BLE_SERVICE_UUID);
        this.bleTXChar = await service.getCharacteristic(BLE_TX_UUID);
        this.bleRXChar = await service.getCharacteristic(BLE_RX_UUID);
        await this.bleTXChar.startNotifications();
        this.bleTXChar.addEventListener('characteristicvaluechanged', (event) => {
          const raw = new TextDecoder().decode(event.target.value);
          const lines = raw.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === '') continue;
            this._parseLine(trimmed);
          }
        });
        this.bleConnected = true;
        console.log('[スクーミー] BLE接続完了');
      } catch(e) {
        console.error('[スクーミー] BLE接続エラー:', e);
        this.bleConnected = false;
      }
    }

    async _readLoop() {
      const buff = [];
      let lastByte;
      while (this.port && this.port.readable && !this.stopFlag) {
        const reader = this.port.readable.getReader();
        try {
          while (!this.stopFlag) {
            const { value, done } = await reader.read();
            if (done) break;
            for (let i = 0; i < value.length; i++) {
              buff.push(value[i]);
              if (value[i] === 10 && lastByte === 13) {
                const raw = new TextDecoder('utf-8').decode(new Uint8Array(buff)).trim();
                buff.splice(0);
                this._parseLine(raw);
              }
              lastByte = value[i];
            }
          }
        } finally {
          reader.releaseLock();
        }
      }
      if (this.port) { await this.port.close(); }
      this.connected = false;
    }

    disconnectSerial() {
      this.stopFlag = true;
      if (this.writer) {
        this.writer.releaseLock();
        this.writer = null;
      }
      if (this.bleDevice && this.bleDevice.gatt.connected) {
        this.bleDevice.gatt.disconnect();
        this.bleConnected = false;
        this.bleRXChar = null;
      }
    }

    async _sendCmd(str) {
      const data = new TextEncoder().encode(str + '\n');
      if (this.writer) await this.writer.write(data);
      if (this.bleRXChar) await this.bleRXChar.writeValue(data);
    }

    _parseLine(line) {
      const num = parseFloat(line);
      if (isNaN(num)) return;
      this.sensorData = num;
      this.isNewData = true;
    }

    onNewData() { const t = this.isNewData; this.isNewData = false; return t; }
    getSensorData() { return this.sensorData; }
    isConnected() { return this.connected || this.bleConnected; }

    async setDevice(args) { await this._sendCmd(args.DEVICE + '_' + args.STATE); }
    async show7seg(args) { await this._sendCmd('NUM:' + args.NUM); }
    async requestData() { await this._sendCmd('GET'); }

    getCSVValue(args) {
      const parts = String(args.DATA).split(',');
      const i = Math.round(args.INDEX) - 1;
      return parts[i] !== undefined ? parseFloat(parts[i]) : 0;
    }
  }

  Scratch.extensions.register(new SchoomySensor());
})();
