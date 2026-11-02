from pathlib import Path
import subprocess, json, re

root=Path('dist')
report={}
for name in ['opening','about']:
    source=root/'assets'/f'{name}.mp4'
    target=root/'assets'/f'{name}-stream.mp4'
    subprocess.run(['ffmpeg','-y','-i',str(source),'-vf',"scale='min(1280,iw)':-2",'-r','24','-c:v','libx264','-preset','slow','-crf','25','-maxrate','1400k','-bufsize','2800k','-pix_fmt','yuv420p','-profile:v','main','-g','48','-an','-movflags','+faststart',str(target)],check=True)
    probe=json.loads(subprocess.check_output(['ffprobe','-v','quiet','-show_format','-show_streams','-of','json',str(target)]))
    report[name]={'before':source.stat().st_size,'after':target.stat().st_size,'duration':float(probe['format']['duration']),'width':probe['streams'][0]['width'],'height':probe['streams'][0]['height']}
html_path=root/'index.html'; app_path=root/'app.js'
html=html_path.read_text(); app=app_path.read_text()
assert 'opening-stream.mp4' not in html, 'Video fix already applied'
html=html.replace('data-src="assets/about.mp4"','data-src="assets/about-stream.mp4"')
html=html.replace('id="opening" class="opening" muted playsinline preload="auto"','id="opening" class="opening" muted playsinline preload="none" data-src="assets/opening-stream.mp4"')
html=html.replace('<source src="assets/opening.mp4" type="video/mp4">','')
# Keep pointer eye tracking at half the canvas dimensions to reduce redraw work.
html=html.replace('id="gaze-canvas" width="2560" height="1440"','id="gaze-canvas" width="1280" height="720"')
app=app.replace("const ctx = canvas.getContext('2d');","const ctx = canvas.getContext('2d');\n  ctx.setTransform(.5, 0, 0, .5, 0, 0);")
app=app.replace("base.width = 2560; base.height = 1440;","base.width = 1280; base.height = 720;")
app=app.replace("bc.drawImage(gazePoster, 0, 0, 2560, 1440);","bc.drawImage(gazePoster, 0, 0, 1280, 720);")
app=app.replace("ctx.drawImage(base, 0, 0);","ctx.drawImage(base, 0, 0, 2560, 1440);")
start=app.index('  function finishIntro() {')
end=app.index('\n  function enter()',start)
app=app[:start]+"""  let introPlaybackToken = 0, introPreparation = null, aboutPreparation = null;
  async function bufferFilm(video) {
    const response = await fetch(video.dataset.src, {cache:'force-cache'});
    if (!response.ok) throw new Error('Film download failed');
    const blob = await response.blob();
    video.src = URL.createObjectURL(blob);
    video.preload = 'auto';
    await new Promise((resolve, reject) => {
      video.addEventListener('loadeddata', resolve, {once:true});
      video.addEventListener('error', reject, {once:true});
      video.load();
    });
  }
  function prepareIntroVideo() {
    if (!introPreparation) introPreparation = bufferFilm(intro).catch(error => {
      introPreparation = null; throw error;
    });
    return introPreparation;
  }
  function finishIntro() {
    introPlaybackToken++;
    opening = false; intro.pause(); intro.classList.add('finished'); document.body.classList.remove('is-opening');
    captureGazeFrame(); drawEyes(); updateSequence();
    prepareIntroVideo().then(prepareScrubVideo).catch(() => {});
  }
  async function playIntro() {
    if (!entered) return;
    const token = ++introPlaybackToken;
    forcePageTop(); opening = true;
    try {
      await prepareIntroVideo();
      if (token !== introPlaybackToken || !opening) return;
      canvas.style.opacity = '0';
      intro.classList.remove('finished'); document.body.classList.add('is-opening'); intro.currentTime = 0;
      await intro.play();
    } catch { if (token === introPlaybackToken) { finishIntro(); notice(); } }
  }
  function prepareScrubVideo() {
    if (aboutPreparation) return aboutPreparation;
    aboutPreparation = bufferFilm(about).then(() => {
      scrubReady = true;
      if (introState === 'about') setAboutEndState();
      else if (transitionPending) startAboutTransition();
      updateSequence();
    }).catch(() => { aboutPreparation = null; notice(); });
    return aboutPreparation;
  }
  // Download in sequence: opening first, then the short introduction in the background.
  prepareIntroVideo().then(() => setTimeout(prepareScrubVideo, 800)).catch(notice);
""" + app[end:]
app=app.replace("about.playbackRate = 1.25;","about.playbackRate = 1;")
# Starting the second film while it buffers must move to its page immediately,
# so a subsequent intentional wheel gesture can finish it without a scroll reset.
app=app.replace("if (!scrubReady) { introState = 'waiting'; transitionPending = true; finishIntro(); prepareScrubVideo(); return; }",
"""if (!scrubReady) {
      introState = 'waiting'; transitionPending = true; finishIntro();
      setVisualState(0, 1, 0);
      document.documentElement.style.scrollBehavior = 'auto';
      scrollTo(0, sequence.offsetTop + sequence.offsetHeight - innerHeight);
      requestAnimationFrame(() => document.documentElement.style.removeProperty('scroll-behavior'));
      prepareScrubVideo(); return;
    }""")
# Prevent an aborted play promise from undoing an intentional skip.
app=app.replace("try { await about.play(); } catch { setAboutEndState(); }","try { await about.play(); } catch { if (introState === 'playing') setAboutEndState(); }")
html_path.write_text(html); app_path.write_text(app)
Path('tools/video-report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
