// Online shared table through the company game server NcqBoard: you and one more player (or, when nobody turns
// up within a few seconds, one of the server's house players). The server deals, checks every move and settles;
// this file only finds the room, listens to it and sends moves. game.js draws what the server says.
// In development there is no sign-in (NcqAuth), so this stays off and the shared table plays with local seats.
(function () {
  'use strict';
  var BJ = window.BJ;
  var O = BJ.online = {};
  var board = null, readyP = null;

  O.ready = function () {
    if (readyP) return readyP;
    readyP = (async function () {
      try {
        var mock = /[?&]mockboard\b/.test(location.search);
        if (!window.NcqAuth && !mock) return false;
        if (mock) { board = await mockBoard(); return true; }
        var config = await fetch('./ncq/board-config.json').then(function (r) { return r.json(); }).catch(function () { return null; });
        if (!config || !config.apiUrl) return false;
        var mod = await import('../ncq/board.js');
        board = mod.NcqBoard.create({ apiUrl: config.apiUrl, getToken: function (o) { return window.NcqAuth.getToken(o); } });
        return true;
      } catch (e) { if (window.console) console.warn('online table unavailable', e); board = null; return false; }
    })();
    return readyP;
  };
  O.on = function () { return !!board; };

  // Look for a seat at this table's queue until a room is ready (the server fills an empty seat with a house player).
  var ticket = null, cancelled = false;
  O.find = async function (queue) {
    cancelled = false;
    var m = await board.match({ queue: queue });
    while (!m.game) {
      if (cancelled) throw new Error('cancelled');
      ticket = m.ticket;
      await new Promise(function (r) { setTimeout(r, 1000); });
      m = await board.match({ queue: queue, ticket: ticket });
    }
    ticket = null;
    return m.game;
  };
  O.cancel = function () { cancelled = true; if (ticket && board) board.cancel(ticket).catch(function () {}); ticket = null; };
  O.seats = function (code) { return board.seats(code, -1); };
  O.subscribe = function (code, room, onState, onStatus) {
    return board.subscribeRoom(code, { initialState: room, onState: onState, onStatus: onStatus || function () {}, onError: function () {} });
  };
  O.move = function (room, action) { return board.move(room.code, { version: room.version, round: room.round, action: action }); };
  O.rematch = function (room) { return board.rematch(room.code, { round: room.round }); };
  O.leave = function (code) { return board.leave(code).catch(function () {}); };

  // ---- test stand-in: the real server rules running in the page (only with ?mockboard) ----
  async function mockBoard() {
    var R = (await import('../server/rules.mjs')).default, rooms = {};
    function out(rm) { return { code: rm.code, you: rm.you, round: rm.round, version: rm.version, turn: rm.state.turn, phase: rm.state.done ? 'finished' : 'playing', state: R.view(rm.state, rm.you), canRematch: true }; }
    function push(rm) { rm.version += 1; (rm.subs || []).forEach(function (f) { setTimeout(function () { f(out(rm)); }, 30); }); botTurn(rm); }
    function botTurn(rm) {
      var st = rm.state;
      if (st.done || !st.turn || st.turn === rm.you) {
        if (st.phase === 'bet' && !st.seats[rm.bot - 1].bet) setTimeout(function () { act(rm, rm.bot, R.bot({ state: Object.assign({}, rm.state, { turn: rm.bot }) })); }, 1200);
        return;
      }
      setTimeout(function () { act(rm, st.turn, R.bot({ state: rm.state })); }, 1200);
    }
    function act(rm, seat, a) { if (rm.state.done) return; try { rm.state = R.apply(rm.state, seat, a); push(rm); } catch (e) { /* stale */ } }
    return {
      match: async function (input) {
        var code = 'M' + Date.now(), you = Math.random() < 0.5 ? 1 : 2;
        var rm = rooms[code] = { code: code, you: you, bot: 3 - you, round: 1, version: 1, queue: input.queue, state: R.initial({ players: 2, queue: input.queue }), subs: [] };
        botTurn(rm);
        return { game: out(rm) };
      },
      seats: async function (code) { var rm = rooms[code]; return { seats: [1, 2].map(function (n) { return { seat: n, nickname: n === rm.you ? 'Me' : 'Stardust', bot: n !== rm.you, avatar: 3 }; }) }; },
      subscribeRoom: function (code, o) { var rm = rooms[code]; rm.subs.push(o.onState); return { close: function () { rm.subs = []; } }; },
      move: async function (code, input) { var rm = rooms[code]; rm.state = R.apply(rm.state, rm.you, input.action); push(rm); return out(rm); },
      rematch: async function (code) { var rm = rooms[code]; rm.round += 1; rm.state = R.initial({ players: 2, queue: rm.queue }); push(rm); return out(rm); },
      leave: async function () {}, cancel: async function () {}
    };
  }
})();
