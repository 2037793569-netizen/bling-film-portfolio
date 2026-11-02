from pathlib import Path
import subprocess,json
root=Path('dist');hp=root/'index.html';ap=root/'app.js'
html=hp.read_text();app=ap.read_text()
report={}
for name in ['opening','about']:
    src=root/'assets'/f'{name}.mp4';out=root/'assets'/f'{name}-balanced.mp4'
    if not out.exists():
        subprocess.run(['ffmpeg','-y','-i',str(src),'-vf',"scale='min(1920,iw)':-2",'-r','24','-c:v','libx264','-preset','slow','-crf','21','-maxrate','2200k','-bufsize','4400k','-pix_fmt','yuv420p','-profile:v','main','-g','48','-an','-movflags','+faststart',str(out)],check=True)
    report[name]={'balanced_bytes':out.stat().st_size}
    old=f'data-src-hd="assets/{name}-hd.mp4"'
    html=html.replace(old,f'data-src-balanced="assets/{name}-balanced.mp4"')
old="""    const useHD = innerWidth >= 1100 || innerWidth * (devicePixelRatio || 1) > 1600;
    const source = useHD && video.dataset.srcHd ? video.dataset.srcHd : video.dataset.src;"""
new="""    const connection = navigator.connection;
    // Unknown or slower networks use the fully buffered lightweight film.
    // Only request 1080p when both the connection and decoder can handle it.
    let useBalanced = innerWidth >= 1000 && connection && !connection.saveData &&
      connection.effectiveType === '4g' && connection.downlink >= 5;
    if (useBalanced && navigator.mediaCapabilities) {
      try {
        const support = await navigator.mediaCapabilities.decodingInfo({
          type:'file', video:{contentType:'video/mp4; codecs="avc1.4D4028"',
          width:1920, height:1080, bitrate:2200000, framerate:24}
        });
        useBalanced = support.supported && support.smooth && support.powerEfficient;
      } catch { useBalanced = false; }
    } else { useBalanced = false; }
    const source = useBalanced && video.dataset.srcBalanced ? video.dataset.srcBalanced : video.dataset.src;"""
assert old in app
app=app.replace(old,new)
html=html.replace('app.js?v=20261102-sharp3','app.js?v=20261102-adaptive4')
assert 'width="2560" height="1440"' in html
assert 'ctx.setTransform(.5' not in app
hp.write_text(html);ap.write_text(app)
Path('tools/adaptive-video-report.json').write_text(json.dumps(report,indent=2))
test=Path('tools/test-video-playback.cjs').read_text()
test=test.replace("evaluate(c=>c.width),1280","evaluate(c=>c.width),2560")
# Ensure the normal interaction test also covers the crisp canvas and lightweight video.
test=test.replace("const opening=await","assert(await page.locator('#opening').evaluate(v=>v.videoWidth)<=1920);\n const opening=await")
test=test.replace("await browser.close();", """
 const slow = await browser.newPage({viewport:{width:1440,height:900}});
 await slow.addInitScript(() => Object.defineProperty(navigator,'connection',{value:{effectiveType:'3g',downlink:1,saveData:false}}));
 const client=await slow.context().newCDPSession(slow);
 await client.send('Network.enable');
 await client.send('Network.emulateNetworkConditions',{offline:false,latency:100,downloadThroughput:125000,uploadThroughput:125000});
 await slow.goto('http://127.0.0.1:8765',{waitUntil:'domcontentloaded'});
 await slow.locator('#enter-now').click();
 await slow.waitForFunction(()=>document.querySelector('#opening').currentTime>.4,null,{timeout:20000});
 assert.equal(await slow.locator('#opening').evaluate(v=>v.videoWidth),1280);
 const before=await slow.locator('#opening').evaluate(v=>v.currentTime);
 await slow.waitForTimeout(1200);
 assert(await slow.locator('#opening').evaluate(v=>v.currentTime)>before+.8);
 await slow.locator('#skip').click();
 await slow.locator('#main-nav a[href="#about"]').click();
 await slow.waitForFunction(()=>document.querySelector('#about-video').currentTime>.4,null,{timeout:20000});
 assert.equal(await slow.locator('#about-video').evaluate(v=>v.videoWidth),1280);
 const aboutBefore=await slow.locator('#about-video').evaluate(v=>v.currentTime);
 await slow.waitForTimeout(1200);
 assert(await slow.locator('#about-video').evaluate(v=>v.currentTime)>aboutBefore+.8);
 console.log('PASS: throttled 1 Mbps network selects buffered 720p and both videos advance continuously; native 2560px static canvas retained.');
 await browser.close();
""")
Path('tools/test-adaptive-video.cjs').write_text(test)
print(json.dumps(report))
