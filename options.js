const DEFAULT_REFRESH_MINUTES = 5;

const select = document.getElementById('interval');
const saved = document.getElementById('saved');
const notify50 = document.getElementById('notify-50');
const notify80 = document.getElementById('notify-80');
const notify100 = document.getElementById('notify-100');
const showCopilot = document.getElementById('show-copilot');

function showSaved() {
  saved.classList.add('show');
  setTimeout(() => saved.classList.remove('show'), 1200);
}

chrome.storage.local.get([
  'refreshInterval',
  'theme',
  'notify50',
  'notify80',
  'notify100',
  'showCopilot',
], (data) => {
  select.value = String(data.refreshInterval || DEFAULT_REFRESH_MINUTES);

  // Set checkbox checked states (defaulting to true)
  notify50.checked = data.notify50 !== false;
  notify80.checked = data.notify80 !== false;
  notify100.checked = data.notify100 !== false;
  showCopilot.checked = data.showCopilot !== false;

  if (data.theme === 'light') {
    document.body.classList.add('light-theme');
  } else {
    document.body.classList.remove('light-theme');
  }
});

select.addEventListener('change', () => {
  const minutes = Number(select.value);
  const VALID_INTERVALS = [5, 10, 15, 30];
  if (!VALID_INTERVALS.includes(minutes)) return;
  chrome.storage.local.set({ refreshInterval: minutes }, showSaved);
});

[notify50, notify80, notify100, showCopilot].forEach(cb => {
  cb.addEventListener('change', () => {
    chrome.storage.local.set({
      notify50: notify50.checked,
      notify80: notify80.checked,
      notify100: notify100.checked,
      showCopilot: showCopilot.checked,
    }, showSaved);
  });
});
