/* NcqShare — 기기에서 만든 스크린샷, 문구, 공개 게임 링크를 공유해요 (ES2017). */
(function (w) {
  "use strict";
  var flags = w.NCQ || {};
  var config = flags.NCQ_SHARE || {};
  var cache = "ncq-share";
  var busy = false;

  function httpsUrl(value) {
    try {
      var url = new URL(value);
      if (url.protocol === "https:" && !url.username && !url.password) return url.href;
    } catch (error) { /* 잘못된 주소는 공유하지 않아요. */ }
    return "";
  }
  var gameUrl = httpsUrl(config.url);

  async function capture(image) {
    try {
      var source = typeof image === "function" ? await image() : image;
      if (source instanceof Blob && /^(image\/png|image\/jpeg|image\/webp)$/.test(source.type)) return source;
      if (source && typeof source.toBlob === "function") {
        return await new Promise(function (resolve) { source.toBlob(resolve, "image/jpeg", 0.88); });
      }
    } catch (error) { /* 캡처가 막힌 화면은 문구와 링크만 공유해요. */ }
    return null;
  }

  async function prepareShare(options) {
    options = options || {};
    return Object.freeze({
      title: String(options.title || config.title || ""),
      message: String(options.message || ""),
      url: options.url === undefined ? null : httpsUrl(options.url),
      image: await capture(options.image)
    });
  }

  function playUrl() {
    if (!gameUrl) return "";
    var url = new URL(gameUrl);
    url.searchParams.set("play", "1");
    return url.href;
  }

  function fileName(image) {
    var ext = {"image/png": ".png", "image/webp": ".webp", "image/jpeg": ".jpg"};
    return "game-screenshot" + (ext[image.type] || ".jpg");
  }

  function readBase64(image) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result).split(",")[1]); };
      reader.onerror = reader.onabort = reject;
      reader.readAsDataURL(image);
    });
  }

  async function cleanCache(filesystem) {
    try {
      var listing = await filesystem.readdir({path: cache, directory: "CACHE"});
      var cutoff = Date.now() - 24 * 60 * 60 * 1000;
      await Promise.all(listing.files.filter(function (file) {
        return file.type === "file" && file.mtime && file.mtime < cutoff;
      }).map(function (file) {
        return filesystem.deleteFile({path: cache + "/" + file.name, directory: "CACHE"});
      }));
    } catch (error) { /* 캐시 정리가 공유를 막지 않아요. */ }
  }

  async function cacheImage(filesystem, image) {
    if (!image || !filesystem) return "";
    try {
      var path = cache + "/" + Date.now() + "-" + Math.random().toString(36).slice(2) + "-" + fileName(image);
      var file = await filesystem.writeFile({
        path: path, data: await readBase64(image), directory: "CACHE", recursive: true
      });
      // 공유받는 앱이 창을 닫은 뒤에도 파일을 읽을 수 있어 지난 파일만 지워요.
      cleanCache(filesystem);
      return file.uri;
    } catch (error) {
      return "";
    }
  }

  function cancelled(error) {
    return error && (error.name === "AbortError" || /^share cancel(l)?ed[.!]?$/i.test(error.message || ""));
  }

  function messageWithLink(prepared, url) {
    return [prepared.message || prepared.title, url].filter(Boolean).join("\n");
  }

  function mobileBrowser(nav) {
    // Desktop Web Share opens the OS sheet (including Windows Share), which can hang
    // independently of the page. Prefer clipboard there; preserve mobile/tablet sharing.
    if (/Android|iPhone|iPad|iPod/i.test(nav.userAgent || "")) return true;
    if (nav.platform === "MacIntel" && nav.maxTouchPoints > 1) return true; // iPad desktop UA
    return Boolean(nav.userAgentData && nav.userAgentData.mobile);
  }

  async function share(prepared) {
    var customUrl = prepared && prepared.url != null;
    var url = customUrl ? httpsUrl(prepared.url) : gameUrl;
    var imageAttached = false;
    function result(status) { return {status: status, url: url, imageAttached: imageAttached}; }
    if (!url || !prepared || busy) return result("failed");
    busy = true;
    try {
      var nav = w.navigator;
      var toss = (w.NcqToss || {}).Share;
      var cap = w.Capacitor;
      var plugins = (cap || {}).Plugins || {};
      if (flags.NCQ_PLATFORM === "toss" && toss && toss.sendMessage) {
        if (!customUrl && config.tossApp && toss.createLink) {
          try {
            url = httpsUrl(await toss.createLink({path: "intoss://" + config.tossApp})) || gameUrl;
          } catch (error) { /* 토스 링크를 만들지 못하면 공개 게임 링크를 써요. */ }
        }
        await toss.sendMessage({message: messageWithLink(prepared, url)});
        return result("shared");
      }
      if (cap && cap.isNativePlatform && cap.isNativePlatform() && plugins.Share) {
        var uri = await cacheImage(plugins.Filesystem, prepared.image);
        var options = {title: prepared.title, text: messageWithLink(prepared, url)};
        if (uri) options.files = [uri];
        await plugins.Share.share(options);
        imageAttached = Boolean(uri);
        return result("shared");
      }
      if (nav.share && mobileBrowser(nav)) {
        var data = {title: prepared.title, text: prepared.message, url: url};
        if (prepared.image && typeof File === "function" && nav.canShare) {
          var withFile = Object.assign({}, data, {
            files: [new File([prepared.image], fileName(prepared.image), {type: prepared.image.type})]
          });
          if (nav.canShare(withFile)) data = withFile;
        }
        try {
          // 브라우저는 버튼을 누른 직후에만 공유창을 열 수 있어요.
          await nav.share(data);
          imageAttached = Boolean(data.files);
          return result("shared");
        } catch (error) {
          if (cancelled(error)) return result("cancelled");
        }
      }
      if (nav.clipboard && nav.clipboard.writeText) {
        await nav.clipboard.writeText(messageWithLink(prepared, url));
        return result("copied");
      }
      return result("failed");
    } catch (error) {
      return result(cancelled(error) ? "cancelled" : "failed");
    } finally {
      busy = false;
    }
  }

  async function saveImage(prepared) {
    var image = prepared && prepared.image;
    if (!image) return false;
    var tossFile = (w.NcqToss || {}).File;
    try {
      if (flags.NCQ_PLATFORM === "toss") {
        if (!tossFile || !tossFile.saveBase64) return false;
        await tossFile.saveBase64({
          data: await readBase64(image), fileName: fileName(image), mimeType: image.type
        });
      } else {
        var link = w.document.createElement("a");
        var url = URL.createObjectURL(image);
        link.download = fileName(image);
        link.href = url;
        try { link.click(); }
        finally { w.setTimeout(function () { URL.revokeObjectURL(url); }, 30000); }
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  w.NcqShare = Object.freeze({
    can: function () { return Boolean(gameUrl); },
    prepareShare: prepareShare,
    share: share,
    playUrl: playUrl,
    saveImage: saveImage
  });
})(window);
