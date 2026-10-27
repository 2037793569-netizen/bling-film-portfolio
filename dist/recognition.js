(() => {
  const groups = [{"name": "创作者认证", "en": "CREATOR RECOGNITION", "items": ["站酷超级AI设计师", "artflo超级创作者", "可灵优质创作者", "LibTV专业作者", "即梦成长计划创作者", "站酷金钻设计师", "搜狐视频认证AI播主"]}, {"name": "获奖记录", "en": "AWARDS", "items": ["可灵高校AIGC创作大赛NEXTGEN巅峰原力奖", "2026青少年国际戏剧影像大会AI单元金奖", "北京国际电影节AIGC长片单元最佳视效和最佳声音设计", "粤港澳大湾区动画电影周优秀动画短片", "百度AIGC未来创作联赛S1优秀奖", "百度AIGC未来创作联赛S3铜奖", "Tapnow x Afterloop AIGC影像创作营优秀奖", "中国好创意大赛全国一等奖", "未来设计师全国一等奖", "米兰设计周全国三等奖", "中国移动10086个online时刻最终专业大奖二等奖", "岚图泰山X8AI视频共创大赛最终专业大奖四等奖"]}, {"name": "影展入围", "en": "OFFICIAL SELECTIONS", "items": ["香港国际AI电影节入围", "香港科技大学ai电影节入围", "湾区国际影展入围", "Bang Awards国际动画电影节入围", "悉尼Omni国际电影节入围", "KTOWN国际电影节入围", "MERGE电影节入围", "大学生AI艺术季入围", "ICONA动画电影节入围"]}];
  const dialog = document.getElementById('honors-overview');
  const list = document.getElementById('honors-overview-list');
  const tabs = [...dialog.querySelectorAll('[data-honor-tab]')];
  let previousOverflow = '';
  function select(index) {
    const group = groups[index];
    document.getElementById('honors-overview-title').textContent = group.name;
    document.getElementById('honors-overview-count').textContent = group.en + ' / ' + String(group.items.length).padStart(2, '0') + ' 项记录';
    tabs.forEach((tab, i) => { tab.classList.toggle('active', i === index); tab.setAttribute('aria-pressed', String(i === index)); });
    list.replaceChildren(...group.items.map((text, i) => {
      const li = document.createElement('li');
      li.style.setProperty('--delay', Math.min(i * 45, 320) + 'ms');
      const number = document.createElement('span'); number.className = 'archive-number'; number.textContent = String(i + 1).padStart(2, '0');
      const title = document.createElement('span'); title.className = 'archive-item-name'; title.textContent = text;
      li.append(number, title); return li;
    }));
    dialog.scrollTop = 0;
  }
  document.querySelectorAll('[data-honor-group]').forEach(button => button.addEventListener('click', () => {
    select(Number(button.dataset.honorGroup));
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    dialog.querySelector('.honors-overview-close').focus({preventScroll:true});
  }));
  tabs.forEach(tab => tab.addEventListener('click', () => select(Number(tab.dataset.honorTab))));
  dialog.querySelector('.honors-overview-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { document.body.style.overflow = previousOverflow; });
})();
