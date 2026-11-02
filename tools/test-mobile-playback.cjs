const { chromium, webkit } = require('playwright');
const assert=require('node:assert/strict');
async function swipe(page, delta) {
 return page.locator('#stage').evaluate((el,delta)=>{
  const point={clientX:160,clientY:500};
  const dispatch=(name,points,changed)=>{const e=new Event(name,{bubbles:true,cancelable:true});Object.defineProperties(e,{touches:{value:points},changedTouches:{value:changed||points}});el.dispatchEvent(e);return e.defaultPrevented;};
  dispatch('touchstart',[point]);
  const prevented=dispatch('touchmove',[{clientX:160,clientY:500-delta}]);
  dispatch('touchend',[],[{clientX:160,clientY:500-delta}]);
  return prevented;
 },delta);
}
async function visible(page) {
 return page.locator('#stage').evaluate(el=>[...el.querySelectorAll(':scope > img,:scope > video,:scope > canvas')].filter(e=>{const s=getComputedStyle(e);return s.display!=='none'&&s.visibility==='visible'&&Number(s.opacity)>.01}).map(e=>e.id||e.className));
}
async function run(engine,name) {
 const browser=await engine.launch(name==='Chrome'?{executablePath:'/usr/bin/google-chrome',args:['--no-sandbox'],headless:true}:{headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:8765',{waitUntil:'domcontentloaded'});
 await page.locator('#enter-now').tap();
 await page.waitForTimeout(1200);
 if(await page.locator('#mobile-play').isVisible())await page.locator('#mobile-play').tap();
 await page.waitForFunction(()=>document.querySelector('#opening').currentTime>.3);
 assert.equal(await page.locator('#opening').evaluate(v=>v.currentSrc.startsWith('blob:')),false);
 assert.deepEqual(await visible(page),['opening']);
 await page.locator('#skip').tap();
 assert.deepEqual(await visible(page),['cover-poster']);
 assert.equal(await page.locator('#gaze-canvas').evaluate(e=>e.width),1);
 const frame=await page.locator('#stage').boundingBox();
 assert(Math.abs(frame.width/frame.height-16/9)<.02);
 assert(await swipe(page,120),'Intro touchmove should suppress native momentum');
 await page.waitForTimeout(500);
 if(await page.locator('#mobile-play').isVisible())await page.locator('#mobile-play').tap();
 await page.waitForFunction(()=>document.querySelector('#about-video').currentTime>.3 || !document.querySelector('#mobile-play').hidden);
 if(await page.locator('#mobile-play').isVisible()) await page.locator('#mobile-play').tap();
 try { await page.waitForFunction(()=>document.querySelector('#about-video').currentTime>.3); } catch(e) { console.log('ABOUT DIAGNOSTICS '+name,await page.evaluate(()=>({scene:document.querySelector('#stage').dataset.scene,y:scrollY,inner:innerHeight,sequenceHeight:document.querySelector('#cover').offsetHeight,scrollHeight:document.documentElement.scrollHeight,bodyOverflow:getComputedStyle(document.body).overflow,seeking:document.querySelector('#about-video').seeking,opacity:getComputedStyle(document.querySelector('#about-video')).opacity,visibility:getComputedStyle(document.querySelector('#about-video')).visibility,retry:document.querySelector('#mobile-play').hidden,rect:document.querySelector('#about-video').getBoundingClientRect().toJSON(),videos:[...document.querySelectorAll('video')].map(v=>({id:v.id,src:v.currentSrc,time:v.currentTime,paused:v.paused,ready:v.readyState,error:v.error?.message}))})));throw e; }
 assert.deepEqual(await visible(page),['about-video']);
 assert(await swipe(page,120));
 await page.waitForTimeout(800);
 assert.equal(await page.locator('#stage').getAttribute('data-scene'),'about-end');
 assert.deepEqual(await visible(page),['about-end-frame']);
 assert(await swipe(page,120));
 await page.waitForTimeout(1200);
 assert(await page.locator('#honors').evaluate(e=>Math.abs(e.getBoundingClientRect().top)<25));
 // Closed mobile navigation must not block taps or cause horizontal overflow.
 await page.locator('#menu-button').tap();
 await page.locator('#main-nav a[href="#cover"]').tap();
 await page.waitForTimeout(1200);
 assert.deepEqual(await visible(page),['cover-poster']);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.setViewportSize({width:844,height:390});
 const landscape=await page.locator('#stage').boundingBox();
 assert(Math.abs(landscape.width/landscape.height-16/9)<.02);
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS '+name+': inline native MP4 playback, one media surface, 16:9 frame, swipe arbitration, finish then advance, return navigation, portrait/landscape, no script errors.');
 // Simulate low-power autoplay denial and verify a real tap resumes it.
 const blocked=await context.newPage();
 await blocked.addInitScript(()=>{
  const native=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(){if(this.id==='opening'&&!this.dataset.denied){this.dataset.denied='1';return Promise.reject(new DOMException('Autoplay denied','NotAllowedError'));}return native.call(this);};
 });
 await blocked.goto('http://127.0.0.1:8765',{waitUntil:'domcontentloaded'});
 await blocked.locator('#enter-now').tap();
 await blocked.locator('#mobile-play').waitFor({state:'visible'});
 await blocked.locator('#mobile-play').tap();
 await blocked.waitForFunction(()=>document.querySelector('#opening').currentTime>.3);
 assert(!(await blocked.locator('#mobile-play').isVisible()));
 console.log('PASS '+name+': autoplay-denied fallback resumes on tap.');
 await browser.close();
}
(async()=>{await run(chromium,'Chrome');await run(webkit,'WebKit');})().catch(e=>{console.error(e);process.exit(1);});
