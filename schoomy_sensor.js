(function() {
  const BlockType = Scratch.BlockType;

  class SchoomySensor {
    constructor(runtime) {
      this.runtime = runtime;
      this.stopFlag = false;
      this.sensorData = 0;
      this.isNewData = false;
      this.connected = false;
      this.port = null;
    }

    getInfo() {
      return {
        id: 'schoomysensor',
        name: '🌡 スクーミー',
        color1: '#3AABA8',
        color2: '#2E8EC4',
        blocks: [
          { opcode: 'connectSerial', blockType: BlockType.COMMAND, text: 'スクーミーボードに接続する' },
          { opcode: 'disconnectSerial', blockType: BlockType.COMMAND, text: 'スクーミーボードから切断する' },
          { opcode: 'onNewData', blockType: BlockType.HAT, text: 'スクーミーからデータを受信したとき' },
          { opcode: 'getSensorData', blockType: BlockType.REPORTER, text: 'センサーデータ' },
          { opcode: 'isConnected', blockType: BlockType.BOOLEAN, text: '接続中？' }
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
        console.error('[スクーミー] 接続エラー:', e);
        this.connected = false;
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
                const num = parseFloat(raw);
                if (!isNaN(num)) {
                  this.sensorData = Math.round(num * 10) / 10;
                  this.isNewData = true;
                }
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

    disconnectSerial() { this.stopFlag = true; }
    onNewData() { const t = this.isNewData; this.isNewData = false; return t; }
    getSensorData() { return this.sensorData; }
    isConnected() { return this.connected; }
  }

  Scratch.extensions.register(new SchoomySensor());
})();
