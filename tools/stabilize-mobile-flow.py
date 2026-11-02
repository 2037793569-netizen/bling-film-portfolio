from pathlib import Path
import subprocess,re,json
p=Path('dist');ap=p/'app.js';hp=p/'index.html';cp=p/'style.css'
app=ap.read_text();html=hp.read_text();css=cp.read_text()
target=p/'assets/about-mobile-v2.webp'
subprocess.run(['ffmpeg','-y','-i',str(p/'assets/about.mp4'),'-vf','fps=24,scale=800:-2','-c:v','libwebp_anim','-lossless','0','-q:v','70','-compression_level','6','-loop','1','-an',str(target)],check=True)
report={'about_before_bytes':(p/'assets/about-mobile.webp').stat().st_size,'about_after_bytes':target.stat().st_size,'fps':24,'width':800}
app=app.replace("let mobileOpeningReady = false,", "let mobileOpeningReady = false,")
anchor="  const mobileAnimation = $('mobile-animation');"
viewport="""  // Keep the hero geometry stable when the WeChat address/tool bars expand or collapse.
  let mobileViewportWidth = innerWidth;
  function setMobileScreen() {
    if (!mobileMedia) return;
    document.documentElement.style.setProperty('--mobile-screen', Math.round(visualViewport?.height || innerHeight) + 'px');
  }
  setMobileScreen();
  addEventListener('resize', () => {
    if (mobileMedia && Math.abs(innerWidth - mobileViewportWidth) > 100) {
      mobileViewportWidth = innerWidth; setMobileScreen();
    }
  }, {passive:true});
"""
assert anchor in app
app=app.replace(anchor,viewport+anchor)
app=app.replace("fetch('assets/' + kind + '-mobile.webp', {cache:'force-cache'})","fetch(kind === 'about' ? 'assets/about-mobile-v2.webp' : 'assets/opening-mobile.webp', {cache:'force-cache', priority:kind === 'opening' ? 'high' : 'low'})")
app=app.replace("mobileAnimation.src = kind === 'opening' ? intro.poster : about.poster;","mobileAnimation.src = kind === 'opening' ? intro.poster : gazePoster.src;")
# Do not make the mobile copy appear several seconds after the artwork.
app=app.replace("document.documentElement.style.setProperty('--about-fade', String(Math.max(0, Math.min(1, (progress - .68) / .2))));","document.documentElement.style.setProperty('--about-fade', '1');")
app=app.replace("""    preloadMobileFilm('opening').then(() => {
      mobileOpeningReady = true; return preloadMobileFilm('about');
    }).catch(() => {});""","""    preloadMobileFilm('opening').then(() => { mobileOpeningReady = true; }).catch(() => {});
    preloadMobileFilm('about').catch(() => {});""")
app=app.replace("if (reduced) finishIntro(); else playIntro();","if (reduced || (mobileMedia && !mobileOpeningReady)) finishIntro(); else playIntro();")
app=app.replace("(reduced ? 9 : 30)","(reduced ? 9 : mobileMedia ? 12 : 30)")
app=app.replace("(reduced ? 900 : 3100)","(reduced ? 900 : mobileMedia ? 1200 : 3100)").replace("elapsed > 7000","elapsed > (mobileMedia ? 2200 : 7000)")
old="""      setScene('about'); setVisualState(0, 1, 0); $('sequence-progress').style.width = '0%';
      scrollTo({top:sequence.offsetTop + sequence.offsetHeight - innerHeight, behavior:'auto'});
      playMobileFilm('about'); return;"""
new="""      setScene('about'); setVisualState(0, 1, 1); $('sequence-progress').style.width = '0%';
      playMobileFilm('about'); return;"""
assert old in app
app=app.replace(old,new)
start=app.index('    const p = sequenceProgress();',app.index('  function updateSequence()'))
app=app[:start]+"""    if (mobileMedia) {
      const atHero = scrollY <= sequence.offsetTop + 4;
      $('site-header').classList.toggle('over-intro', atHero);
      if (atHero) document.querySelectorAll('#main-nav a').forEach(link =>
        link.classList.toggle('active', link.getAttribute('href') === (introState === 'cover' ? '#cover' : '#about')));
      return;
    }
""" + app[start:]
app=app.replace("(reduced || mobileMedia) ? 150 : 900","(reduced || mobileMedia) ? 0 : 900").replace("mobileMedia ? 150 : 650","mobileMedia ? 0 : 650")
start=app.index("  let touchNavigation = false")
end=app.index("  about.addEventListener('timeupdate'",start)
app=app[:start]+"""  let touchNavigation = false, touchStartX = 0, touchConsumed = false;
  function changeMobileScene(delta) {
    if (delta > 0 && introState === 'cover') startAboutTransition();
    else if (delta > 0 && (introState === 'playing' || introState === 'waiting')) finishAboutPlayback();
    else if (delta < 0 && introState === 'about') returnToCover();
  }
  sequence.addEventListener('touchstart', event => {
    const point = event.touches[0];
    const end = sequence.offsetTop + sequence.offsetHeight - innerHeight;
    touchNavigation = event.touches.length === 1 && landingReady && !pageWheelLocked &&
      (mobileMedia ? scrollY <= sequence.offsetTop + 4 : scrollY <= end + 2) &&
      !event.target.closest('a,button,input,select,textarea,dialog');
    touchConsumed = false;
    touchStartY = point?.clientY || 0; touchStartX = point?.clientX || 0;
  }, {passive:true});
  sequence.addEventListener('touchmove', event => {
    if (touchConsumed) { if (event.cancelable) event.preventDefault(); return; }
    if (!touchNavigation || event.touches.length !== 1) return;
    const point = event.touches[0];
    const delta = touchStartY - point.clientY, dx = point.clientX - touchStartX;
    if (Math.abs(delta) <= Math.abs(dx) || Math.abs(delta) < 8) return;
    // Once the introduction finishes, the next upward swipe scrolls the document naturally.
    if (mobileMedia && introState === 'about' && delta > 0) { touchNavigation = false; return; }
    if (event.cancelable) event.preventDefault();
    if (mobileMedia && Math.abs(delta) >= 35) {
      touchConsumed = true; touchNavigation = false; changeMobileScene(delta);
    }
  }, {passive:false});
  sequence.addEventListener('touchcancel', () => { touchNavigation = touchConsumed = false; }, {passive:true});
  sequence.addEventListener('touchend', event => {
    if (touchConsumed) { touchConsumed = touchNavigation = false; return; }
    if (!touchNavigation) return;
    touchNavigation = false;
    const delta = touchStartY - (event.changedTouches[0]?.clientY || touchStartY);
    if (mobileMedia) { if (Math.abs(delta) > 35) changeMobileScene(delta); return; }
    if (delta > 35 && introState === 'cover') startAboutTransition();
    else if (delta > 35 && (introState === 'playing' || introState === 'waiting')) finishAboutPlayback();
    else if (delta > 35 && introState === 'about') advanceAboutToHonors();
    else if (delta < -35 && introState === 'about') returnToCover();
  }, {passive:true});
""" + app[end:]
css+="""
/* Mobile uses one stable viewport; the next swipe returns to normal document scrolling. */
@media(hover:none) and (pointer:coarse){
 .intro-sequence{height:var(--mobile-screen,100svh);min-height:0}
 .intro-sticky{position:relative;height:100%;min-height:0}
 .stage{top:50%}
 .motion-ready .snap-page>*{opacity:1;transform:none;transition:none}
 .recognition-ticker{animation-play-state:paused}
 .recognition.is-active .recognition-ticker{animation-play-state:running}
 .cover-chrome,.about-chrome{transition:none}
}
"""
html=re.sub(r'src="app\.js[^"]*"','src="app.js?v=20261102-stable8"',html)
html=re.sub(r'href="style\.css[^"]*"','href="style.css?v=20261102-stable8"',html)
ap.write_text(app);hp.write_text(html);cp.write_text(css)
Path('tools/stable-mobile-report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
