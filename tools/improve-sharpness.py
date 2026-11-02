from pathlib import Path
import subprocess,json
root=Path('dist'); hp=root/'index.html'; ap=root/'app.js'
html=hp.read_text(); app=ap.read_text()
report={}
for name in ['opening','about']:
    source=root/'assets'/f'{name}.mp4'; target=root/'assets'/f'{name}-hd.mp4'
    if not target.exists():
        subprocess.run(['ffmpeg','-y','-i',str(source),'-vf',"scale='min(2560,iw)':-2",'-r','24','-c:v','libx264','-preset','slow','-crf','19','-maxrate','5000k','-bufsize','10000k','-pix_fmt','yuv420p','-g','48','-an','-movflags','+faststart',str(target)],check=True)
    probe=json.loads(subprocess.check_output(['ffprobe','-v','quiet','-show_format','-show_streams','-of','json',str(target)]))
    report[name]={'original_bytes':source.stat().st_size,'hd_bytes':target.stat().st_size,'width':probe['streams'][0]['width'],'height':probe['streams'][0]['height']}
    old=f'data-src="assets/{name}-stream.mp4"'
    if f'data-src-hd="assets/{name}-hd.mp4"' not in html:
        assert old in html
        html=html.replace(old,old+f' data-src-hd="assets/{name}-hd.mp4"')
html=html.replace('id="gaze-canvas" width="1280" height="720"','id="gaze-canvas" width="2560" height="1440"')
app=app.replace("  ctx.setTransform(.5, 0, 0, .5, 0, 0);\n","")
app=app.replace("base.width = 1280; base.height = 720;","base.width = 2560; base.height = 1440;")
app=app.replace("bc.drawImage(gazePoster, 0, 0, 1280, 720);","bc.drawImage(gazePoster, 0, 0, 2560, 1440);\n    ctx.drawImage(base, 0, 0);")
app=app.replace("ctx.clearRect(0, 0, 2560, 1440); ctx.drawImage(base, 0, 0, 2560, 1440);","ctx.clearRect(eyeCrop.x, eyeCrop.y, eyeCrop.w, eyeCrop.h);\n    ctx.drawImage(base, eyeCrop.x, eyeCrop.y, eyeCrop.w, eyeCrop.h, eyeCrop.x, eyeCrop.y, eyeCrop.w, eyeCrop.h);")
app=app.replace("const response = await fetch(video.dataset.src, {cache:'force-cache'});","const useHD = innerWidth >= 1100 || innerWidth * (devicePixelRatio || 1) > 1600;\n    const source = useHD && video.dataset.srcHd ? video.dataset.srcHd : video.dataset.src;\n    const response = await fetch(source, {cache:'force-cache'});")
html=html.replace('app.js?v=20261102-video2','app.js?v=20261102-sharp3')
assert 'ctx.setTransform(.5' not in app
assert 'video.dataset.srcHd' in app
hp.write_text(html);ap.write_text(app)
Path('tools/sharpness-report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
# Extend the existing playback test to check actual HD decode and full-resolution canvas.
test=Path('tools/test-video-playback.cjs').read_text()
test=test.replace("evaluate(c=>c.width),1280","evaluate(c=>c.width),2560")
test=test.replace("const opening=await", "assert(await page.locator('#opening').evaluate(v=>v.videoWidth)>=1920);\n const opening=await")
test=test.replace("const about=await", "assert(await page.locator('#about-video').evaluate(v=>v.videoWidth)>=1920);\n const about=await")
Path('tools/test-sharpness.cjs').write_text(test)
