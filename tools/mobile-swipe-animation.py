from pathlib import Path
import subprocess,json,re
p=Path('dist');ap=p/'app.js';hp=p/'index.html'
app=ap.read_text();html=hp.read_text()
assert 'function playMobileFilm' not in app
report={}
for name in ['opening','about']:
    src=p/'assets'/f'{name}.mp4';target=p/'assets'/f'{name}-mobile.webp'
    subprocess.run(['ffmpeg','-y','-i',str(src),'-vf','fps=24,scale=960:-2','-c:v','libwebp_anim','-lossless','0','-q:v','78','-compression_level','5','-loop','1','-an',str(target)],check=True)
    probe=json.loads(subprocess.check_output(['ffprobe','-v','quiet','-show_format','-of','json',str(src)]))
    report[name]={'bytes':target.stat().st_size,'duration':float(probe['format']['duration']),'width':960,'fps':24}
html=re.sub(r'\s*<button id="mobile-play".*?</button>','',html)
html=html.replace('<div class="stage" id="stage" data-scene="cover">','<div class="stage" id="stage" data-scene="cover">\n          <img id="mobile-animation" class="mobile-animation" alt="" aria-hidden="true">')
html=re.sub(r'src="app\.js[^"]*"','src="app.js?v=20261102-swipe7"',html)
html=re.sub(r'href="style\.css[^"]*"','href="style.css?v=20261102-swipe7"',html)
app=app.replace("const stage = $('stage'), playbackRetry = $('mobile-play');","const stage = $('stage');")
app=app.replace("stage.dataset.scene = scene; sequence.dataset.scene = scene; playbackRetry.hidden = true;","stage.dataset.scene = scene; sequence.dataset.scene = scene;")
begin=app.index('  function playFilm(video) {')
end=app.index('  async function bufferFilm(video) {',begin)
app=app[:begin]+"""  function playFilm(video) {
    video.muted = true; video.defaultMuted = true; video.playsInline = true;
    return Promise.resolve(video.play());
  }
""" + app[end:]
# Mobile animated images run without video-autoplay authorization or decoder switching.
native_begin=app.index('    if (mobileMedia) {',app.index('  async function bufferFilm'))
native_end=app.index('    const response = await fetch(source',native_begin)
app=app[:native_begin]+"    if (mobileMedia) return;\n"+app[native_end:]
durations={name:r['duration'] for name,r in report.items()}
mobile="""  const mobileAnimation = $('mobile-animation');
  const mobileDurations = DURATIONS;
  const mobileFilms = new Map();
  let mobileOpeningReady = false, mobileRun = 0, mobileAnimationURL = null, mobileClock = 0;
  function preloadMobileFilm(kind) {
    if (!mobileFilms.has(kind)) {
      const promise = fetch('assets/' + kind + '-mobile.webp', {cache:'force-cache'})
        .then(response => { if (!response.ok) throw new Error('Animation download failed'); return response.blob(); });
      mobileFilms.set(kind, promise);
      promise.catch(() => mobileFilms.delete(kind));
    }
    return mobileFilms.get(kind);
  }
  function stopMobileFilm() {
    mobileRun++;
    cancelAnimationFrame(mobileClock); mobileClock = 0;
    mobileAnimation.onload = null;
    mobileAnimation.removeAttribute('src');
    delete mobileAnimation.dataset.playing;
    if (mobileAnimationURL) { URL.revokeObjectURL(mobileAnimationURL); mobileAnimationURL = null; }
  }
  function playMobileFilm(kind) {
    stopMobileFilm();
    const run = mobileRun;
    // A still remains visible while the cached animation bytes are being prepared.
    mobileAnimation.src = kind === 'opening' ? intro.poster : about.poster;
    preloadMobileFilm(kind).then(blob => {
      if (run !== mobileRun || stage.dataset.scene !== (kind === 'opening' ? 'opening' : 'about')) return;
      mobileAnimationURL = URL.createObjectURL(blob);
      mobileAnimation.onload = () => {
        if (run !== mobileRun) return;
        mobileAnimation.onload = null;
        mobileAnimation.dataset.playing = kind;
        const started = performance.now(), duration = mobileDurations[kind] * 1000;
        let lastUI = -100;
        function tick(now) {
          if (run !== mobileRun) return;
          const elapsed = now - started, progress = Math.min(1, elapsed / duration);
          if (kind === 'about' && elapsed - lastUI > 80) {
            lastUI = elapsed;
            $('sequence-progress').style.width = (progress * 100) + '%';
            document.documentElement.style.setProperty('--about-fade', String(Math.max(0, Math.min(1, (progress - .68) / .2))));
          }
          if (elapsed >= duration) {
            if (kind === 'opening') finishIntro();
            else { setAboutEndState(); updateSequence(); }
          } else { mobileClock = requestAnimationFrame(tick); }
        }
        mobileClock = requestAnimationFrame(tick);
      };
      mobileAnimation.src = mobileAnimationURL;
    }).catch(() => {
      if (run !== mobileRun) return;
      if (kind === 'opening') finishIntro(); else setAboutEndState();
    });
  }
""".replace('DURATIONS',json.dumps(durations))
app=app.replace("  let introPlaybackToken = 0",mobile+"\n  let introPlaybackToken = 0")
app=app.replace("  function finishIntro() {\n", "  function finishIntro() {\n    if (mobileMedia) stopMobileFilm();\n")
app=app.replace("    prepareIntroVideo().then(prepareScrubVideo).catch(() => {});","    if (!mobileMedia) prepareIntroVideo().then(prepareScrubVideo).catch(() => {});")
app=app.replace("  async function playIntro() {\n    if (!entered) return;", """  async function playIntro() {
    if (!entered) return;
    if (mobileMedia) {
      forcePageTop(); opening = true; intro.classList.remove('finished');
      document.body.classList.add('is-opening'); setScene('opening'); playMobileFilm('opening'); return;
    }""")
app=app.replace("  prepareIntroVideo().then(() => setTimeout(prepareScrubVideo, 800)).catch(notice);", """  if (mobileMedia) {
    preloadMobileFilm('opening').then(() => {
      mobileOpeningReady = true; return preloadMobileFilm('about');
    }).catch(() => {});
  } else prepareIntroVideo().then(() => setTimeout(prepareScrubVideo, 800)).catch(notice);""")
app=app.replace("(intro.readyState >= 3 ? 60 : 0)", "((mobileMedia ? mobileOpeningReady : intro.readyState >= 3) ? 60 : 0)")
app=app.replace("  function setAboutEndState() {","  function setAboutEndState() {\n    if (mobileMedia) stopMobileFilm();")
app=app.replace("    if (introState === 'playing' || introState === 'about') return;\n", """    if (introState === 'playing' || introState === 'about') return;
    if (mobileMedia) {
      stopMobileFilm(); opening = false; introPlaybackToken++;
      intro.classList.add('finished'); document.body.classList.remove('is-opening');
      $('stage').classList.remove('about-quick-finish');
      introState = 'playing'; transitionPending = false;
      setScene('about'); setVisualState(0, 1, 0); $('sequence-progress').style.width = '0%';
      scrollTo({top:sequence.offsetTop + sequence.offsetHeight - innerHeight, behavior:'auto'});
      playMobileFilm('about'); return;
    }
""",1)
app=app.replace("  function resetToCover() {","  function resetToCover() {\n    if (mobileMedia) stopMobileFilm();")
app=app.replace("}, reduced ? 100 : 900);","}, (reduced || mobileMedia) ? 150 : 900);")
app=app.replace("}, 650);","}, mobileMedia ? 150 : 650);")
app=app.replace("else if (opening) playFilm(intro);","else if (opening && !mobileMedia) playFilm(intro);")
assert 'playbackRetry' not in app
css=p/'style.css';style=css.read_text()
style+="""
.mobile-animation{display:none!important}
@media(hover:none) and (pointer:coarse){
  .stage>video{display:none!important}
  .stage[data-scene="opening"]>#mobile-animation,.stage[data-scene="about"]>#mobile-animation{
    display:block!important;visibility:visible;opacity:1;z-index:4
  }
  .mobile-play{display:none!important}
  .site-header{backdrop-filter:none;-webkit-backdrop-filter:none}
}
"""
ap.write_text(app);hp.write_text(html);css.write_text(style)
Path('tools/mobile-animation-report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
