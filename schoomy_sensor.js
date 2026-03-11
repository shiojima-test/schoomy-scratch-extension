(function() {
  const BlockType = Scratch.BlockType;
  const ArgumentType = Scratch.ArgumentType;

  class SchoomySensor {
    constructor(runtime) {
      this.runtime = runtime;
      this.stopFlag = false;
      this.temperature = 0;
      this.isNewData = false;
      this.connected = false;
    }

    getInfo() {
      return {
        id: 'schoomysensor',
        name: '🌡 スクーミー温度センサー',
        color1: '#3AABA8',
        color2: '#2E8EC4',
        blocks: [
          {
            opcode: 'connectSerial',
            blockType: BlockType.COMMAND,
            text: 'スクーミーボードに接続する'
          },
          {
            opcode: 'disconnectSerial',
            blockType: BlockType.COMMAND,
            text: 'スクーミーボードから切断する'
          },
          {
            opcode: 'onNewData',
            blockType: BlockType.HAT,
            text: '温度データを受信したとき'
          },
          {
            opcode: 'getTemperature',
            blockType: BlockType.REPORTER,
            text: '温度 (℃)'
          },
          {
            opcode: 'isConnected',
            blockType: BlockType.BOOLEAN,
            text: '接続中？'
          }
        ]
      };
    }

    async connectSerial() {
      try {
        this.stopFlag = false;
        const port = await navigator.serial.requestPort();
        await port.open({
          baudRate: 9600,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
          bufferSize: 255,
          flowControl: 'hardware'
        });

        this.connected = true;
        console.log('[スクーミー] 接続しました');

        while (port.readable && !this.stopFlag) {
          const reader = port.readable.getReader();
          try {
            const buff = [];
            let lastByte;

            while (!this.stopFlag) {
              const { value, done } = await reader.read();
              if (done) break;

              if (value) {
                for (let i = 0; i < value.length; i++) {
                  buff.push(value[i]);
                  if (value[i] === 10 && lastByte === 13) {
                    const raw = new TextDecoder('utf-8').decode(new Uint8Array(buff));
                    buff.splice(0);
                    const trimmed = raw.trim();
                    const num = parseFloat(trimmed);
                    if (!isNaN(num)) {
                      this.temperature = Math.round(num * 10) / 10;
                      this.isNewData = true;
                      console.log('[スクーミー] 温度: ' + this.temperature + '℃');
                    }
                  }
                  lastByte = value[i];
                }
              }
            }
          } catch (err) {
            console.error('[スクーミー] 受信エラー:', err);
          } finally {
            reader.releaseLock();
            await port.close();
            this.connected = false;
            console.log('[スクーミー] 切断しました');
          }
        }
      } catch (err) {
        this.connected = false;
        console.error('[スクーミー] 接続エラー:', err);
      }
    }

    disconnectSerial() {
      this.stopFlag = true;
      this.connected = false;
    }

    onNewData() {
      const triggered = this.isNewData;
      this.isNewData = false;
      return triggered;
    }

    getTemperature() {
      return this.temperature;
    }

    isConnected() {
      return this.connected;
    }
  }

  Scratch.extensions.register(new SchoomySensor());
})();
