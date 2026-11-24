const keys=['yeopjeon','duelWin','duelLoss','walletUnavailable','coinNotEnough','coinsChange','walletSettling'];
const rows={
  en:['Yeopjeon','Win +8','Loss −10','Balance unavailable. Tap to retry.','Not enough yeopjeon to start a duel.','{n} yeopjeon','Updating balance…'],
  ko:['엽전','승리 +8','패배 −10','잔액을 불러오지 못했습니다. 눌러서 다시 확인하세요.','엽전이 부족해 대전을 시작할 수 없습니다.','{n} 엽전','엽전 정산 중…'],
  id:['Yeopjeon','Menang +8','Kalah −10','Saldo tidak tersedia. Ketuk untuk mencoba lagi.','Yeopjeon tidak cukup untuk memulai duel.','{n} yeopjeon','Memperbarui saldo…'],
  'pt-BR':['Yeopjeon','Vitória +8','Derrota −10','Saldo indisponível. Toque para tentar novamente.','Yeopjeon insuficiente para iniciar um duelo.','{n} yeopjeon','Atualizando saldo…'],
  'es-MX':['Yeopjeon','Victoria +8','Derrota −10','Saldo no disponible. Toca para reintentar.','No tienes suficientes yeopjeon para iniciar un duelo.','{n} yeopjeon','Actualizando saldo…'],
  th:['ยอปจอน','ชนะ +8','แพ้ −10','โหลดคงเหลือไม่ได้ แตะเพื่อลองอีกครั้ง','ยอปจอนไม่พอเริ่มการดวล','{n} ยอปจอน','กำลังอัปเดตยอด…'],
  vi:['Yeopjeon','Thắng +8','Thua −10','Không tải được số dư. Chạm để thử lại.','Không đủ yeopjeon để bắt đầu đấu.','{n} yeopjeon','Đang cập nhật số dư…'],
  pl:['Yeopjeon','Wygrana +8','Porażka −10','Saldo niedostępne. Dotknij, aby ponowić.','Za mało yeopjeon, aby rozpocząć pojedynek.','{n} yeopjeon','Aktualizowanie salda…'],
  tr:['Yeopjeon','Galibiyet +8','Yenilgi −10','Bakiye yüklenemedi. Tekrar denemek için dokun.','Düelloya başlamak için yeterli yeopjeon yok.','{n} yeopjeon','Bakiye güncelleniyor…'],
  ms:['Yeopjeon','Menang +8','Kalah −10','Baki tidak tersedia. Ketik untuk cuba lagi.','Yeopjeon tidak cukup untuk memulakan duel.','{n} yeopjeon','Mengemas kini baki…'],
  fr:['Yeopjeon','Victoire +8','Défaite −10','Solde indisponible. Touchez pour réessayer.','Pas assez de yeopjeon pour commencer un duel.','{n} yeopjeon','Mise à jour du solde…'],
  de:['Yeopjeon','Sieg +8','Niederlage −10','Guthaben nicht verfügbar. Zum Wiederholen antippen.','Nicht genug Yeopjeon, um ein Duell zu starten.','{n} Yeopjeon','Guthaben wird aktualisiert…'],
  es:['Yeopjeon','Victoria +8','Derrota −10','Saldo no disponible. Toca para reintentar.','No tienes suficientes yeopjeon para iniciar un duelo.','{n} yeopjeon','Actualizando saldo…'],
  it:['Yeopjeon','Vittoria +8','Sconfitta −10','Saldo non disponibile. Tocca per riprovare.','Yeopjeon insufficienti per iniziare un duello.','{n} yeopjeon','Aggiornamento saldo…'],
  ja:['葉銭','勝利 +8','敗北 −10','残高を取得できません。タップして再試行してください。','葉銭が不足しているため対戦を始められません。','{n} 葉銭','残高を更新中…'],
  'zh-Hans':['铜钱','获胜 +8','落败 −10','无法加载余额。点击重试。','铜钱不足，无法开始对战。','{n} 铜钱','正在结算铜钱…'],
  'zh-Hant':['銅錢','獲勝 +8','落敗 −10','無法載入餘額。點擊重試。','銅錢不足，無法開始對戰。','{n} 銅錢','正在結算銅錢…']
};
export const ECONOMY_TEXTS=Object.fromEntries(Object.entries(rows).map(([lang,values])=>[lang,Object.fromEntries(keys.map((key,i)=>[key,values[i]]))]));
