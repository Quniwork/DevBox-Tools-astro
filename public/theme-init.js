(function() {
  const stored = localStorage.getItem('app-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  let themeClass = '';
  
  if (stored) {
    // 根據儲存的主題 ID 設定 class
    switch (stored) {
      case 'nord-dark':
        themeClass = 'dark';
        break;
      case 'ant-light':
        themeClass = 'ant-light';
        break;
      case 'ant-dark':
        themeClass = 'ant-dark';
        break;
      // nord-light 不需要 class
    }
  } else if (prefersDark) {
    themeClass = 'dark';
  }
  
  if (themeClass) {
    document.documentElement.classList.add(themeClass);
  }
})();
