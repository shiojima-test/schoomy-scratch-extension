(function() {
  const BlockType = Scratch.BlockType;

  const BLE_SERVICE_UUID = '6e400001-b5b3-f393-e0a9-e50e24dcca9e';
  const BLE_TX_UUID = '6e400003-b5b3-f393-e0a9-e50e24dcca9e';

  class SchoomySensor {
    constructor(runtime) {
      this.runtime = runtime;
      this.stopFlag = false;
      this.sensorData = 0;
      this.isNewData = false;
      this.connected = false;
      this.port = null;
      this.bleDevice = null;
      this.bleServer = null;
      this.bleTXChar = null;
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
          { opcode: 'getTemp', blockType: BlockType.REPORTER, text: '温度 (℃)' },
          { opcode: 'getAX', blockType: BlockType.REPORTER, text: '加速度 X' },
          { opcode: 'getAY', blockType: BlockType.REPORTER, text: '加速度 Y' },
          { opcode: 'getAZ', blockType: BlockType.REPORTER, text: '加速度 Z' },
          { opcode: 'getAbs', blockType: BlockType.REPORTER, text: '合成加速度' },
          { opcode: 'getGX', blockType: BlockType.REPORTER, text: 'ジャイロ X' },
          { opcode: 'getGY', blockType: BlockType.REPORTER, text: 'ジャイロ Y' },
          { opcode: 'getGZ', blockType: BlockType.REPORTER, text: 'ジャイロ Z' },
          { opcode: 'getD33', blockType: BlockType.REPORTER, text: 'デジタル値' },
          { opcode: 'getA5', blockType: BlockType.REPORTER, text: 'アナログ値' },
          { opcode: 'getDist', blockType: BlockType.REPORTER, text: '距離 (cm)' }
        ]
      };
    }

    async connectSerial() {
      try {
        this.stopFlag = false;
        const serial = navigator.serial || (navigator.serial = window.serial);
        this.port = await serial.requestPort();
        await this.port.open({ baudRate: 9600, flowControl: 'hardware' });
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
          console.log('[スクーミー] BLE切断');
        });
        this.bleServer = await this.bleDevice.gatt.connect();
        const service = await this.bleServer.getPrimaryService(BLE_SERVICE_UUID);
        this.bleTXChar = await service.getCharacteristic(BLE_TX_UUID);
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
      if (this.bleDevice && this.bleDevice.gatt.connected) {
        this.bleDevice.gatt.disconnect();
        this.bleConnected = false;
      }
    }
    _parseLine(line) {
      const parts = line.split(',');
      if (parts.length >= 11) {
        this.val_ax   = parseFloat(parts[0]);
        this.val_ay   = parseFloat(parts[1]);
        this.val_az   = parseFloat(parts[2]);
        this.val_gx   = parseFloat(parts[3]);
        this.val_gy   = parseFloat(parts[4]);
        this.val_gz   = parseFloat(parts[5]);
        this.val_temp = parseFloat(parts[6]);
        this.val_abs  = parseFloat(parts[7]);
        this.val_d33  = parseFloat(parts[8]);
        this.val_a5   = parseFloat(parts[9]);
        this.val_dist = parseFloat(parts[10]);
        this.sensorData = this.val_temp;
      } else {
        const num = parseFloat(line);
        if (isNaN(num)) return;
        this.val_temp = num;
        this.sensorData = num;
      }
      this.isNewData = true;
    }

    onNewData() { const t = this.isNewData; this.isNewData = false; return t; }
    getSensorData() { return this.sensorData; }
    isConnected() { return this.connected || this.bleConnected; }

    getTemp()  { return this.val_temp ?? 0; }
    getAX()    { return this.val_ax   ?? 0; }
    getAY()    { return this.val_ay   ?? 0; }
    getAZ()    { return this.val_az   ?? 0; }
    getAbs()   { return this.val_abs  ?? 0; }
    getGX()    { return this.val_gx   ?? 0; }
    getGY()    { return this.val_gy   ?? 0; }
    getGZ()    { return this.val_gz   ?? 0; }
    getD33()   { return this.val_d33  ?? 0; }
    getA5()    { return this.val_a5   ?? 0; }
    getDist()  { return this.val_dist ?? 0; }
  }

  Scratch.extensions.register(new SchoomySensor());
})();
