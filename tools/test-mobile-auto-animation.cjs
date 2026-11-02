const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
async function swipe(page,dy=120){
 return page.locator('#stage').evaluate((el,dy)=>{
  const send=(type,touches,changed)=>{const event=new Event(type,{bubbles:true,cancelable:true});Object.defineProperties(event,{touches:{value:touches},changedTouches:{value:changed||touches}});el.dispatchEvent(event);return event.defaultPrevented;};
  send('touchstart',[{clientX:180,clientY:500}]);
  const prevented=send('touchmove',[{clientX:180,clientY:500-dy}]);
  send('touchend',[],[{clientX:180,clientY:500-dy}]);return prevented;
 },dy);
}
async function run(engine,name){
 const browser=await engine.launch(name==='Chrome'?{executablePath:'/usr/bin/google-chrome',args:['--no-sandbox'],headless:true}:{headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,hasTouch:true,isMobile:true});
 // Stronger than normal low-power policy: every media play request is rejected.
 await context.addInitScript(()=>{window.videoPlayAttempts=0;HTMLMediaElement.prototype.play=function(){window.videoPlayAttempts++;return Promise.reject(new DOMException('Video autoplay blocked','NotAllowedError'));};});
 const page=await context.newPage();const errors=[];const mp4=[];
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('request',r=>{if(r.url().includes('.mp4'))mp4.push(r.url());});
 await page.goto('http://127.0.0.1:8765',{waitUntil:'domcontentloaded'});
 await page.locator('#enter-now').tap();
 await page.waitForFunction(()=>document.querySelector('#mobile-animation').dataset.playing==='opening');
 const frame1=await page.locator('#stage').screenshot();await page.waitForTimeout(550);
 const frame2=await page.locator('#stage').screenshot();
 assert(!frame1.equals(frame2),name+' opening pixels must animate');
 assert.equal(await page.locator('#mobile-play').count(),0);
 await page.locator('#skip').tap();
 assert.equal(await page.locator('#stage').getAttribute('data-scene'),'cover');
 assert(await swipe(page));
 await page.waitForFunction(()=>document.querySelector('#mobile-animation').dataset.playing==='about');
 const about1=await page.locator('#stage').screenshot();await page.waitForTimeout(600);
 const about2=await page.locator('#stage').screenshot();
 assert(!about1.equals(about2),name+' second animation pixels must advance after swipe');
 assert(await swipe(page));
 await page.waitForTimeout(220);
 assert.equal(await page.locator('#stage').getAttribute('data-scene'),'about-end');
 assert(await swipe(page));
 await page.waitForTimeout(350);
 assert(await page.locator('#honors').evaluate(e=>Math.abs(e.getBoundingClientRect().top)<25));
 await page.locator('#menu-button').tap();await page.locator('#main-nav a[href="#cover"]').tap();
 await page.waitForTimeout(350);
 assert.equal(await page.locator('#stage').getAttribute('data-scene'),'cover');
 // Background loads must not replay an animation that was intentionally skipped.
 assert(await swipe(page));assert(await swipe(page));
 await page.waitForTimeout(220);
 assert.equal(await page.locator('#stage').getAttribute('data-scene'),'about-end');
 await page.waitForTimeout(1200);
 assert.equal(await page.locator('#stage').getAttribute('data-scene'),'about-end');
 assert.equal(await page.evaluate(()=>window.videoPlayAttempts),0);
 assert.equal(mp4.length,0,'Mobile must not request or decode MP4 files');
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS '+name+': opening and swipe animation change actual pixels with all video playback denied; no play button, no MP4 requests, finish then advance, rapid-swipe cancellation, no errors.');
 await browser.close();
}
(async()=>{await run(chromium,'Chrome');await run(webkit,'WebKit');})().catch(e=>{console.error(e);process.exit(1);});
