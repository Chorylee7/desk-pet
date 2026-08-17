const api = window.petAPI;
const BUILTIN = [
  { id: 'cat',   label: '小猫',   src: '../pets/cat.svg' },
  { id: 'dog',   label: '小狗',   src: '../pets/dog.svg' },
  { id: 'slime', label: '史莱姆', src: '../pets/slime.svg' },
  { id: 'bunny', label: '小兔',   src: '../pets/bunny.svg' },
  { id: 'alien', label: '外星人', src: '../pets/alien.svg' },
  { id: 'bead',  label: '拼豆鸭', src: '../preview/duck-preview.png' },
];

let settings = null;
let selectedId = null;
let sizeTimer = null;

async function init() {
  settings = await api.getSettings();
  selectedId = settings.pet;
  buildGallery();
  bind();
  renderControls();
  api.onSettingsChanged((s) => {
    settings = s;
    selectedId = s.pet;
    buildGallery();
    renderControls();
  });
}

function buildGallery() {
  const g = document.getElementById('gallery');
  g.innerHTML = '';
  BUILTIN.forEach(p => {
    const card = document.createElement('div');
    card.className = 'card' + (selectedId === p.id ? ' active' : '');
    card.dataset.id = p.id;
    card.innerHTML = `<img src="${p.src}" alt="${p.label}"><span>${p.label}</span>`;
    card.onclick = () => api.switchPet(p.id);
    g.appendChild(card);
  });
  if (settings.customPetUrl) {
    const card = document.createElement('div');
    card.className = 'card' + (selectedId === 'custom' ? ' active' : '');
    card.dataset.id = 'custom';
    card.innerHTML = `<img src="${settings.customPetUrl}" alt="自定义"><span>自定义</span>`;
    card.onclick = () => api.switchPet('custom');
    g.appendChild(card);
  }
}

function bind() {
  document.getElementById('importBtn').onclick = () => api.importImage();
  document.getElementById('closeBtn').onclick = () => window.close();

  const range = document.getElementById('sizeRange');
  range.oninput = () => {
    document.getElementById('sizeVal').textContent = range.value + ' px';
    clearTimeout(sizeTimer);
    sizeTimer = setTimeout(() => api.saveSettings({ size: parseInt(range.value, 10) }), 250);
  };

  document.getElementById('wanderToggle').onchange = (e) =>
    api.saveSettings({ wander: e.target.checked });
}

function renderControls() {
  document.getElementById('sizeRange').value = settings.size;
  document.getElementById('sizeVal').textContent = settings.size + ' px';
  document.getElementById('wanderToggle').checked = !!settings.wander;
}

init();
