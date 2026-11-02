from pathlib import Path
p=Path('dist');ap=p/'app.js';hp=p/'index.html';cp=p/'style.css'
app=ap.read_text();html=hp.read_text();css=cp.read_text()
assert 'const mobileMedia' not in app,'Mobile fix already applied'
app=app.replace("  const ctx = canvas.getContext('2d');","  const mobileMedia = matchMedia('(hover: none) and (pointer: coarse)').matches;\n  const stage = $('stage'), playbackRetry = $('mobile-play');\n  function setScene(scene) { stage.dataset.scene = scene; sequence.dataset.scene = scene; playbackRetry.hidden = true; }\n  const ctx = canvas.getContext('2d');")
app=app.replace("  const bc = base.getContext('2d');","  const bc = base.getContext('2d');\n  if (mobileMedia) { canvas.width = base.width = 1; canvas.height = base.height = 1; }")
app=app.replace("const eyeSprite = new Image(); eyeSprite.src = 'assets/eye-frames.webp';","const eyeSprite = new Image(); if (!mobileMedia) eyeSprite.src = 'assets/eye-frames.webp';")
app=app.replace("  function captureGazeFrame() {","  function captureGazeFrame() {\n    if (mobileMedia) { ready = gazePoster.complete && gazePoster.naturalWidth > 0; return; }")
app=app.replace("    if (!ready || opening) return;","    if (mobileMedia || !ready || opening) return;")
app=app.replace("  function aim(x, y) {","  function aim(x, y) {\n    if (mobileMedia) return;")
marker="  async function bufferFilm(video) {"
helpers="""  function playFilm(video) {
    video.muted = true; video.defaultMuted = true; video.playsInline = true;
    const attempt = video.play();
    return Promise.resolve(attempt).catch(error => {
      const visible = stage.dataset.scene === (video === intro ? 'opening' : 'about');
      if (visible) {
        playbackRetry.dataset.video = video.id;
        playbackRetry.hidden = false;
        if (error.name !== 'NotAllowedError' && error.name !== 'AbortError') notice();
      }
    });
  }
  playbackRetry.addEventListener('click', () => {
    const video = $(playbackRetry.dataset.video);
    if (video) { playbackRetry.hidden = true; playFilm(video); }
  });
  [intro, about].forEach(video => video.addEventListener('playing', () => { playbackRetry.hidden = true; }));
  async function bufferFilm(video) {"""
app=app.replace(marker,helpers)
old="""    const response = await fetch(source, {cache:'force-cache'});
    if (!response.ok) throw new Error('Film download failed');
    const blob = await response.blob();
    video.src = URL.createObjectURL(blob);
    video.preload = 'auto';
    await new Promise((resolve, reject) => {
      video.addEventListener('loadeddata', resolve, {once:true});
      video.addEventListener('error', reject, {once:true});
      video.load();
    });"""
new="""    video.muted = true; video.defaultMuted = true; video.playsInline = true;
    if (mobileMedia) {
      // iOS/WeChat use native HTTPS MP4, with byte-range loading and inline decoding.
      video.src = video.dataset.src;
      video.preload = 'auto';
      video.load();
      return;
    }
    const response = await fetch(source, {cache:'force-cache'});
    if (!response.ok) throw new Error('Film download failed');
    const blob = await response.blob();
    video.src = URL.createObjectURL(blob);
    video.preload = 'auto';
    await new Promise((resolve, reject) => {
      video.addEventListener('loadeddata', resolve, {once:true});
      video.addEventListener('error', reject, {once:true});
      video.load();
    });"""
assert old in app
app=app.replace(old,new)
app=app.replace("opening = false; intro.pause(); intro.classList.add('finished'); document.body.classList.remove('is-opening');","opening = false; intro.pause(); intro.classList.add('finished'); document.body.classList.remove('is-opening');\n    if (introState === 'cover') setScene('cover');")
app=app.replace("intro.classList.remove('finished'); document.body.classList.add('is-opening'); intro.currentTime = 0;","intro.classList.remove('finished'); document.body.classList.add('is-opening'); setScene('opening'); intro.currentTime = 0;")
app=app.replace("await intro.play();","await playFilm(intro);")
app=app.replace("introState = 'about'; transitionPending = false; about.pause();","introState = 'about'; transitionPending = false; about.pause(); setScene('about-end');")
app=app.replace("introState = 'waiting'; transitionPending = true; finishIntro();","introState = 'waiting'; transitionPending = true; finishIntro(); setScene('about');")
app=app.replace("introState = 'playing'; transitionPending = false; finishIntro();","introState = 'playing'; transitionPending = false; finishIntro(); setScene('about');")
app=app.replace("await about.play();","await playFilm(about);")
app=app.replace("introState = 'cover'; about.pause();","introState = 'cover'; setScene('cover'); about.pause();")
app=app.replace("else if (opening) intro.play().catch(finishIntro);","else if (opening) playFilm(intro);")
start=app.index("  sequence.addEventListener('touchstart'")
end=app.index("  about.addEventListener('timeupdate'",start)
app=app[:start]+"""  let touchNavigation = false, touchStartX = 0;
  sequence.addEventListener('touchstart', event => {
    const point = event.touches[0];
    const end = sequence.offsetTop + sequence.offsetHeight - innerHeight;
    touchNavigation = event.touches.length === 1 && landingReady && !pageWheelLocked &&
      scrollY <= end + 2 && !event.target.closest('a,button,input,select,textarea,dialog');
    touchStartY = point?.clientY || 0; touchStartX = point?.clientX || 0;
  }, {passive:true});
  sequence.addEventListener('touchmove', event => {
    if (!touchNavigation || event.touches.length !== 1) return;
    const point = event.touches[0];
    const dy = point.clientY - touchStartY, dx = point.clientX - touchStartX;
    if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) && event.cancelable) event.preventDefault();
  }, {passive:false});
  sequence.addEventListener('touchcancel', () => { touchNavigation = false; }, {passive:true});
  sequence.addEventListener('touchend', event => {
    if (!touchNavigation) return;
    touchNavigation = false;
    const delta = touchStartY - (event.changedTouches[0]?.clientY || touchStartY);
    if (delta > 35 && introState === 'cover') startAboutTransition();
    else if (delta > 35 && (introState === 'playing' || introState === 'waiting')) finishAboutPlayback();
    else if (delta > 35 && introState === 'about') advanceAboutToHonors();
    else if (delta < -35 && introState === 'about') returnToCover();
  }, {passive:true});
""" + app[end:]
html=html.replace('id="cover" aria-label=', 'id="cover" data-scene="cover" aria-label=')
html=html.replace('<div class="stage" id="stage">','<div class="stage" id="stage" data-scene="cover">')
anchor='        </div>\n\n        <div class="cover-chrome"'
assert anchor in html
html=html.replace(anchor,'          <button id="mobile-play" class="mobile-play" type="button" hidden aria-label="播放动画">轻触播放 <span aria-hidden="true">▷</span></button>\n'+anchor,1)
html=html.replace(' muted playsinline preload=', ' muted playsinline webkit-playsinline x5-playsinline x5-video-player-type="h5-page" x5-video-player-fullscreen="false" preload=')
# Version both JS and CSS so existing mobile browser caches cannot mix old and new layers.
import re
html=re.sub(r'src="app\.js[^"]*"','src="app.js?v=20261102-mobile6"',html)
html=re.sub(r'href="style\.css[^"]*"','href="style.css?v=20261102-mobile6"',html)
css+="""
/* Mutually exclusive media surfaces avoid stale iOS composited video/canvas layers. */
.stage[data-scene]>img,.stage[data-scene]>video,.stage[data-scene]>canvas{visibility:hidden}
.stage[data-scene="cover"]>.cover-poster,.stage[data-scene="cover"]>#gaze-canvas{visibility:visible}
.stage[data-scene="opening"]>#opening{visibility:visible}
.stage[data-scene="about"]>#about-video{visibility:visible}
.stage[data-scene="about-end"]>.about-end-frame{visibility:visible;opacity:1}
.intro-sequence[data-scene] .cover-chrome,.intro-sequence[data-scene] .about-chrome{visibility:hidden}
.intro-sequence[data-scene="cover"] .cover-chrome,.intro-sequence[data-scene="opening"] .cover-chrome{visibility:visible}
.intro-sequence[data-scene="about"] .about-chrome,.intro-sequence[data-scene="about-end"] .about-chrome{visibility:visible}
.mobile-play{position:absolute;z-index:9;left:50%;top:50%;transform:translate(-50%,-50%);padding:12px 20px;border:1px solid #ccc;border-radius:999px;background:rgba(255,255,255,.96);color:#111;font:inherit;white-space:nowrap}
.mobile-play[hidden]{display:none}
@media(hover:none) and (pointer:coarse){
  .intro-sticky{height:100svh;min-height:0}
  .stage{inset:auto 0 auto;top:50%;width:100%;height:auto;aspect-ratio:16/9;transform:translateY(-50%);overflow:hidden;isolation:auto}
  .stage>img,.stage>video,.stage>canvas{inset:0;display:block;width:100%;height:100%;object-fit:contain}
  #gaze-canvas,#gaze{display:none!important}
  .stage .about-video,.stage .about-end-frame{transition:none}
  .cover-chrome,.about-chrome{transition:none}
}
"""
assert "ctx.setTransform(.5" not in app
assert 'passive:false' in app and 'video.src = video.dataset.src' in app
app=app.replace("intro.currentTime = 0;", "if (intro.readyState > 0) intro.currentTime = 0;").replace("about.currentTime = 0;", "if (about.readyState > 0) about.currentTime = 0;")
ap.write_text(app);hp.write_text(html);cp.write_text(css)
print('Mobile native video, exclusive scenes, gesture arbitration, and 16:9 media frame applied.')
