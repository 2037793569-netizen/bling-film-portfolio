  const mobileAnimation = $('mobile-animation');
  const mobileContext = mobileAnimation.getContext('2d', {alpha:false});
  const mobileClips = __MOBILE_CLIPS__;
  const mobileSheets = {opening:new Map(), about:new Map()};
  let mobileOpeningReady = false, mobileRun = 0, mobileClock = 0;
  function loadMobileSheet(kind, index) {
    const clip = mobileClips[kind], sheets = mobileSheets[kind];
    if (index >= clip.sheets.length) return Promise.resolve(null);
    if (!sheets.has(index)) {
      const entry = {image:null, promise:null};
      entry.promise = new Promise((resolve, reject) => {
        const picture = new Image();
        picture.decoding = 'async';
        picture.fetchPriority = index === 0 ? 'high' : 'auto';
        picture.onload = async () => {
          try {
            if (picture.decode) await picture.decode();
            entry.image = picture; resolve(picture);
          } catch (error) { sheets.delete(index); reject(error); }
        };
        picture.onerror = () => { sheets.delete(index); reject(new Error('Frame download failed')); };
        picture.src = clip.sheets[index];
      });
      sheets.set(index, entry);
    }
    return sheets.get(index).promise;
  }
  function preloadMobileFilm(kind) { return loadMobileSheet(kind, 0); }
  function stopMobileFilm() {
    mobileRun++;
    cancelAnimationFrame(mobileClock); mobileClock = 0;
    delete mobileAnimation.dataset.playing;
    delete stage.dataset.native; delete stage.dataset.nativeReady;
    if (mobileMedia) { intro.pause(); about.pause(); intro.playbackRate = about.playbackRate = 1; }
    // Keep the last painted frame until the next surface is ready.
    for (const kind of Object.keys(mobileSheets)) {
      for (const index of mobileSheets[kind].keys()) if (index > 0) mobileSheets[kind].delete(index);
    }
  }
  let mobileNativeAllowed = true;
  function prepareMobileNative(video) {
    if (!mobileMedia || !mobileNativeAllowed || video.src) return;
    video.muted = video.defaultMuted = true; video.playsInline = true;
    video.src = video.dataset.src; video.preload = 'auto'; video.load();
  }
  function playMobileFilm(kind) {
    stopMobileFilm();
    const run = mobileRun;
    const video = kind === 'opening' ? intro : about;
    function frames() {
      if (run !== mobileRun) return;
      delete stage.dataset.native;
      playMobileFrames(kind);
    }
    if (!mobileNativeAllowed) { frames(); return; }
    prepareMobileNative(video); video.preload = 'auto';
    stage.dataset.native = kind;
    if (video.readyState >= 1 && video.currentTime > .01) video.currentTime = 0;
    let settled = false;
    const timeout = setTimeout(fallback, 12000);
    function fallback() {
      if (settled || run !== mobileRun) return;
      settled = true; clearTimeout(timeout);
      mobileNativeAllowed = false; video.pause();
      for (const item of [intro,about]) { item.pause(); item.preload = 'metadata'; }
      frames();
    }
    function reveal() {
      if (settled || run !== mobileRun) return;
      settled = true; clearTimeout(timeout);
      stage.dataset.nativeReady = 'true';
      mobileAnimation.dataset.playing = kind;
      setScene(kind);
      if (kind === 'about') { introState = 'playing'; setVisualState(0,1,1); }
      // Native playback supplies its own media clock and ended event.
      if (kind === 'opening') prepareMobileNative(about);
    }
    try {
      video.playbackRate = 0; const started = video.play();
      Promise.resolve(started).then(() => {
        if (run !== mobileRun) return;
        const waitForBuffer = () => {
          if (run !== mobileRun || settled) return;
          const end = video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0;
          const remaining = Number.isFinite(video.duration) ? video.duration - video.currentTime : 3;
          if (end - video.currentTime < Math.min(3, remaining) - .08) {
            setTimeout(waitForBuffer, 100); return;
          }
          video.playbackRate = 1;
          if (video.readyState >= 2) reveal();
          else video.addEventListener('loadeddata',reveal,{once:true});
        };
        waitForBuffer();
      }).catch(fallback);
    } catch { fallback(); }
  }
  function retryMobileNativeGesture(event) {
    if (!mobileMedia || !event.isTrusted || (introState !== 'waiting' && introState !== 'playing')) return;
    if (stage.dataset.nativeReady === 'true') return;
    if (stage.dataset.native === 'about') {
      // Call play inside touchend itself, where iOS grants transient user activation.
      about.play().catch(() => {});
    } else {
      mobileNativeAllowed = true;
      playMobileFilm('about');
    }
  }
  function playMobileFrames(kind) {
    stopMobileFilm();
    const run = mobileRun, clip = mobileClips[kind];
    preloadMobileFilm(kind).then(() => {
      if (run !== mobileRun) return;
      mobileAnimation.width = clip.width; mobileAnimation.height = clip.height;
      let position = 0, previous = performance.now(), painted = -1, sheetIndex = -1;
      function tick(now) {
        if (run !== mobileRun) return;
        const delta = Math.min(80, Math.max(0, now - previous)); previous = now;
        if (document.hidden) { mobileClock = requestAnimationFrame(tick); return; }
        const candidate = Math.min(clip.frames - 1, Math.floor((position + delta) * clip.fps / 1000));
        const index = Math.floor(candidate / clip.perSheet);
        const entry = mobileSheets[kind].get(index);
        if (!entry?.image) {
          // Pause the film clock while a chunk loads; never count buffering as playback.
          mobileAnimation.dataset.buffering = 'true';
          loadMobileSheet(kind, index).catch(() => {});
          mobileClock = requestAnimationFrame(tick); return;
        }
        position += delta;
        if (candidate !== painted) {
          const cell = candidate % clip.perSheet;
          mobileContext.drawImage(entry.image,
            (cell % clip.columns) * clip.width, Math.floor(cell / clip.columns) * clip.height,
            clip.width, clip.height, 0, 0, clip.width, clip.height);
          painted = candidate;
          mobileAnimation.dataset.frame = String(candidate);
          delete mobileAnimation.dataset.buffering;
          if (!mobileAnimation.dataset.playing) {
            mobileAnimation.dataset.playing = kind;
            setScene(kind);
            if (kind === 'about') { introState = 'playing'; setVisualState(0, 1, 1); }
          }
        }
        if (index !== sheetIndex) {
          sheetIndex = index;
          for (const old of mobileSheets[kind].keys()) if (old < index) mobileSheets[kind].delete(old);
          loadMobileSheet(kind, index + 1).catch(() => {});
          loadMobileSheet(kind, index + 2).catch(() => {});
        }
        if (kind === 'about') $('sequence-progress').style.width = Math.min(100, position / (clip.frames / clip.fps * 10)) + '%';
        if (position >= clip.frames * 1000 / clip.fps) {
          if (kind === 'opening') finishIntro();
          else { setAboutEndState(); updateSequence(); }
        } else mobileClock = requestAnimationFrame(tick);
      }
      // Paint synchronously before changing visibility; an undecoded image never replaces the poster.
      tick(previous);
    }).catch(() => {
      if (run !== mobileRun) return;
      if (kind === 'opening') finishIntro(); else setAboutEndState();
    });
  }

