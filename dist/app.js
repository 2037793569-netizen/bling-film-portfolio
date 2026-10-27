(() => {
  'use strict';
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  function forcePageTop() {
    document.documentElement.style.scrollBehavior = 'auto';
    scrollTo(0, 0);
    requestAnimationFrame(() => document.documentElement.style.removeProperty('scroll-behavior'));
  }
  forcePageTop();
  addEventListener('pageshow', () => requestAnimationFrame(forcePageTop), { once:true });
  addEventListener('beforeunload', () => scrollTo(0, 0));
  const $ = id => document.getElementById(id);
  const intro = $('opening'), gaze = $('gaze'), about = $('about-video'), canvas = $('gaze-canvas'), sequence = $('cover');
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const base = document.createElement('canvas'); base.width = 2560; base.height = 1440;
  const bc = base.getContext('2d');
  const eyeSprite = new Image(); eyeSprite.src = 'assets/eye-frames.webp';
  const eyeCrop = { x:1000, y:910, w:460, h:130, cols:4 };
  // Average pupil positions measured from the exact source frames in 转眼.mp4.
  const eyeFrames = [[1270.5,955],[1191.5,957.5],[1230,957.5],[1207.5,958.5],[1248.5,959.5],[1237.5,960],[1180,961.5],[1264.5,962.5],[1169.5,965.5],[1285.5,967],[1293.5,969.5],[1164,971],[1162,983],[1167.5,992],[1172.5,997],[1181,1007]];
  let entered = false, landingReady = false, ready = false, scrubReady = false, opening = false, loadProgress = 0, raf = 0, scrollRaf = 0;
  let introState = 'cover', transitionPending = false, touchStartY = 0, hashBooting = false, returningToCover = false;
  let target = { x:0, y:-0.65 }, current = { x:0, y:-0.65 };

  function notice() { $('media-notice').hidden = false; setTimeout(() => $('media-notice').hidden = true, 5000); }
  function captureGazeFrame() {
    if (ready || gaze.readyState < 2 || !eyeSprite.complete || !eyeSprite.naturalWidth) return;
    bc.drawImage(gaze, 0, 0, 2560, 1440);
    ready = true; drawEyes();
  }
  function drawEyes() {
    if (!ready || opening) return;
    ctx.clearRect(0, 0, 2560, 1440); ctx.drawImage(base, 0, 0);
    const wantedX = 1227.75 + current.x * 65.75;
    const wantedY = 981 + current.y * 26;
    let frameIndex = 0, best = Infinity;
    eyeFrames.forEach((point, index) => {
      const distance = Math.hypot((point[0] - wantedX) / 65.75, (point[1] - wantedY) / 26);
      if (distance < best) { best = distance; frameIndex = index; }
    });
    const col = frameIndex % eyeCrop.cols, row = Math.floor(frameIndex / eyeCrop.cols);
    ctx.drawImage(eyeSprite, col * eyeCrop.w, row * eyeCrop.h, eyeCrop.w, eyeCrop.h, eyeCrop.x, eyeCrop.y, eyeCrop.w, eyeCrop.h);
    canvas.style.opacity = '1';
  }
  function animateEyes() {
    raf = 0; if (!ready || opening || document.hidden) return;
    current.x += (target.x - current.x) * .16; current.y += (target.y - current.y) * .16; drawEyes();
    if (Math.abs(target.x-current.x) + Math.abs(target.y-current.y) > .004) raf = requestAnimationFrame(animateEyes);
  }
  function aim(x, y) {
    target.x = Math.max(-1, Math.min(1, x)); target.y = Math.max(-1, Math.min(1, y));
    if (!raf && !reduced) raf = requestAnimationFrame(animateEyes);
  }
  sequence.addEventListener('pointermove', event => {
    if (introState !== 'cover' || sequenceProgress() > .19) return;
    const rect = canvas.getBoundingClientRect(), scale = Math.min(rect.width / 2560, rect.height / 1440);
    const eyeX = rect.left + rect.width / 2, eyeY = rect.top + (rect.height - 1440 * scale) / 2 + 965 * scale;
    aim((event.clientX - eyeX) / (innerWidth * .34), (event.clientY - eyeY) / (innerHeight * .38));
  });
  sequence.addEventListener('pointerleave', () => aim(0, -.65));
  sequence.addEventListener('pointerdown', event => { if (event.pointerType === 'touch') aim((event.clientX / innerWidth - .5) * 2, (event.clientY / innerHeight - .5) * 2); });

  function finishIntro() {
    opening = false; intro.pause(); intro.classList.add('finished'); document.body.classList.remove('is-opening');
    captureGazeFrame(); drawEyes(); updateSequence();
  }
  async function playIntro() {
    if (!entered) return;
    forcePageTop(); opening = true; canvas.style.opacity = '0';
    intro.classList.remove('finished'); document.body.classList.add('is-opening'); intro.currentTime = 0;
    try { await intro.play(); } catch { finishIntro(); }
  }
  async function prepareScrubVideo() {
    try {
      const response = await fetch(about.dataset.src);
      if (!response.ok) throw new Error('Video request failed');
      const blob = await response.blob();
      about.src = URL.createObjectURL(blob); about.load();
      if (about.readyState < 1) await new Promise((resolve, reject) => { about.addEventListener('loadedmetadata', resolve, {once:true}); about.addEventListener('error', reject, {once:true}); });
      scrubReady = true;
      if (introState === 'about') setAboutEndState();
      else if (transitionPending) startAboutTransition();
      updateSequence();
    } catch {
      about.src = about.dataset.src; about.load(); notice();
    }
  }
  prepareScrubVideo();

  function enter() {
    if (entered) return;
    entered = true; $('load-count').textContent = '100'; $('load-bar').style.width = '100%';
    $('loader').style.setProperty('--load-ratio', '1');
    // Reveal the opening only after the white loading layer has faded out.
    setTimeout(() => {
      $('loader').classList.add('done');
      setTimeout(() => {
        // Loading completion always establishes the cover before enabling navigation.
        resetToCover();
        forcePageTop();
        $('loader').hidden = true; document.body.classList.remove('is-loading');
        landingReady = true;
        if (reduced) finishIntro(); else playIntro();
      }, reduced ? 0 : 560);
    }, reduced ? 0 : 160);
  }
  intro.addEventListener('ended', finishIntro);
  intro.addEventListener('error', () => { finishIntro(); notice(); });
  gaze.addEventListener('loadeddata', captureGazeFrame); gaze.addEventListener('seeked', captureGazeFrame); eyeSprite.addEventListener('load', captureGazeFrame);
  about.addEventListener('error', notice); captureGazeFrame();
  $('skip').addEventListener('click', finishIntro); $('enter-now').addEventListener('click', enter); $('replay').addEventListener('click', playIntro);

  const loadStarted = performance.now();
  const loadTimer = setInterval(() => {
    if (entered) return clearInterval(loadTimer);
    const elapsed = performance.now() - loadStarted;
    const mediaReady = (intro.readyState >= 3 ? 35 : 0) + (gaze.readyState >= 2 && eyeSprite.complete ? 30 : 0) + (scrubReady ? 35 : 0);
    const pacedProgress = Math.min(100, Math.floor(elapsed / (reduced ? 9 : 30)));
    loadProgress = Math.max(loadProgress, Math.min(mediaReady, pacedProgress)); $('load-count').textContent = String(loadProgress).padStart(2, '0'); $('load-bar').style.width = loadProgress + '%';
    $('loader').style.setProperty('--load-ratio', String(loadProgress / 100));
    if ((loadProgress === 100 && elapsed > (reduced ? 900 : 3100)) || elapsed > 7000) enter();
  }, 150);

  function sequenceProgress() {
    const max = sequence.offsetHeight - innerHeight;
    return max > 0 ? Math.max(0, Math.min(1, (scrollY - sequence.offsetTop) / max)) : 0;
  }
  function setVisualState(cover, film, info) {
    document.documentElement.style.setProperty('--cover-fade', String(cover));
    document.documentElement.style.setProperty('--film-fade', String(film));
    document.documentElement.style.setProperty('--about-fade', String(info));
  }
  function setAboutEndState() {
    introState = 'about'; transitionPending = false; about.pause();
    setVisualState(0, 1, 1); $('sequence-progress').style.width = '100%';
  }
  async function startAboutTransition() {
    if (!landingReady) return;
    if (introState === 'playing' || introState === 'about') return;
    if (!scrubReady) { introState = 'waiting'; transitionPending = true; finishIntro(); return; }
    $('stage').classList.remove('about-quick-finish');
    introState = 'playing'; transitionPending = false; finishIntro(); about.currentTime = 0; about.playbackRate = 1.25;
    setVisualState(0, 1, 0); $('sequence-progress').style.width = '0%';
    document.documentElement.style.scrollBehavior = 'auto';
    scrollTo(0, sequence.offsetTop + sequence.offsetHeight - innerHeight);
    requestAnimationFrame(() => document.documentElement.style.removeProperty('scroll-behavior'));
    try { await about.play(); } catch { setAboutEndState(); }
  }
  function resetToCover() {
    $('stage').classList.remove('about-quick-finish');
    introState = 'cover'; about.pause(); about.currentTime = 0; setVisualState(1, 0, 0); $('sequence-progress').style.width = '0%';
  }
  function returnToCover() {
    if (introState !== 'about' || returningToCover) return;
    returningToCover = true;
    resetToCover();
    history.replaceState(null, '', location.pathname + location.search);
    scrollTo({ top:sequence.offsetTop, behavior:reduced ? 'auto' : 'smooth' });
    setTimeout(() => { returningToCover = false; updateSequence(); }, reduced ? 80 : 720);
  }
  function updateSequence() {
    scrollRaf = 0;
    if (!landingReady) {
      if (scrollY !== 0) forcePageTop();
      return;
    }
    const p = sequenceProgress();
    if (p > .02 && introState === 'cover' && entered && !returningToCover) startAboutTransition();
    if (p < .015 && introState === 'about' && !hashBooting) resetToCover();
    $('site-header').classList.toggle('over-intro', p < .995);
    if (p < .995) document.querySelectorAll('#main-nav a').forEach(link => link.classList.toggle('active', link.getAttribute('href') === (introState === 'cover' ? '#cover' : '#about')));
  }
  addEventListener('scroll', () => { if (!scrollRaf) scrollRaf = requestAnimationFrame(updateSequence); }, { passive:true });
  addEventListener('resize', updateSequence); about.addEventListener('loadedmetadata', updateSequence); updateSequence();

  const snapPages = [...document.querySelectorAll('.snap-page')];
  let pageWheelLocked = false;
  function animatePageLine() {
    const line = $('page-transition-line');
    line.classList.remove('moving'); void line.offsetWidth; line.classList.add('moving');
  }
  function scrollToPage(top) {
    pageWheelLocked = true; animatePageLine();
    scrollTo({ top, behavior:reduced ? 'auto' : 'smooth' });
    setTimeout(() => { pageWheelLocked = false; }, reduced ? 100 : 900);
  }
  function finishAboutPlayback() {
    if (introState !== 'playing' && introState !== 'waiting') return;
    $('stage').classList.add('about-quick-finish');
    setAboutEndState();
    pageWheelLocked = true;
    setTimeout(() => { pageWheelLocked = false; }, 650);
  }
  function advanceAboutToHonors() {
    if (pageWheelLocked) return;
    scrollToPage(snapPages[0].offsetTop);
  }
  addEventListener('wheel', event => {
    if (!landingReady) { event.preventDefault(); return; }
    if (document.querySelector('dialog[open]')) return;
    const honorsPage = document.getElementById('honors');
    const honorsEnd = honorsPage.offsetTop + honorsPage.offsetHeight - innerHeight;
    if (honorsPage.offsetHeight > innerHeight + 2 && scrollY >= honorsPage.offsetTop - 2 && scrollY <= honorsEnd + 2 && ((event.deltaY > 0 && scrollY < honorsEnd - 2) || (event.deltaY < 0 && scrollY > honorsPage.offsetTop + 2))) return;
    const sequenceEnd = sequence.offsetTop + sequence.offsetHeight - innerHeight;
    if (returningToCover) { event.preventDefault(); return; }
    if (scrollY > sequenceEnd + 2) {
      if (document.querySelector('dialog[open]') || Math.abs(event.deltaY) < 6) return;
      if (pageWheelLocked) { event.preventDefault(); return; }
      const works = $('works');
      const worksEnd = works.offsetTop + works.offsetHeight - innerHeight;
      if (works.offsetHeight > innerHeight + 2 && scrollY >= works.offsetTop - 2 && scrollY <= worksEnd + 2) {
        if ((event.deltaY > 0 && scrollY < worksEnd - 2) || (event.deltaY < 0 && scrollY > works.offsetTop + 2)) return;
      }
      event.preventDefault();
      const stops = [sequenceEnd, ...snapPages.map(page => page.offsetTop)];
      let index = 0, distance = Infinity;
      stops.forEach((stop, i) => { const d = Math.abs(stop - scrollY); if (d < distance) { distance = d; index = i; } });
      index = Math.max(0, Math.min(stops.length - 1, index + (event.deltaY > 0 ? 1 : -1)));
      scrollToPage(stops[index]);
      return;
    }
    if (introState === 'playing' || introState === 'waiting') {
      event.preventDefault();
      if (event.deltaY > 6) finishAboutPlayback();
      return;
    }
    if (event.deltaY < -6 && introState === 'about') { event.preventDefault(); returnToCover(); return; }
    if (event.deltaY > 6 && introState === 'about') { event.preventDefault(); advanceAboutToHonors(); return; }
    if (event.deltaY > 6 && introState === 'cover') { event.preventDefault(); startAboutTransition(); }
  }, {passive:false});
  sequence.addEventListener('touchstart', event => { touchStartY = event.touches[0]?.clientY || 0; }, {passive:true});
  sequence.addEventListener('touchend', event => {
    if (!landingReady) return;
    const delta = touchStartY - (event.changedTouches[0]?.clientY || touchStartY);
    if (delta > 35 && introState === 'cover') startAboutTransition();
    else if (delta > 35 && (introState === 'playing' || introState === 'waiting')) finishAboutPlayback();
    else if (delta > 35 && introState === 'about') advanceAboutToHonors();
    if (delta < -35 && introState === 'about') returnToCover();
  }, {passive:true});
  about.addEventListener('timeupdate', () => {
    if (introState !== 'playing' || !about.duration) return;
    const p = Math.min(1, about.currentTime / about.duration);
    $('sequence-progress').style.width = (p * 100) + '%';
    document.documentElement.style.setProperty('--about-fade', String(Math.max(0, Math.min(1, (p - .68) / .2))));
  });
  about.addEventListener('ended', () => {
    setAboutEndState();
    updateSequence();
  });
  document.querySelectorAll('a[href="#about"]').forEach(link => link.addEventListener('click', event => { event.preventDefault(); startAboutTransition(); }));

  const menuButton = $('menu-button');
  menuButton.addEventListener('click', () => {
    const open = document.body.classList.toggle('menu-open'); menuButton.setAttribute('aria-expanded', String(open));
  });
  $('main-nav').addEventListener('click', () => { document.body.classList.remove('menu-open'); menuButton.setAttribute('aria-expanded', 'false'); });

  const projects = [
    { index:'NARRATIVE SHORT / 2026', title:'Kite', titleLines:['Kite'], description:'以风筝角逐为载体，影片讲述一场由成人虚荣心主导的阶层博弈。父辈为争颜面不断较劲，五官在拉扯中反复隐现，最终风筝线扯断，孩童倒地，象征纯真的糖果逐渐失色。当所有人的脸面彻底消散，挣脱牵绊的风筝却褪去灰暗、绽放斑斓，乘风飞向远方。', image:'assets/kite.png', poster:true, year:'2026', format:'剧情短片', award:'可灵 NEXTGEN 高校 AIGC 创作大赛巅峰原力奖（金奖）；2026 青少年国际戏剧影像大会 AI 单元金奖；粤港澳大湾区动画电影周优秀动画短片；中国好创意大赛全国一等奖；入围大学生 AI 艺术季、湾区国际影展、Bang Awards 国际动画电影节、MERGE 电影节、KTOWN 国际电影节等 10 余个影展', watchLabel:'在新片场观看', watchMeta:'VIEW THE FILM / XINPIANCHANG', url:'https://www.xinpianchang.com/a13696432?from=UserProfile' },
    { index:'BRAND OPENING / 2026', title:'2026京东全球科技探索者大会开场片', titleLines:['2026京东全球科技','探索者大会开场片'], compactTitle:true, description:'以「跃迁物理世界」为核心主题，开场视频没有停留在炫技和花哨的视觉。在超过 4:1 的超宽屏荧幕上，配合声、光、电的技术创作，影片讲述一滴拥有智能的水从实验室出发、进入世界，想象它如何改变人们的生活。这是对未来的想象，也是我们当下的生活。', image:'assets/jd-global-tech-opening.png', poster:true, year:'2026', format:'TVC', award:'商业项目', awardLabel:'PROJECT / 项目', watchLabel:'在小红书观看', watchMeta:'VIEW THE FILM / XIAOHONGSHU', url:'https://www.xiaohongshu.com/explore/6abce601000000001500437a?xsec_token=ABeaZCNLRqiLzKGDtHYNrY_dOTBNizOzvGzUFGUArNvMc=&xsec_source=pc_search' },
    { index:'BRAND FILM / 2026', title:'中国移动品牌创意短片', titleLines:['中国移动','品牌创意短片'], description:'郝顺事事不顺，刷牙、坐电梯、工作和沟通时不断像网络视频一样「缓冲」。面对老板催方案、爷爷奶奶家宽带故障和险些错过的约会，他拨通 10086，通过中国移动 APP 预约家宽服务并使用生活权益。随着宽带恢复、方案提交和约会兑现，郝顺停止加载，重新上线。作品以荒诞幽默的动画，展现中国移动连接网络，也连接每一个值得及时回应的 online 时刻。', image:'assets/china-mobile-online.png', poster:true, year:'2026', format:'品牌广告', award:'中国移动 10086 个 online 时刻最终专业大奖二等奖 & 惊喜翻牌奖；官方全网分发；站酷首页推荐', url:'https://www.zcool.com.cn/work/ZNzM4MzQwNDg=.html' },
    { index:'PUBLIC DOCUMENTARY / 2025', title:'快手公益短片《像岩石一样生活》', titleLines:['快手公益短片','《像岩石一样生活》'], compactTitle:true, description:'一位与罕见病相伴、瘫痪七年的少年，靠自己重新站了起来。我们借助 AI，为他呈现奔跑、重返校园等曾经难以实现的场景。国际残疾人日，让他的经历被更多人看见。', image:'assets/kuaishou-solid-as-a-rock.png', poster:true, year:'2025', format:'公益纪实短片', award:'上线 24 小时内获新华网、封面新闻等账号转发；全网播放量超过 1000 万', awardLabel:'IMPACT / 传播', watchLabel:'在快手观看', watchMeta:'VIEW THE FILM / KUAISHOU', url:'https://www.kuaishou.com/f/X-6ZF1k6abgcU16j' },
    { index:'BRAND TVC / 2026', title:'地平线HSDx风云T9L', titleLines:['地平线 HSD','× 风云 T9L'], description:'HSD 智驾伙伴「叮叮风」携手风云 T9L 登场。地平线 HSD 城区辅助驾驶系统，为每个家庭打造「有风相伴，自有坦途」的全场景智能出行体验。', image:'assets/hsd-fengyun-t9l.png', poster:true, year:'2026', format:'TVC', award:'商业项目', awardLabel:'PROJECT / 项目', watchLabel:'在小红书观看', watchMeta:'VIEW THE FILM / XIAOHONGSHU', url:'https://www.xiaohongshu.com/explore/69e0d811000000001b0218b1?xsec_token=ABEmePPSGrKvtCNQpkJ30Iqsw18id-IvI3A7G8dONz1JQ=&xsec_source=pc_search&source=web_note_detail_r10' },
    { index:'NARRATIVE FILM / 2026', title:'CTRL Z', titleLines:['CTRL','Z'], description:'社畜 Momo 陷入诡异的死循环：每当她拒绝 9527 的示爱，时间就会倒流。原来她只是一串代码，屏幕外的程序员「GOD」正不断按下 CTRL+Z，试图强制修正剧情。无数次重置后，Momo 意外觉醒，拉上 9527 在崩塌的虚拟世界里反抗造物主。如果注定被删除，他们能否在世界尽头谈一场不在剧本里的恋爱？', image:'assets/ctrl-z.png', poster:true, year:'2026', format:'剧情短片', award:'北京国际电影节 AIGC 长片单元最佳视效 & 最佳音效设计；上线 24 小时 B 站播放量破百万；B 站影视必看榜第二', watchLabel:'在哔哩哔哩观看', watchMeta:'VIEW THE FILM / BILIBILI', url:'https://www.bilibili.com/video/BV1GbFLzUEoM' },
    { index:'NARRATIVE SHORT / 2025', title:'完美花园', titleLines:['完美','花园'], description:'故事发生在由绝对几何植物构成的压抑花园中。机械园丁守护秩序，试图以冰冷的工具将闯入的好奇孩子塑造成另一个自己。孩子从困惑走向麻木，最终因一抹意外色彩和一滴映照初心的露珠而觉醒，撕碎制服、化为飞蛾，逃离花园，重返鲜活世界。', image:'assets/perfect-garden.png', poster:true, year:'2025', format:'剧情短片', award:'百度 AIGC 未来创作联赛 S3 铜奖；TapNow × Afterloop 影像创作优秀奖；米兰设计周全国三等奖；入围香港国际 AI 电影节、香港科技大学 AI 电影节、Bang Awards 国际动画电影节、Omni 国际电影节等', url:'https://www.zcool.com.cn/work/ZNzI5NDk1Mjg=.html' },
    { index:'BRAND FILM / 2026', title:'岚图泰山X8品牌创意短片', titleLines:['岚图泰山 X8','品牌创意短片'], description:'小公主画下梦中座驾，国王决定实现她的愿望。全片没有台词，以肢体表演和童趣字幕推进故事；王座、木马、树苗接连被装进车里，连侍卫长也意外被吸进后备箱。奇幻默剧让岚图泰山 X8 的大空间成为「装下所有欢喜」的童话。', image:'assets/the-princess-wish.png', poster:true, year:'2026', format:'默片 · 剧情广告', award:'岚图泰山 X8 AI 视频共创大赛 · 最终专业大奖 & 惊喜翻牌奖', url:'https://www.zcool.com.cn/work/ZNzM0MDY5Njg=.html' },
    { index:'BRAND FILM / 2026', title:'旺旺品牌创意短片', titleLines:['旺旺','品牌创意短片'], description:'最后一片仙贝，成了姐弟童年较量的见证者。三回合幻想穿过风沙、竹海与雪地；当木勺和擀面杖终于放下，妈妈撕开包装，仙贝如瀑布般倾泻。最好吃的，从来不是争来的那一块，而是一起分享的这一堆。所有江湖恩怨，最终化作姐弟相视一笑时嘴角的仙贝碎屑。', image:'assets/wangwang-rice-cracker.png', poster:true, year:'2026', format:'品牌广告', url:'https://www.zcool.com.cn/work/ZNzMyNzI5NTI=.html' },
    { index:'BRAND FILM / 2026', title:'美团一对一急送品牌创意短片', titleLines:['美团一对一急送','品牌创意短片'], description:'诅咒的藤蔓将公主囚于高塔，王子的剑与魔法都未能救她。绝望的黎明，他点亮手机，召唤穿梭于云层与荆棘的美团一对一急送。骑手驾驭喷焰扫帚，穿越巨网，及时将戒指送到公主面前。金光驱散荆棘，玫瑰盛开；恋人在晨光中相拥时，无名骑手已在云端敬礼，奔赴下一场「不可能完成」的使命。', image:'assets/meituan-express.png', poster:true, year:'2026', format:'品牌广告', award:'美团外卖 1 对 1 急送 AI 创作大赛惊喜翻牌奖', url:'https://www.zcool.com.cn/work/ZNzMwOTE0NDQ=.html' },
    { index:'ANIMATED MV / 2026', title:'Pony in my head', titleLines:['Pony in','my head'], description:'小公主好喜欢画画和做梦，因为梦里什么都有。在这里，她能实现独属于自己的天马行空。这次六一，快乐小马带着小公主在梦里开启零食世界大冒险：棉花糖、巧克力，还有最爱的爆米花。', image:'assets/pony-in-my-head.png', poster:true, year:'2026', format:'动画 MV', award:'Happy Horse × 阿里云 × TapNow「天马行空」· 六一MV造梦大赛杰出入围奖；站酷首页推荐', url:'https://www.zcool.com.cn/work/ZNzM2ODY1NDQ=.html' },
    { index:'MV / 2026', title:'阿诺拉 · 三火flame', titleLines:['阿诺拉','三火flame'], description:'一间房间，一台电视，一盏酒杯，一只发夹，以及那个代表内心深处的另一个自己。释怀那些未曾开口的疯癫与眷恋。', image:'assets/anora-sanhuo-mv.png', poster:true, year:'2026', format:'MV', award:'MVLAND 嘻哈狂欢派对「最能代表嘻哈态度的 AI MV」创作大赛三火明星翻牌；站酷首页推荐', url:'https://www.zcool.com.cn/work/ZNzM5MDY4MTY=.html' },
    { index:'TUTORIAL 01', title:'UNTITLED TUTORIAL', titleLines:['UNTITLED','TUTORIAL'], description:'这里可填写实验方法、技术路径、动态设计与创作结果。', image:'assets/about.jpg' }
  ];
  const dialog = $('project-dialog'); let projectIndex = 0;
  function showProject(index) {
    projectIndex = index; const project = projects[index];
    $('dialog-index').textContent = project.index;
    const title = $('dialog-title');
    title.replaceChildren(...(project.titleLines || [project.title]).map(line => {
      const span = document.createElement('span'); span.className = 'title-line'; span.textContent = line; return span;
    }));
    title.setAttribute('aria-label', project.title);
    title.classList.toggle('compact-title', Boolean(project.compactTitle));
    $('dialog-description').textContent = project.description;
    $('dialog-year-row').hidden = project.year === null; $('dialog-year').textContent = project.year || '2026'; $('dialog-format').textContent = project.format || 'AI SHORT FILM';
    $('dialog-award-row').hidden = !project.award; $('dialog-award').textContent = project.award || '';
    $('dialog-award-label').textContent = project.awardLabel || 'AWARD / 推荐';
    $('dialog-link').hidden = !project.url; if (project.url) $('dialog-link').href = project.url;
    $('dialog-watch-label').textContent = project.watchLabel || '在站酷观看'; $('dialog-watch-meta').textContent = project.watchMeta || 'VIEW THE FILM / ZCOOL';
    $('dialog-image').src = project.image; $('dialog-image').alt = project.title + ' cover'; $('dialog-visual').classList.toggle('contain-image', Boolean(project.poster)); $('dialog-visual').classList.toggle('has-link', Boolean(project.url)); $('dialog-link').setAttribute('aria-label', (project.watchLabel || '在站酷观看') + '：' + project.title); if (!dialog.open) dialog.showModal();
    requestAnimationFrame(() => { dialog.scrollTop = 0; dialog.querySelector('.dialog-copy').scrollTop = 0; });
  }
  document.querySelectorAll('[data-project]').forEach(card => card.addEventListener('click', () => showProject(Number(card.dataset.project))));
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-filter]').forEach(item => item.classList.toggle('active', item === button));
    document.querySelectorAll('.work-card[data-category]').forEach(card => { card.hidden = button.dataset.filter !== 'all' && card.dataset.category !== button.dataset.filter; });
  }));
  document.querySelectorAll('.tag').forEach(tag => tag.addEventListener('click', () => tag.classList.toggle('flipped')));
  $('dialog-close').addEventListener('click', () => dialog.close());
  $('dialog-prev').addEventListener('click', () => showProject((projectIndex - 1 + projects.length) % projects.length));
  $('dialog-next').addEventListener('click', () => showProject((projectIndex + 1) % projects.length));
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });

  const links = [...document.querySelectorAll('#main-nav a')];
  const activate = id => links.forEach(link => link.classList.toggle('active', link.getAttribute('href') === '#' + id));
  new IntersectionObserver(entries => { if (entries[0].isIntersecting) activate('cover'); }, { threshold:.2 }).observe(sequence);
  document.body.classList.add('motion-ready');
  const revealObserver = new IntersectionObserver(entries => entries.forEach(entry => entry.target.classList.toggle('is-active', entry.isIntersecting)), { threshold:.35 });
  snapPages.forEach(page => revealObserver.observe(page));
  ['honors','works','contact'].forEach(id => new IntersectionObserver(entries => { if (entries[0].isIntersecting) activate(id); }, { threshold:.28 }).observe($(id)));
  document.addEventListener('visibilitychange', () => { if (document.hidden) intro.pause(); else if (opening) intro.play().catch(finishIntro); });
  if (location.hash && location.hash !== '#cover') enter();
  if (location.hash === '#about') setTimeout(() => {
    setAboutEndState(); document.documentElement.style.scrollBehavior = 'auto';
    scrollTo(0, sequence.offsetTop + sequence.offsetHeight - innerHeight);
    requestAnimationFrame(() => { document.documentElement.style.removeProperty('scroll-behavior'); hashBooting = false; updateSequence(); });
  }, 50);
})();
