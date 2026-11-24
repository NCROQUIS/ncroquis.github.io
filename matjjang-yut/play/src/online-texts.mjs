const keys=['onlineMode','matchingTitle','matchingWait','matchingBotHint','opponentTurn','connecting','reconnecting','onlineError','retry','botLabel','draw','onlineQuitDetail','accountId','copyId','copied','copySelect','accountLoading','accountError','guestName','onlineUnavailable'];
const rows={
 en:['Online · 1vs1','Find an opponent','Looking for an opponent…','If no player joins within 8 seconds, you will face a bot.','Your opponent is playing.','Connecting…','Reconnecting…','Connection interrupted. Please try again.','Retry','Bot match','Draw','Leaving an online game in progress may count as a loss.','User ID','Copy','Copied.','Select and copy the ID.','Loading your account…','Could not load your account. Please try again.','Guest #{code}','Online play is unavailable. Please try again later.'],
 ko:['온라인 · 1vs1','상대 찾기','상대를 찾고 있어요…','8초 안에 상대가 없으면 봇과 매칭돼요.','상대방의 차례예요.','연결 중…','다시 연결 중…','연결을 확인하고 다시 시도해 주세요.','다시 시도','봇 대전','무승부','진행 중인 온라인 대국에서 나가면 기권패로 처리될 수 있어요.','유저 ID','복사','복사했어요.','ID를 선택해서 복사해 주세요.','계정을 불러오는 중…','계정을 불러오지 못했어요. 다시 시도해 주세요.','게스트 #{code}','지금은 온라인 대전에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.'],
 id:['Daring · 1vs1','Cari lawan','Mencari lawan…','Jika tidak ada pemain dalam 8 detik, Anda akan melawan bot.','Giliran lawan.','Menghubungkan…','Menghubungkan ulang…','Periksa koneksi lalu coba lagi.','Coba lagi','Lawan bot','Seri','Keluar saat permainan daring berlangsung dapat dihitung sebagai kekalahan.','ID pengguna','Salin','Disalin.','Pilih dan salin ID.','Memuat akun…','Akun tidak dapat dimuat. Coba lagi.','Tamu #{code}','Permainan daring belum tersedia. Coba lagi nanti.'],
 'pt-BR':['Online · 1vs1','Encontrar adversário','Buscando adversário…','Sem jogadores em 8 segundos, você enfrentará um bot.','É a vez do adversário.','Conectando…','Reconectando…','Verifique a conexão e tente de novo.','Tentar de novo','Contra bot','Empate','Sair de uma partida online em andamento pode contar como derrota.','ID do usuário','Copiar','Copiado.','Selecione e copie o ID.','Carregando conta…','Não foi possível carregar a conta. Tente de novo.','Visitante #{code}','O modo online está indisponível. Tente mais tarde.'],
 'es-MX':['En línea · 1vs1','Buscar rival','Buscando rival…','Si no hay jugadores en 8 segundos, jugarás contra un bot.','Es el turno de tu rival.','Conectando…','Reconectando…','Revisa la conexión e inténtalo de nuevo.','Reintentar','Contra bot','Empate','Salir de una partida en línea en curso puede contar como derrota.','ID de usuario','Copiar','Copiado.','Selecciona y copia el ID.','Cargando cuenta…','No se pudo cargar la cuenta. Reintenta.','Invitado #{code}','El modo en línea no está disponible. Inténtalo más tarde.'],
 th:['ออนไลน์ · 1vs1','ค้นหาคู่แข่ง','กำลังค้นหาคู่แข่ง…','หากไม่มีผู้เล่นใน 8 วินาที คุณจะเล่นกับบอต','ตาของคู่แข่ง','กำลังเชื่อมต่อ…','กำลังเชื่อมต่อใหม่…','ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง','ลองอีกครั้ง','แข่งกับบอต','เสมอ','การออกจากเกมออนไลน์ระหว่างเล่นอาจนับเป็นการแพ้','ID ผู้ใช้','คัดลอก','คัดลอกแล้ว','เลือกและคัดลอก ID','กำลังโหลดบัญชี…','โหลดบัญชีไม่ได้ โปรดลองอีกครั้ง','ผู้เยี่ยมชม #{code}','ยังเล่นออนไลน์ไม่ได้ โปรดลองอีกครั้งภายหลัง'],
 vi:['Trực tuyến · 1vs1','Tìm đối thủ','Đang tìm đối thủ…','Nếu không có người chơi trong 8 giây, bạn sẽ đấu với bot.','Đến lượt đối thủ.','Đang kết nối…','Đang kết nối lại…','Kiểm tra kết nối rồi thử lại.','Thử lại','Đấu với bot','Hòa','Thoát ván trực tuyến đang diễn ra có thể bị tính thua.','ID người dùng','Sao chép','Đã sao chép.','Chọn và sao chép ID.','Đang tải tài khoản…','Không tải được tài khoản. Hãy thử lại.','Khách #{code}','Chưa thể chơi trực tuyến. Hãy thử lại sau.'],
 pl:['Online · 1vs1','Znajdź rywala','Szukanie rywala…','Jeśli nikt nie dołączy w 8 sekund, zagrasz z botem.','Tura przeciwnika.','Łączenie…','Ponowne łączenie…','Sprawdź połączenie i spróbuj ponownie.','Ponów','Gra z botem','Remis','Wyjście z trwającej gry online może oznaczać przegraną.','ID użytkownika','Kopiuj','Skopiowano.','Zaznacz i skopiuj ID.','Wczytywanie konta…','Nie udało się wczytać konta. Spróbuj ponownie.','Gość #{code}','Gra online jest niedostępna. Spróbuj później.'],
 tr:['Çevrimiçi · 1vs1','Rakip bul','Rakip aranıyor…','8 saniyede oyuncu bulunamazsa bir botla oynarsın.','Rakibin oynuyor.','Bağlanıyor…','Yeniden bağlanıyor…','Bağlantıyı kontrol edip yeniden dene.','Yeniden dene','Bot maçı','Berabere','Devam eden çevrimiçi oyundan çıkmak yenilgi sayılabilir.','Kullanıcı ID','Kopyala','Kopyalandı.','ID seçip kopyala.','Hesap yükleniyor…','Hesap yüklenemedi. Yeniden dene.','Misafir #{code}','Çevrimiçi oyun kullanılamıyor. Daha sonra dene.'],
 ms:['Dalam talian · 1vs1','Cari lawan','Mencari lawan…','Jika tiada pemain dalam 8 saat, anda akan melawan bot.','Giliran lawan.','Menyambung…','Menyambung semula…','Semak sambungan dan cuba lagi.','Cuba lagi','Lawan bot','Seri','Keluar semasa permainan dalam talian boleh dikira kalah.','ID pengguna','Salin','Disalin.','Pilih dan salin ID.','Memuatkan akaun…','Akaun tidak dapat dimuatkan. Cuba lagi.','Tetamu #{code}','Permainan dalam talian tidak tersedia. Cuba kemudian.'],
 fr:['En ligne · 1vs1','Trouver un adversaire','Recherche d’un adversaire…','Sans joueur après 8 secondes, vous affronterez un bot.','Au tour de votre adversaire.','Connexion…','Reconnexion…','Vérifiez la connexion et réessayez.','Réessayer','Contre un bot','Égalité','Quitter une partie en ligne en cours peut compter comme une défaite.','ID utilisateur','Copier','Copié.','Sélectionnez et copiez l’ID.','Chargement du compte…','Impossible de charger le compte. Réessayez.','Invité #{code}','Le jeu en ligne est indisponible. Réessayez plus tard.'],
 de:['Online · 1vs1','Gegner finden','Gegner wird gesucht…','Wenn nach 8 Sekunden niemand da ist, spielst du gegen einen Bot.','Dein Gegner ist am Zug.','Verbinden…','Erneut verbinden…','Prüfe die Verbindung und versuche es erneut.','Erneut versuchen','Gegen Bot','Unentschieden','Das Verlassen einer laufenden Onlinepartie kann als Niederlage zählen.','Benutzer-ID','Kopieren','Kopiert.','ID auswählen und kopieren.','Konto wird geladen…','Konto konnte nicht geladen werden. Versuche es erneut.','Gast #{code}','Onlinespiel ist nicht verfügbar. Versuche es später.'],
 es:['En línea · 1vs1','Buscar rival','Buscando rival…','Si no hay jugadores en 8 segundos, jugarás contra un bot.','Es el turno de tu rival.','Conectando…','Reconectando…','Revisa la conexión e inténtalo de nuevo.','Reintentar','Contra bot','Empate','Salir de una partida en línea en curso puede contar como derrota.','ID de usuario','Copiar','Copiado.','Selecciona y copia el ID.','Cargando cuenta…','No se pudo cargar la cuenta. Reintenta.','Invitado #{code}','El juego en línea no está disponible. Inténtalo más tarde.'],
 it:['Online · 1vs1','Trova avversario','Ricerca avversario…','Se nessuno arriva entro 8 secondi, affronterai un bot.','Tocca all’avversario.','Connessione…','Riconnessione…','Controlla la connessione e riprova.','Riprova','Contro bot','Pareggio','Uscire da una partita online in corso può contare come sconfitta.','ID utente','Copia','Copiato.','Seleziona e copia l’ID.','Caricamento account…','Impossibile caricare l’account. Riprova.','Ospite #{code}','Il gioco online non è disponibile. Riprova più tardi.'],
 ja:['オンライン · 1vs1','対戦相手を探す','対戦相手を探しています…','8秒以内に相手が見つからない場合はボットと対戦します。','相手の手番です。','接続中…','再接続中…','接続を確認して再試行してください。','再試行','ボット対戦','引き分け','進行中のオンライン対局から退出すると負けになる場合があります。','ユーザーID','コピー','コピーしました。','IDを選択してコピーしてください。','アカウントを読み込み中…','アカウントを読み込めませんでした。再試行してください。','ゲスト #{code}','現在オンライン対戦を利用できません。後でもう一度お試しください。'],
 'zh-Hans':['在线 · 1vs1','寻找对手','正在寻找对手…','8秒内没有玩家加入时，将与机器人对战。','轮到对手行动。','正在连接…','正在重新连接…','请检查连接后重试。','重试','机器人对战','平局','退出正在进行的在线对局可能会判负。','用户ID','复制','已复制。','请选择并复制ID。','正在加载账户…','无法加载账户，请重试。','访客 #{code}','暂时无法连接在线对战，请稍后重试。'],
 'zh-Hant':['線上 · 1vs1','尋找對手','正在尋找對手…','8秒內沒有玩家加入時，將與機器人對戰。','輪到對手行動。','正在連線…','正在重新連線…','請檢查連線後重試。','重試','機器人對戰','平手','退出正在進行的線上對局可能會判負。','使用者ID','複製','已複製。','請選取並複製ID。','正在載入帳戶…','無法載入帳戶，請重試。','訪客 #{code}','暫時無法連接線上對戰，請稍後重試。']
};
export const ONLINE_TEXTS=Object.fromEntries(Object.entries(rows).map(([lang,row])=>[lang,Object.fromEntries(keys.map((key,i)=>[key,row[i]]))]));
const saveNotes={en:'Online games are saved on the server. Reconnect to continue.',ko:'온라인 대국은 서버에 저장돼요. 다시 접속하면 이어갈 수 있어요.',id:'Permainan daring disimpan di server. Sambungkan lagi untuk melanjutkan.','pt-BR':'Partidas online ficam salvas no servidor. Reconecte para continuar.','es-MX':'Las partidas en línea se guardan en el servidor. Reconecta para continuar.',th:'เกมออนไลน์บันทึกบนเซิร์ฟเวอร์ เชื่อมต่อใหม่เพื่อเล่นต่อ',vi:'Ván trực tuyến được lưu trên máy chủ. Kết nối lại để chơi tiếp.',pl:'Gry online są zapisywane na serwerze. Połącz się ponownie, aby kontynuować.',tr:'Çevrimiçi oyunlar sunucuda saklanır. Devam etmek için yeniden bağlan.',ms:'Permainan dalam talian disimpan di pelayan. Sambung semula untuk meneruskan.',fr:'Les parties en ligne sont sauvegardées sur le serveur. Reconnectez-vous pour continuer.',de:'Onlinepartien werden auf dem Server gespeichert. Verbinde dich erneut, um weiterzuspielen.',es:'Las partidas en línea se guardan en el servidor. Vuelve a conectarte para continuar.',it:'Le partite online sono salvate sul server. Riconnettiti per continuare.',ja:'オンライン対局はサーバーに保存されます。再接続して続けられます。','zh-Hans':'在线对局保存在服务器上，重新连接即可继续。','zh-Hant':'線上對局儲存在伺服器上，重新連線即可繼續。'};
for(const [lang,text]of Object.entries(saveNotes))ONLINE_TEXTS[lang].onlineSaveNote=text;
const clockTexts={
 "en": [
  "Automatic throw in {n}s",
  "Throwing automatically…",
  "AI played for the player."
 ],
 "ko": [
  "자동 던지기까지 {n}초",
  "자동으로 던지고 있어요…",
  "AI가 대신 진행했어요."
 ],
 "id": [
  "Lempar otomatis dalam {n} dtk",
  "Melempar otomatis…",
  "AI bermain untuk pemain."
 ],
 "pt-BR": [
  "Lançamento automático em {n}s",
  "Lançando automaticamente…",
  "A IA jogou pelo jogador."
 ],
 "es-MX": [
  "Lanzamiento automático en {n}s",
  "Lanzando automáticamente…",
  "La IA jugó por el jugador."
 ],
 "th": [
  "จะโยนอัตโนมัติใน {n} วินาที",
  "กำลังโยนอัตโนมัติ…",
  "AI เล่นแทนแล้ว"
 ],
 "vi": [
  "Tự động tung sau {n} giây",
  "Đang tự động tung…",
  "AI đã chơi thay người chơi."
 ],
 "pl": [
  "Automatyczny rzut za {n}s",
  "Automatyczny rzut…",
  "AI zagrało za gracza."
 ],
 "tr": [
  "{n} sn sonra otomatik atış",
  "Otomatik atılıyor…",
  "Yapay zekâ oyuncu yerine oynadı."
 ],
 "ms": [
  "Balingan automatik dalam {n}s",
  "Membaling secara automatik…",
  "AI bermain bagi pemain."
 ],
 "fr": [
  "Lancer automatique dans {n}s",
  "Lancer automatique…",
  "L’IA a joué à sa place."
 ],
 "de": [
  "Automatischer Wurf in {n}s",
  "Automatischer Wurf…",
  "Die KI hat übernommen."
 ],
 "es": [
  "Lanzamiento automático en {n}s",
  "Lanzando automáticamente…",
  "La IA jugó por el jugador."
 ],
 "it": [
  "Lancio automatico tra {n}s",
  "Lancio automatico…",
  "L’IA ha giocato al suo posto."
 ],
 "ja": [
  "自動で投げるまで{n}秒",
  "自動で投げています…",
  "AIが代わりに進めました。"
 ],
 "zh-Hans": [
  "{n}秒后自动投掷",
  "正在自动投掷…",
  "AI已代为进行游戏。"
 ],
 "zh-Hant": [
  "{n}秒後自動投擲",
  "正在自動投擲…",
  "AI已代為進行遊戲。"
 ]
};
for(const [lang,row] of Object.entries(clockTexts))for(const [i,key]of ['throwCountdown','autoThrowing','aiPlayed'].entries())ONLINE_TEXTS[lang][key]=row[i];

const matchFound={
 en:['Opponent found!','Bot match ready!'],
 ko:['상대를 찾았어요!','봇과 대전해요!'],
 id:['Lawan ditemukan!','Siap melawan bot!'],
 'pt-BR':['Adversário encontrado!','Tudo pronto contra o bot!'],
 'es-MX':['¡Rival encontrado!','¡Listo para jugar contra un bot!'],
 th:['พบคู่แข่งแล้ว!','พร้อมแข่งกับบอต!'],
 vi:['Đã tìm thấy đối thủ!','Sẵn sàng đấu với bot!'],
 pl:['Znaleziono rywala!','Gotowi do gry z botem!'],
 tr:['Rakip bulundu!','Bot maçı hazır!'],
 ms:['Lawan ditemui!','Sedia melawan bot!'],
 fr:['Adversaire trouvé !','Prêt à affronter un bot !'],
 de:['Gegner gefunden!','Bereit für das Bot-Match!'],
 es:['¡Rival encontrado!','¡Listo para jugar contra un bot!'],
 it:['Avversario trovato!','Pronti a sfidare il bot!'],
 ja:['対戦相手が見つかりました！','ボットと対戦します！'],
 'zh-Hans':['找到对手了！','准备与机器人对战！'],
 'zh-Hant':['找到對手了！','準備與機器人對戰！'],
};
for(const [lang,row]of Object.entries(matchFound))for(const [i,key]of ['matchingFound','matchingBotFound'].entries())ONLINE_TEXTS[lang][key]=row[i];
ONLINE_TEXTS.en.matchingTitle='Finding an opponent';
ONLINE_TEXTS.ko.matchingTitle='상대 찾는 중';
