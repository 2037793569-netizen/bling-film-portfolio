const {chromium,webkit}=require('playwright'), assert=require('node:assert/strict');
async function swipe(page,delta=130) {
 return page.locator('#stage').evaluate((el,delta)=>{
  const send=(name,points)=>{const e=new Event(name,{bubbles:true,cancelable:true});Object.defineProperties(e,{touches:{value:name==='touchend'?[]:points},changedTouches:{value:points}});el.dispatchEvent(e);return e.defaultPrevented;};
  send('touchstart',[{clientX:180,clientY:540}]);
  const blocked=send('touchmove',[{clientX:180,clientY:540-delta}]);send('touchend',[{clientX:180,clientY:540-delta}]);return blocked;
 },delta);
}
async function run(engine,label) {
 const browser=await engine.launch(label==='Chrome'?{headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']}:{headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
 await context.addInitScript(()=>{
  HTMLMediaElement.prototype.play=()=>Promise.reject(new DOMException('Denied','NotAllowedError'));
  window.framePaints=[];const draw=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage=function(...args){const result=draw.apply(this,args);if(this.canvas.id==='mobile-animation')window.framePaints.push(performance.now());return result;};
 });
 let releaseFirst, releaseThird;
 const firstGate=new Promise(r=>releaseFirst=r),thirdGate=new Promise(r=>releaseThird=r);
 await context.route('**/mobile-about-frames-00.webp',async route=>{await firstGate;await route.continue();});
 await context.route('**/mobile-about-frames-02.webp',async route=>{await thirdGate;await route.continue();});
 const page=await context.newPage(),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>requests.push(r.url()));
 if(label==='Chrome'){
  const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:80,downloadThroughput:125000,uploadThroughput:125000});
 }
 await page.goto(process.env.SITE_URL||'http://127.0.0.1:8765',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#loader').hidden,null,{timeout:9000});
 if(await page.locator('#skip').isVisible())await page.locator('#skip').tap();
 assert.equal(await page.locator('#stage').getAttribute('data-scene'),'cover');
 const before=await page.locator('#stage').boundingBox();
 await page.setViewportSize({width:390,height:944});
 const after=await page.locator('#stage').boundingBox();assert(Math.abs(before.y-after.y)<2);
 assert(await swipe(page));
 assert.equal(await page.evaluate(()=>scrollY),0);
 assert.equal(await page.locator('#stage').getAttribute('data-scene'),'cover','Do not switch to an empty surface while the first chunk is pending');
 await page.waitForTimeout(300);releaseFirst();
 await page.waitForFunction(()=>document.querySelector('#mobile-animation').dataset.playing==='about',null,{timeout:15000});
 assert.equal(await page.locator('#mobile-animation').evaluate(c=>c.tagName),'CANVAS');
 await page.waitForFunction(()=>document.querySelector('#mobile-animation').dataset.frame==='23',null,{timeout:10000});
 const stalled=await page.locator('#mobile-animation').evaluate(c=>({frame:c.dataset.frame,pixels:c.toDataURL()}));
 await page.waitForTimeout(2100);
 assert.equal(await page.locator('#stage').getAttribute('data-scene'),'about','Buffering must not finish the film');
 assert.equal(await page.locator('#mobile-animation').getAttribute('data-frame'),'23');
 assert.equal(await page.locator('#mobile-animation').evaluate(c=>c.toDataURL()),stalled.pixels,'Hold a real frame rather than showing a blank image');
 releaseThird();
 await page.waitForFunction(()=>Number(document.querySelector('#mobile-animation').dataset.frame)>32,null,{timeout:10000});
 const a=await page.locator('#mobile-animation').evaluate(c=>c.toDataURL());await page.waitForTimeout(650);
 const b=await page.locator('#mobile-animation').evaluate(c=>c.toDataURL());assert.notEqual(a,b);
 await page.screenshot({path:'mobile-frames-'+label+'.png'});
 assert(await swipe(page));assert.equal(await page.locator('#stage').getAttribute('data-scene'),'about-end');
 assert(!(await swipe(page)),'Next gesture must be native scroll');
 // Go back and allow the entire film to play, including the final chunk.
 await swipe(page,-130);assert.equal(await page.locator('#stage').getAttribute('data-scene'),'cover');
 await swipe(page);
 await page.waitForFunction(()=>document.querySelector('#stage').dataset.scene==='about-end',null,{timeout:40000});
 assert(Number(await page.locator('#mobile-animation').getAttribute('data-frame'))>=190,'Finish only after the real last frame');
 const filmRequests=requests.filter(s=>/about-mobile|opening-mobile|about-hd|balanced|gaze\.mp4/.test(s));assert.equal(filmRequests.length,0,filmRequests.join('\n'));
 assert.equal(await page.locator('#mobile-play').count(),0);
 await page.locator('#works').evaluate(e=>e.scrollIntoView());
 await page.waitForFunction(()=>[...document.querySelectorAll('.work-media img')].every(i=>i.complete&&i.naturalWidth>0),null,{timeout:30000});
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS '+label+': automatic swipe playback with video denied, 4x CPU/1Mbps (Chrome), held first and middle chunks, actual frames advance and finish, stable layout, skip and native-scroll gestures, all 13 covers loaded.');
 await browser.close();
}
async function nativePlayback() {
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await context.addInitScript(()=>{
   const play=HTMLMediaElement.prototype.play;
   HTMLMediaElement.prototype.play=function(){return navigator.userActivation.isActive?play.call(this):Promise.reject(new DOMException('Gesture required','NotAllowedError'));};
 });
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(process.env.SITE_URL||'http://127.0.0.1:8765',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#loader').hidden);
 if(await page.locator('#skip').isVisible())await page.locator('#skip').tap();
 const cdp=await context.newCDPSession(page);
 await cdp.send('Network.enable');
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:100,downloadThroughput:125000,uploadThroughput:125000});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:550}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180,y:410}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.waitForFunction(()=>document.querySelector('#stage').dataset.nativeReady==='true',null,{timeout:12000});
 const time=await page.locator('#about-video').evaluate(v=>v.currentTime);await page.waitForTimeout(1200);
 assert(await page.locator('#about-video').evaluate(v=>v.currentTime)>time+.8);
 assert.equal(await page.locator('#stage').getAttribute('data-native'),'about');
 await swipe(page);assert.equal(await page.locator('#stage').getAttribute('data-scene'),'about-end');
 assert.equal(errors.length,0,errors.join('\\n'));
 console.log('PASS hardware video: initial autoplay denied, real touchend unlocks native playback at 1 Mbps; time advances and next swipe stops the film.');
 await browser.close();
}
(async()=>{await run(chromium,'Chrome');await run(webkit,'WebKit');await nativePlayback();})().catch(e=>{console.error(e);process.exit(1)});
