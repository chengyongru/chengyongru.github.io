function toggleSunlit() {
  document.body.classList.add('sunlit-animation-ready');
  document.body.classList.toggle('dark');
}

document.addEventListener('DOMContentLoaded', () => {
  // 监听空格键切换日夜模式
  document.addEventListener('keydown', function(event) {
    if (event.code === 'Space' && !event.target?.matches('input, textarea')) {
      event.preventDefault();
      toggleSunlit();
    }
  });

  // 监听点击切换日夜模式（可选）
  // document.addEventListener('click', function() {
  //   toggleSunlit();
  // });
});
