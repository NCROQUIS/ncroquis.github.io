const taglines={
  en:'Throw the sticks. Win the duel.',ko:'윷으로 붙는 한판 승부!',id:'Lempar yut, raih kemenangan!',
  'pt-BR':'Lance o yut. Vença o duelo!','es-MX':'¡Lanza yut y gana el duelo!',th:'โยนยุต แล้วชนะศึก!',
  vi:'Tung gậy yut, thắng trận đấu!',pl:'Rzuć yut i wygraj pojedynek!',tr:'Yut at, düelloyu kazan!',
  ms:'Lontar yut, menangi duel!',fr:'Lancez le yut, gagnez le duel !',de:'Wirf Yut. Gewinne das Duell!',
  es:'¡Lanza yut y gana el duelo!',it:'Lancia lo yut e vinci il duello!',ja:'ユンノリでいざ勝負！',
  'zh-Hans':'投掷柶棒，一决胜负！','zh-Hant':'投擲柶棒，一決勝負！',
};
export const LOBBY_TEXTS=Object.fromEntries(Object.entries(taglines).map(([language,lobbyTagline])=>[language,{lobbyTagline}]));
const settings={
 en:['Lobby background','Background blur','White center overlay','Reset background'],
 ko:['로비 배경','배경 흐림','중앙 흰색 반투명','배경 기본값'],
 id:['Latar lobi','Keburaman latar','Lapisan putih tengah','Atur ulang latar'],
 'pt-BR':['Fundo do lobby','Desfoque do fundo','Camada branca central','Restaurar fundo'],
 'es-MX':['Fondo del lobby','Desenfoque del fondo','Capa blanca central','Restablecer fondo'],
 th:['พื้นหลังล็อบบี้','ความเบลอพื้นหลัง','ชั้นสีขาวตรงกลาง','คืนค่าพื้นหลัง'],
 vi:['Nền sảnh','Độ mờ nền','Lớp trắng ở giữa','Đặt lại nền'],
 pl:['Tło lobby','Rozmycie tła','Biała warstwa pośrodku','Przywróć tło'],
 tr:['Lobi arka planı','Arka plan bulanıklığı','Ortadaki beyaz katman','Arka planı sıfırla'],
 ms:['Latar lobi','Kekaburan latar','Lapisan putih di tengah','Tetapkan semula latar'],
 fr:['Fond du salon','Flou du fond','Voile blanc au centre','Réinitialiser le fond'],
 de:['Lobby-Hintergrund','Hintergrundunschärfe','Weißer Schleier in der Mitte','Hintergrund zurücksetzen'],
 es:['Fondo del lobby','Desenfoque del fondo','Capa blanca central','Restablecer fondo'],
 it:['Sfondo della lobby','Sfocatura dello sfondo','Velo bianco al centro','Ripristina sfondo'],
 ja:['ロビー背景','背景のぼかし','中央の白い半透明','背景をリセット'],
 'zh-Hans':['大厅背景','背景模糊','中央白色半透明','重置背景'],
 'zh-Hant':['大廳背景','背景模糊','中央白色半透明','重設背景'],
};
for(const [language,values]of Object.entries(settings))Object.assign(LOBBY_TEXTS[language],Object.fromEntries(['lobbyBackdrop','lobbyBlur','lobbyWhite','lobbyDefault'].map((key,index)=>[key,values[index]])));
