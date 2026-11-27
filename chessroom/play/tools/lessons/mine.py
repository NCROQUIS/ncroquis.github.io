# 연습 대국(마스터 단기전 1204판)에서 국면 뽑기: 마지막 메이트 국면, 전술 후보 국면
import json,sys,chess
recs=json.load(open(sys.argv[1]))['records']
mates=[];cands=[]
for r in recs:
    b=chess.Board(r['initialFen'])
    ms=r['sanMoves']
    for i,san in enumerate(ms):
        try: mv=b.parse_san(san)
        except Exception: break
        fen=b.fen()
        if i==len(ms)-1:
            b2=b.copy();b2.push(mv)
            if b2.is_checkmate(): mates.append({'fen':fen,'uci':mv.uci(),'id':r['id']})
        elif i>=8 and (b.is_capture(mv) or b.gives_check(mv)):
            cands.append({'fen':fen,'uci':mv.uci(),'id':r['id'],'left':len(ms)-i})
        b.push(mv)
json.dump({'mates':mates,'cands':cands},open(sys.argv[2],'w'))
print(len(mates),len(cands))
