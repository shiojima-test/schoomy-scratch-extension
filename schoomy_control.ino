// schoomy_control.ino
// スクーミー ユニバーサル双方向制御ファームウェア
// オレンジボード（USB）・ブルーボード（BLE）両対応

// ── ピン定義 ──────────────────────────────
// オレンジボード
#define LED_PIN_A     2
#define BUZZER_PIN_A  9
#define SEG_DATA_A    10

// ブルーボード
#define LED_PIN_B     2
#define BUZZER_PIN_B  4
#define SEG_DATA_B    13

// ── 使用するピン（ボードに合わせて切り替え） ──
// デフォルトはオレンジボード。ブルーボードの場合は _B に変更。
static const int LED_PIN    = LED_PIN_A;
static const int BUZZER_PIN = BUZZER_PIN_A;
static const int SEG_DATA   = SEG_DATA_A;

// ── ダミーセンサー値（後でエンジニアが実センサーに差し替え） ──
static float val1 = 1.0;
static float val2 = 2.0;
static float val3 = 3.0;

// ── 7SEG簡易表示（1桁、共通カソード想定） ──
//   セグメント a-g を SEG_DATA ピンにシリアル出力する簡易実装。
//   実際のハードウェアに合わせて書き換えてください。
static const byte DIGITS[10] = {
  0b0111111, // 0
  0b0000110, // 1
  0b1011011, // 2
  0b1001111, // 3
  0b1100110, // 4
  0b1101101, // 5
  0b1111101, // 6
  0b0000111, // 7
  0b1111111, // 8
  0b1101111  // 9
};

void show7SEG(int num) {
  if (num < 0) num = 0;
  if (num > 9) num = num % 10; // 1桁のみ表示
  shiftOut(SEG_DATA, SEG_DATA, MSBFIRST, DIGITS[num]);
}

void clear7SEG() {
  shiftOut(SEG_DATA, SEG_DATA, MSBFIRST, 0b0000000);
}

void setup() {
  Serial.begin(115200);

  pinMode(LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(SEG_DATA, OUTPUT);

  digitalWrite(LED_PIN, LOW);
  noTone(BUZZER_PIN);
  clear7SEG();
}

void loop() {
  if (!Serial.available()) return;

  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  if (cmd.length() == 0) return;

  if (cmd == "LED_ON") {
    digitalWrite(LED_PIN, HIGH);
  }
  else if (cmd == "LED_OFF") {
    digitalWrite(LED_PIN, LOW);
  }
  else if (cmd == "BUZZER_ON") {
    tone(BUZZER_PIN, 1000);
  }
  else if (cmd == "BUZZER_OFF") {
    noTone(BUZZER_PIN);
  }
  else if (cmd.startsWith("NUM:")) {
    int num = cmd.substring(4).toInt();
    show7SEG(num);
  }
  else if (cmd == "CLR") {
    clear7SEG();
  }
  else if (cmd == "GET") {
    Serial.print(val1, 1);
    Serial.print(",");
    Serial.print(val2, 1);
    Serial.print(",");
    Serial.println(val3, 1);
  }
}
