/* Sound effects, synthesised on the fly. No audio files. */
(function () {
  'use strict';
  var BJ = window.BJ;
  var A = BJ.audio = { on: true };
  var ctx = null, master = null, noiseBuf = null, lastChip = 0;

  function ready() { return A.on && ctx && ctx.state === 'running'; }

  // Browsers only allow sound after a tap, so this is called from every button.
  A.unlock = function () {
    try {
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.6), ctx.sampleRate);
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      loadVoices();
      if (ctx.state === 'suspended') { var p = ctx.resume(); if (p && p.catch) p.catch(function () {}); }
    } catch (e) { ctx = null; }
  };

  function tone(freq, dur, gain, type, delay, glideTo) {
    var t = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, freq, q, gain, type, delay, sweepTo) {
    var t = ctx.currentTime + (delay || 0), s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true;
    f.type = type || 'bandpass'; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random() * 0.4); s.stop(t + dur + 0.02);
  }

  // Clay chip: a short bright clack, duller and with a thud when it lands on felt.
  function clack(level, onChip, delay) {
    var f = (onChip ? 3300 : 2300) * (0.88 + Math.random() * 0.3), g = 0.04 + 0.2 * level;
    tone(f, 0.034, g, 'triangle', delay);
    tone(f * 1.53, 0.02, g * 0.55, 'sine', delay);
    noise(0.022, onChip ? 5600 : 2000, 1.1, g * (onChip ? 0.5 : 0.8), 'bandpass', delay);
    if (!onChip) noise(0.06, 240, 0.7, g * 0.9, 'lowpass', delay);
  }
  // Recorded clay chips; harder hits play louder and a little higher, chip-on-chip a touch brighter.
  function chipSample(level, onChip, delay) {
    var src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = voices.chip;
    src.playbackRate.value = (onChip ? 1.08 : 0.92) + Math.random() * 0.14 + level * 0.06;
    g.gain.value = 0.15 + 0.75 * level;
    src.connect(g); g.connect(master); src.start(ctx.currentTime + (delay || 0));
  }
  A.chip = function (level, onChip) {
    if (!ready()) return;
    var now = ctx.currentTime;
    if (now - lastChip < 0.03) return;
    lastChip = now;
    if (voices.chip) chipSample(level, onChip, 0); else clack(level, onChip, 0);
  };
  A.chipRake = function (n) {
    if (!ready()) return;
    noise(0.3, 1500, 0.6, 0.07, 'bandpass', 0, 700);
    for (var i = 0; i < n; i++) { var lv = 0.25 + Math.random() * 0.3, t = i * 0.03 + Math.random() * 0.012; if (voices.chip) chipSample(lv, true, t); else clack(lv, true, t); }
  };

  // Card off the shoe: one of four recorded deals, pitched a hair differently each time. Synth stands in until they load.
  var lastCard = -1;
  function haveCards() { return voices.card0 && voices.card1 && voices.card2 && voices.card3; }
  A.cardSlide = function () {
    if (!ready()) return;
    if (!haveCards()) return noise(0.17, 3400, 0.7, 0.085, 'bandpass', 0, 1100);
    var k; do { k = Math.floor(Math.random() * 4); } while (k === lastCard); lastCard = k;
    var src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = voices['card' + k]; src.playbackRate.value = 0.94 + Math.random() * 0.12; g.gain.value = 0.85;
    src.connect(g); g.connect(master); src.start();
  };
  A.cardFlip = function () { if (ready()) noise(0.08, 2600, 0.9, haveCards() ? 0.035 : 0.07, 'bandpass', 0, 5200); };
  A.cardLand = function () { if (ready() && !haveCards()) { noise(0.05, 520, 0.8, 0.2, 'lowpass'); noise(0.015, 4200, 1, 0.05, 'bandpass'); } };
  // One coin landing in the purse; `step` raises the pitch along a run of coins.
  // Coins landing in the purse: the cash-register clink, played on every few coins with a rising pitch.
  // Spaced out and capped so a long stream stays a quick 차캉차캉 and never builds up into a roar.
  var lastClink = 0, live = 0;
  A.coinIn = function (step) {
    if (!ready()) return;
    if (voices.chaching) {
      var now = ctx.currentTime;
      if (now - lastClink < 0.075 || live >= 3) return;
      lastClink = now; live++;
      var src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = voices.chaching;
      src.playbackRate.value = Math.min(1.45, 0.92 + Math.min(step, 24) * 0.022);
      g.gain.value = 0.42;
      src.connect(g); g.connect(master); src.start();
      src.onended = function () { live--; };
      return;
    }
    var f = 1900 * Math.pow(1.03, Math.min(step, 30));
    tone(f, 0.07, 0.06, 'sine'); tone(f * 2.5, 0.04, 0.03, 'sine');
  };
  // Coins spilling out of the pile: the recorded coin-bag jingle, synth until it loads.
  // A table opening: the recorded slot-machine payout, or the synth fanfare until it has loaded.
  A.unlockTable = function () {
    if (ready() && voices.unlock) {
      var src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = voices.unlock; g.gain.value = 0.85;
      src.connect(g); g.connect(master); src.start();
    } else A.fanfare();
  };
  A.coinBurst = function () {
    if (ready() && voices.coinbag) {
      var src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = voices.coinbag; g.gain.value = 0.8;
      src.connect(g); g.connect(master); src.start();
      return;
    }
    if (ready()) { noise(0.25, 5200, 0.6, 0.06, 'bandpass', 0, 2600); for (var i = 0; i < 6; i++) clack(0.3 + Math.random() * 0.3, true, i * 0.02); } };
  // Announcer clips (recorded voice): win, lose, draw, bust, blackjack.
  var voices = {}, voiceLoad = null;
  function loadVoices() {
    if (voiceLoad || !ctx) return;
    voiceLoad = Promise.all(['win', 'lose', 'draw', 'bust', 'blackjack', 'card0', 'card1', 'card2', 'card3', 'chip', 'shuffle', 'jingle_win', 'jingle_big', 'jingle_lose', 'chaching', 'coinbag', 'unlock'].map(function (n) {
      return fetch('sfx/' + n + '.mp3').then(function (r) { return r.arrayBuffer(); })
        .then(function (b) { return new Promise(function (ok, no) { ctx.decodeAudioData(b, ok, no); }); })
        .then(function (buf) { voices[n] = buf; }).catch(function () {});
    }));
  }
  A.voice = function (name) {
    if (!ready() || !voices[name]) return;
    var src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = voices[name]; g.gain.value = 1.15;
    src.connect(g); g.connect(master); src.start();
  };
  // Recorded riffle for the deck shuffle; returns false if it has not loaded, so the caller can fall back.
  A.shuffle = function () {
    if (!ready() || !voices.shuffle) return false;
    var src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = voices.shuffle; g.gain.value = 0.9;
    src.playbackRate.value = A.shuffleRate || 1;      // keeps pace with the shuffle animation
    src.connect(g); g.connect(master); src.start();
    return true;
  };
  A.tick = function () { if (ready()) tone(1250, 0.03, 0.05, 'triangle'); };
  // One card snapping down in a riffle; called in a fast run.
  A.riffle = function () { if (ready()) { noise(0.022, 3200 + Math.random() * 1800, 1.4, 0.07, 'bandpass'); noise(0.03, 700, 0.8, 0.05, 'lowpass'); } };
  A.deckDrop = function () { if (ready()) { noise(0.07, 380, 0.7, 0.26, 'lowpass'); noise(0.02, 3000, 1, 0.05, 'bandpass'); } };
  A.whoosh = function () { if (ready()) noise(0.9, 500, 0.5, 0.05, 'bandpass', 0, 1600); };
  A.deny = function () { if (ready()) { tone(210, 0.09, 0.09, 'square'); tone(160, 0.12, 0.09, 'square', 0.08); } };

  function arp(notes, step, gain, type) {
    notes.forEach(function (f, i) { tone(f, 0.26, gain, type || 'triangle', i * step); tone(f * 2, 0.18, gain * 0.25, 'sine', i * step); });
  }
  // Recorded result jingles: normal win, blackjack or big win, loss. The synth versions below stand in until they load.
  function jingle(name) {
    if (!ready() || !voices[name]) return false;
    var src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = voices[name]; g.gain.value = 0.75;
    src.connect(g); g.connect(master); src.start();
    return true;
  }
  A.jingle = function (kind) {        // 'win' | 'big' | 'lose'
    if (jingle('jingle_' + kind)) return;
    if (kind === 'big') A.blackjack(); else if (kind === 'win') A.win(); else A.lose();
  };
  A.win = function () { if (ready()) arp([523.25, 659.25, 783.99, 1046.5], 0.075, 0.13); };
  A.blackjack = function () { if (ready()) { arp([523.25, 659.25, 783.99, 1046.5, 1318.5, 1568], 0.07, 0.14); noise(0.7, 7000, 0.5, 0.03, 'highpass', 0.3); } };
  A.push = function () { if (ready()) arp([440, 440], 0.12, 0.09); };
  A.lose = function () { if (ready()) { tone(196, 0.32, 0.13, 'triangle', 0, 120); tone(147, 0.4, 0.1, 'sine', 0.05, 90); } };
  A.bust = function () { if (ready()) { tone(330, 0.12, 0.11, 'sawtooth', 0, 220); tone(220, 0.26, 0.11, 'sawtooth', 0.1, 110); } };
  A.unlockClick = function () { if (ready()) arp([1318.5, 1975.5], 0.05, 0.06, 'triangle'); };
  A.fanfare = function () { if (ready()) arp([392, 523.25, 659.25, 783.99, 1046.5], 0.09, 0.14, 'square'); };
})();
