(() => {
  const pad = document.getElementById('external-signature-pad');
  const data = document.getElementById('external-signature-data');
  const clear = document.getElementById('external-signature-clear');
  const mode = document.getElementById('customer-confirmation-mode');
  const block = document.getElementById('customer-signature-block');

  if (mode && block) {
    const refresh = () => {
      block.hidden = mode.value !== 'signed';
      if (block.hidden && data) data.value = '';
    };
    mode.addEventListener('change', refresh);
    refresh();
  }

  if (!pad || !data) return;
  const ctx = pad.getContext('2d');
  let drawing = false;
  let dirty = false;

  const reset = () => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pad.width, pad.height);
    ctx.strokeStyle = '#10233f';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    drawing = false;
    dirty = false;
    data.value = '';
  };

  const point = (event) => {
    const rect = pad.getBoundingClientRect();
    const source = event.touches ? event.touches[0] : event;
    return {
      x: (source.clientX - rect.left) * (pad.width / rect.width),
      y: (source.clientY - rect.top) * (pad.height / rect.height),
    };
  };

  const start = (event) => {
    event.preventDefault();
    drawing = true;
    const current = point(event);
    ctx.beginPath();
    ctx.moveTo(current.x, current.y);
  };

  const move = (event) => {
    if (!drawing) return;
    event.preventDefault();
    const current = point(event);
    ctx.lineTo(current.x, current.y);
    ctx.stroke();
    dirty = true;
  };

  const end = () => {
    if (!drawing) return;
    drawing = false;
    if (dirty) data.value = pad.toDataURL('image/png');
  };

  reset();
  pad.addEventListener('mousedown', start);
  pad.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  pad.addEventListener('touchstart', start, { passive: false });
  pad.addEventListener('touchmove', move, { passive: false });
  pad.addEventListener('touchend', end);
  if (clear) clear.addEventListener('click', reset);
})();
