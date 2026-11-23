const rows = {
  en: ['Choose a destination', 'Available results', 'Tap a highlighted destination to move.', 'Stack'],
  ko: ['도착칸 선택', '사용할 윷 결과', '강조된 도착칸을 누르세요.', '업기'],
  id: ['Pilih tujuan', 'Hasil tersedia', 'Ketuk tujuan yang disorot untuk bergerak.', 'Gabung'],
  'pt-BR': ['Escolha o destino', 'Resultados disponíveis', 'Toque em um destino destacado para mover.', 'Agrupar'],
  'es-MX': ['Elige el destino', 'Resultados disponibles', 'Toca un destino resaltado para moverte.', 'Apilar'],
  th: ['เลือกช่องปลายทาง', 'ผลลัพธ์ที่ใช้ได้', 'แตะช่องปลายทางที่เน้นไว้เพื่อเดิน', 'ซ้อน'],
  vi: ['Chọn ô đích', 'Kết quả có thể dùng', 'Chạm vào ô đích được đánh dấu để di chuyển.', 'Chồng'],
  pl: ['Wybierz cel', 'Dostępne wyniki', 'Dotknij podświetlonego celu, aby wykonać ruch.', 'Połącz'],
  tr: ['Hedef seç', 'Kullanılabilir sonuçlar', 'İlerlemek için vurgulanan hedefe dokun.', 'Birleştir'],
  ms: ['Pilih petak tujuan', 'Keputusan tersedia', 'Ketik petak tujuan yang ditandakan untuk bergerak.', 'Gabung'],
  fr: ['Choisissez la destination', 'Résultats disponibles', 'Touchez une destination surlignée pour avancer.', 'Empiler'],
  de: ['Wähle ein Ziel', 'Verfügbare Ergebnisse', 'Tippe auf ein markiertes Ziel, um zu ziehen.', 'Stapeln'],
  es: ['Elige el destino', 'Resultados disponibles', 'Toca un destino resaltado para moverte.', 'Apilar'],
  it: ['Scegli la destinazione', 'Risultati disponibili', 'Tocca una destinazione evidenziata per muoverti.', 'Impila'],
  ja: ['移動先を選択', '使える結果', '光っている移動先をタップしてください。', '重ねる'],
  'zh-Hans': ['选择目标格', '可用结果', '点击高亮的目标格移动。', '叠加'],
  'zh-Hant': ['選擇目標格', '可用結果', '點擊亮起的目標格移動。', '疊加'],
};
const finishActions = {
  en: 'Finish', ko: '완주', id: 'Selesaikan', 'pt-BR': 'Concluir', 'es-MX': 'Terminar',
  th: 'เข้าเส้นชัย', vi: 'Về đích', pl: 'Ukończ', tr: 'Bitir', ms: 'Tamat', fr: 'Terminer',
  de: 'Ins Ziel', es: 'Terminar', it: 'Concludi', ja: 'ゴール', 'zh-Hans': '完成', 'zh-Hant': '完成',
};
export const MOVE_TEXTS = Object.fromEntries(Object.entries(rows).map(([language, [chooseDestination, pendingResults, moveHint, stackAction]]) => [language, { chooseDestination, pendingResults, moveHint, stackAction, finishAction: finishActions[language] }]));
