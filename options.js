const DEFAULT_REFRESH_MINUTES = 5;

const select = document.getElementById('interval');
const saved = document.getElementById('saved');

chrome.storage.local.get(['refreshInterval'], ({ refreshInterval }) => {
  select.value = String(refreshInterval || DEFAULT_REFRESH_MINUTES);
});

select.addEventListener('change', () => {
  const minutes = Number(select.value);
  chrome.storage.local.set({ refreshInterval: minutes }, () => {
    saved.classList.add('show');
    setTimeout(() => saved.classList.remove('show'), 1200);
  });
});
