from pathlib import Path
from PIL import Image, ImageOps
import re, json

root = Path("dist")
html_path = root / "index.html"
app_path = root / "app.js"
html = html_path.read_text(encoding="utf-8")
app = app_path.read_text(encoding="utf-8")
if 'loading="lazy"' in html and re.search(r'assets/[^"]+-640\.webp', html):
    print("Responsive covers already optimized; retaining current assets.")
    raise SystemExit(0)
sources = re.findall(r'<span class="work-media"><img src="([^"]+)"', html)
assert len(sources) == 13, "Expected 13 project covers"
mapping = {}
report = {"original_cover_bytes": 0, "thumbnail_bytes": 0, "detail_bytes": 0, "covers": []}
for src in sources:
    source = root / src
    image = ImageOps.exif_transpose(Image.open(source)).convert("RGB")
    outputs = {}
    for label, width, quality in [("640",640,80),("1280",1280,82),("detail",1600,85)]:
        out = source.with_name(source.stem + "-" + label + ".webp")
        resized = image.copy()
        resized.thumbnail((width, width), Image.Resampling.LANCZOS)
        resized.save(out, "WEBP", quality=quality, method=6)
        outputs[label] = out.relative_to(root).as_posix()
    mapping[src] = outputs
    report["original_cover_bytes"] += source.stat().st_size
    report["thumbnail_bytes"] += (root / outputs["640"]).stat().st_size
    report["detail_bytes"] += (root / outputs["detail"]).stat().st_size
    report["covers"].append({"source":src, "before":source.stat().st_size, "thumbnail":(root / outputs["640"]).stat().st_size})
    old = '<span class="work-media"><img src="' + src + '"'
    attrs = ('<span class="work-media"><img src="' + outputs["640"] + '" srcset="' +
        outputs["640"] + ' 640w, ' + outputs["1280"] + ' 1280w" sizes="(max-width: 600px) 100vw, (max-width: 1000px) 50vw, 25vw" loading="lazy" decoding="async" width="1600" height="900"')
    assert old in html
    html = html.replace(old, attrs)
    app = app.replace("image:'" + src + "'", "image:'" + outputs["detail"] + "'")

# The cover already displays this still; reuse it for eye tracking instead of downloading a second 10 MB video.
html = html.replace('id="gaze" class="gaze-source" muted playsinline preload="auto"', 'id="gaze" class="gaze-source" muted playsinline preload="none"')
app = app.replace("const ctx = canvas.getContext('2d');", "const ctx = canvas.getContext('2d');\n  const gazePoster = document.querySelector('.cover-poster');")
app = app.replace("gaze.readyState < 2", "!gazePoster.complete || !gazePoster.naturalWidth")
app = app.replace("bc.drawImage(gaze, 0, 0, 2560, 1440);", "bc.drawImage(gazePoster, 0, 0, 2560, 1440);")
app = app.replace("gaze.addEventListener('loadeddata', captureGazeFrame);", "gazePoster.addEventListener('load', captureGazeFrame);")
start = app.index("  async function prepareScrubVideo() {")
end = app.index("\n  function enter()", start)
app = app[:start] + """  let aboutPreparing = false;
  async function prepareScrubVideo() {
    if (aboutPreparing || scrubReady) return;
    aboutPreparing = true;
    try {
      about.preload = 'auto';
      about.src = about.dataset.src;
      about.load();
      if (about.readyState < 1) await new Promise((resolve, reject) => {
        about.addEventListener('loadedmetadata', resolve, {once:true});
        about.addEventListener('error', reject, {once:true});
      });
      scrubReady = true;
      if (introState === 'about') setAboutEndState();
      else if (transitionPending) startAboutTransition();
      updateSequence();
    } catch { aboutPreparing = false; notice(); }
  }
""" + app[end:]
app = app.replace("(intro.readyState >= 3 ? 35 : 0) + (gaze.readyState >= 2 && eyeSprite.complete ? 30 : 0) + (scrubReady ? 35 : 0)", "(intro.readyState >= 3 ? 60 : 0) + (ready ? 40 : 0)")
app = app.replace("if (!scrubReady) { introState = 'waiting'; transitionPending = true; finishIntro(); return; }", "if (!scrubReady) { introState = 'waiting'; transitionPending = true; finishIntro(); prepareScrubVideo(); return; }")
assert "fetch(about.dataset.src)" not in app
assert "prepareScrubVideo();\n\n  function enter" not in app
assert 'loading="lazy"' in html
assert len(re.findall(r'work-media"><img[^>]+loading="lazy"', html)) == 13
for output in mapping.values():
    for path in output.values():
        with Image.open(root / path) as check:
            check.verify()
html_path.write_text(html, encoding="utf-8")
app_path.write_text(app, encoding="utf-8")
report["thumbnail_reduction_percent"] = round(100 * (1-report["thumbnail_bytes"]/report["original_cover_bytes"]),1)
Path("tools/performance-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
print(json.dumps(report,ensure_ascii=False))
