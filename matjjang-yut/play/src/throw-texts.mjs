const keys = ['throwSettings', 'throwGather', 'throwLanding', 'throwLandingNote', 'throwHeight', 'throwHeightNote', 'throwDistance', 'throwDistanceNote', 'throwSpacing', 'throwSpacingNote', 'throwMinimum', 'throwMaximum', 'throwTime', 'throwSeconds', 'throwPercent'];
const rows = {
  en: 'Yut throw settings|Gathering time|Time to land|From release to first contact|Throw height|Relative to board length|Forward distance|Relative to board length|Horizontal spacing|Between sticks · board width|Minimum|Maximum|Time|{n} s|{n}%',
  ko: '윷 던지기 설정|모으는 시간|착지 시간|던진 뒤 첫 접촉까지|던지는 높이|판 길이 기준|던지는 거리|앞뒤 · 판 길이 기준|좌우 간격|윷 사이 · 판 너비 기준|최소|최대|시간|{n}초|{n}%',
  id: 'Pengaturan lemparan|Waktu mengumpulkan|Waktu mendarat|Dari lepas hingga menyentuh papan|Tinggi lemparan|Relatif terhadap panjang papan|Jarak ke depan|Relatif terhadap panjang papan|Jarak menyamping|Antarstik · lebar papan|Minimum|Maksimum|Waktu|{n} dtk|{n}%',
  'pt-BR': 'Configuração do lançamento|Tempo para juntar|Tempo até pousar|Da soltura ao primeiro contato|Altura do lançamento|Em relação ao comprimento do tabuleiro|Distância à frente|Em relação ao comprimento do tabuleiro|Espaçamento lateral|Entre varetas · largura do tabuleiro|Mínimo|Máximo|Tempo|{n} s|{n}%',
  'es-MX': 'Ajustes del lanzamiento|Tiempo para juntar|Tiempo hasta caer|Desde soltar hasta el primer contacto|Altura del lanzamiento|Respecto al largo del tablero|Distancia hacia delante|Respecto al largo del tablero|Separación lateral|Entre palos · ancho del tablero|Mínimo|Máximo|Tiempo|{n} s|{n}%',
  th: 'ตั้งค่าการโยนไม้|เวลารวบรวมไม้|เวลาจนไม้ตก|ตั้งแต่ปล่อยจนสัมผัสกระดานครั้งแรก|ความสูงในการโยน|เทียบกับความยาวกระดาน|ระยะไปข้างหน้า|เทียบกับความยาวกระดาน|ระยะห่างแนวนอน|ระหว่างไม้ · ความกว้างกระดาน|ต่ำสุด|สูงสุด|เวลา|{n} วินาที|{n}%',
  vi: 'Cài đặt tung que|Thời gian gom que|Thời gian tiếp đất|Từ lúc thả đến lần chạm đầu tiên|Độ cao tung|So với chiều dài bàn|Khoảng cách phía trước|So với chiều dài bàn|Khoảng cách ngang|Giữa các que · chiều rộng bàn|Tối thiểu|Tối đa|Thời gian|{n} giây|{n}%',
  pl: 'Ustawienia rzutu|Czas zbierania|Czas do lądowania|Od wypuszczenia do pierwszego kontaktu|Wysokość rzutu|Względem długości planszy|Odległość do przodu|Względem długości planszy|Odstęp poziomy|Między patyczkami · szerokość planszy|Minimum|Maksimum|Czas|{n} s|{n}%',
  tr: 'Atış ayarları|Toplama süresi|Yere inme süresi|Bırakmadan ilk temasa kadar|Atış yüksekliği|Tahta uzunluğuna göre|İleri mesafe|Tahta uzunluğuna göre|Yatay aralık|Çubuklar arası · tahta genişliği|En az|En çok|Süre|{n} sn|{n}%',
  ms: 'Tetapan balingan|Masa mengumpul|Masa mendarat|Dari dilepaskan hingga sentuhan pertama|Ketinggian balingan|Berbanding panjang papan|Jarak ke hadapan|Berbanding panjang papan|Jarak mendatar|Antara kayu · lebar papan|Minimum|Maksimum|Masa|{n} saat|{n}%',
  fr: 'Réglages du lancer|Temps de regroupement|Temps avant de toucher le plateau|Du lâcher au premier contact|Hauteur du lancer|Par rapport à la longueur du plateau|Distance vers l’avant|Par rapport à la longueur du plateau|Écart horizontal|Entre bâtons · largeur du plateau|Minimum|Maximum|Durée|{n} s|{n}%',
  de: 'Wurfeinstellungen|Zeit zum Sammeln|Zeit bis zur Landung|Vom Loslassen bis zum ersten Kontakt|Wurfhöhe|Relativ zur Brettlänge|Abstand nach vorn|Relativ zur Brettlänge|Seitlicher Abstand|Zwischen Stäbchen · Brettbreite|Minimum|Maximum|Zeit|{n} s|{n}%',
  es: 'Ajustes del lanzamiento|Tiempo para juntar|Tiempo hasta caer|Desde soltar hasta el primer contacto|Altura del lanzamiento|Respecto al largo del tablero|Distancia hacia delante|Respecto al largo del tablero|Separación lateral|Entre palos · ancho del tablero|Mínimo|Máximo|Tiempo|{n} s|{n}%',
  it: 'Impostazioni del lancio|Tempo di raccolta|Tempo di atterraggio|Dal rilascio al primo contatto|Altezza del lancio|Rispetto alla lunghezza del tabellone|Distanza in avanti|Rispetto alla lunghezza del tabellone|Spaziatura laterale|Tra i bastoncini · larghezza del tabellone|Minimo|Massimo|Tempo|{n} s|{n}%',
  ja: 'ユッの投げ方設定|集める時間|着地までの時間|投げてから最初に触れるまで|投げる高さ|盤の長さを基準|前方への距離|盤の長さを基準|左右の間隔|ユッの間 · 盤の幅を基準|最小|最大|時間|{n}秒|{n}%',
  'zh-Hans': '掷柶设置|收拢时间|落地时间|从抛出到首次接触棋盘|抛掷高度|以棋盘长度为基准|向前距离|以棋盘长度为基准|左右间距|柶子之间 · 以棋盘宽度为基准|最小|最大|时间|{n}秒|{n}%',
  'zh-Hant': '擲柶設定|收攏時間|落地時間|從拋出到首次接觸棋盤|拋擲高度|以棋盤長度為基準|向前距離|以棋盤長度為基準|左右間距|柶子之間 · 以棋盤寬度為基準|最小|最大|時間|{n}秒|{n}%',
};
export const THROW_TEXTS = Object.fromEntries(Object.entries(rows).map(([language, row]) => {
  const values = row.split('|');
  if (values.length !== keys.length) throw new Error(`Throw translation columns: ${language}`);
  return [language, Object.fromEntries(keys.map((key, i) => [key, values[i]]))];
}));
