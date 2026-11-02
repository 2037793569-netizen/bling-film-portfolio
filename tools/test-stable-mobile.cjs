const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
async function swipe(page,delta=120) {
 return page.locator('#stage').evaluate((el,delta)=>{
  const send=(type,touches,changed)=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperties(e,{touches:{value:touches},changedTouches:{value:changed||touches}});el.dispatchEvent(e);return e.defaultPrevented;};
  send('touchstart',[{clientX:180,clientY:550}]);
  const prevented=send('touchmove',[{clientX:180,clientY:550-delta}]);
  const scene=el.dataset.scene;send('touchend',[],[{clientX:180,clientY:550-delta}]);return {prevented,scene};
 },delta);
}
async function run(engine,name) {
 const browser=await engine.launch(name==='Chrome'?{headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']}:{headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
 await context.addInitScript(()=>{
  HTMLMediaElement.prototype.play=()=>Promise.reject(new DOMException('Autoplay denied','NotAllowedError'));
  window.scrollCalls=[];const native=window.scrollTo.bind(window);window.scrollTo=(...args)=>{window.scrollCalls.push(args);return native(...args)};
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 let client;
 if(name==='Chrome') {
  client=await context.newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate',{rate:4});
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions',{offline:false,latency:100,downloadThroughput:125000,uploadThroughput:125000});
 }
 await page.goto('http://127.0.0.1:8765',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#loader').hidden,null,{timeout:7000});
 if(await page.locator('#skip').isVisible())await page.locator('#skip').tap();
 assert.equal(await page.locator('#stage').getAttribute('data-scene'),'cover');
 assert.equal(await page.locator('#mobile-play').count(),0);
 const before=await page.locator('#stage').boundingBox();
 const heroHeight=await page.locator('#cover').evaluate(e=>e.offsetHeight);
 assert(Math.abs(heroHeight-844)<3,'Hero must be one viewport rather than a 205vh pinned scroll region');
 // Reproduce the phone recording's browser-toolbar expansion without changing orientation.
 await page.setViewportSize({width:390,height:944});
 await page.waitForTimeout(120);
 const after=await page.locator('#stage').boundingBox();
 assert(Math.abs(before.y-after.y)<2,'Toolbar change must not jump the artwork');
 await page.evaluate(()=>{window.scrollCalls=[];});
 const started=await swipe(page);
 assert(started.prevented && started.scene==='about','First swipe changes the scene during touchmove');
 assert.equal(await page.evaluate(()=>window.scrollY),0);
 assert.equal(await page.evaluate(()=>window.scrollCalls.length),0,'No forced page jump between cover and about');
 assert.equal(await page.locator('#about-chrome').evaluate(e=>getComputedStyle(e).opacity),'1');
 await page.waitForFunction(()=>document.querySelector('#mobile-animation').dataset.playing==='about',null,{timeout:30000});
 const a=await page.locator('#stage').screenshot();await page.waitForTimeout(650);const b=await page.locator('#stage').screenshot();
 assert(!a.equals(b),'Actual animation pixels must advance');
 const finish=await swipe(page);
 assert.equal(finish.scene,'about-end','Next swipe ends the animation immediately');
 const next=await swipe(page);
 assert(!next.prevented,'Following swipe must be free native scrolling');
 if(client) {
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:700}]});
  for(let y=650;y>=200;y-=50){await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180,y}]});await page.waitForTimeout(16);}
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 } else await page.evaluate(()=>{document.scrollingElement.scrollTop=600;});
 await page.waitForTimeout(400);
 assert(await page.evaluate(()=>scrollY)>200,'Normal scrolling must leave the hero');
 assert(await page.locator('#honors').evaluate(e=>getComputedStyle(e.children[0]).opacity==='1'),'Section content must not remain faded during scrolling');
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS '+name+': one-viewport hero; stable artwork during browser-toolbar resize; immediate swipe state changes without scrollTo; animation moves; next swipe scrolls normally; no overlay or script errors.'+(client?' Chrome tested with 4x CPU throttling and 1 Mbps cold network.':''));
 await browser.close();
}
(async()=>{await run(chromium,'Chrome');await run(webkit,'WebKit');})().catch(e=>{console.error(e);process.exit(1);});
