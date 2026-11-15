const viewer = document.getElementById('electrician-3d');
const panel = document.getElementById('gp9-3d-panel');
const status = document.getElementById('gp9-angle-status');

function showSelectedView() {
  const selected = viewer.querySelector('input[name="gp9-view"]:checked');
  panel.dataset.view = selected.value;
  status.textContent = 'זווית נוכחית: ' + selected.nextElementSibling.textContent;
}

viewer.addEventListener('change', showSelectedView);
window.addEventListener('pageshow', showSelectedView);
showSelectedView();
