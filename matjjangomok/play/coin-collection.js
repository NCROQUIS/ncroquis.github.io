import "./ncq/collect.js?v=689216405a77";

const coinImage = new URL("./assets/forest-ui/icons/coin.webp", import.meta.url).href;

// The shared module owns motion/lifecycle; Omok only supplies its wallet and art.
export function createCoinCollection(options = {}) {
  const effect = globalThis.NcqCollect.create(options);
  const window = options.window ?? globalThis.window;
  return {
    play({receipt, amount, balance, target, origin}) {
      const safe = window.NcqSafe?.space() ?? {top: 0, right: 0};
      return effect.play({id: receipt, amount, value: balance, from: origin,
        to: effect.point(target) ? target : {x: window.innerWidth - safe.right - 64, y: safe.top + 32},
        image: coinImage, targetIcon: ".shop-coin, [data-coin-icon]"});
    },
    stop: effect.stop, point: effect.point, dispose: effect.dispose,
    get timing() { return effect.timing; },
  };
}
