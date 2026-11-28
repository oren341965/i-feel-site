const turnDuration = 570;

export function turnPaper(sheet, previousPage, direction) {
  const leaf = document.createElement('div');
  leaf.className = 'reader-turn-leaf';
  leaf.setAttribute('aria-hidden', 'true');
  leaf.style.transformOrigin = direction > 0 ? 'right center' : 'left center';

  const front = document.createElement('div');
  front.className = 'reader-turn-front';
  previousPage.setAttribute('role', 'presentation');
  front.append(previousPage);
  const back = document.createElement('div');
  back.className = 'reader-turn-back';
  leaf.append(front, back);
  sheet.append(leaf);

  const angle = direction * -1;
  const animation = leaf.animate([
    { transform: 'perspective(1100px) rotateY(0deg)', opacity: 1 },
    { transform: `perspective(1100px) rotateY(${angle * 38}deg) rotateZ(${angle * 1.5}deg)`, opacity: 1, offset: 0.27 },
    { transform: `perspective(1100px) rotateY(${angle * 101}deg)`, opacity: 1, offset: 0.63 },
    { transform: `perspective(1100px) rotateY(${angle * 174}deg)`, opacity: 0 },
  ], { duration: turnDuration, easing: 'ease-in-out' });
  animation.finished.then(() => leaf.remove(), () => leaf.remove());
  return animation;
}

export function createPageSound() {
  let context;
  let buffer;
  let playing;

  function unlock() {
    const AudioContext = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      context ??= new AudioContext();
      if (context.state !== 'running') context.resume().catch(() => {});
    } catch {
      // Sound is optional when audio is unavailable.
    }
  }

  function stop() {
    playing?.stop();
    playing = undefined;
  }

  function play() {
    if (context?.state !== 'running') return;
    if (!buffer) {
      const rate = context.sampleRate;
      buffer = context.createBuffer(1, Math.round(rate * 0.5), rate);
      const samples = buffer.getChannelData(0);
      let low = 0;
      let mid = 0;
      for (let index = 0; index < samples.length; index++) {
        const time = index / rate;
        const noise = Math.random() * 2 - 1;
        low += (noise - low) * Math.min(1, 1900 / rate);
        mid += (noise - mid) * Math.min(1, 13500 / rate);
        const lift = Math.exp(-(((time - 0.09) / 0.052) ** 2));
        const flutter = Math.exp(-(((time - 0.23) / 0.1) ** 2)) * (0.7 + 0.3 * Math.sin(time * 158));
        const landing = Math.exp(-(((time - 0.424) / 0.019) ** 2));
        const fade = Math.min(1, time * 110, (0.5 - time) * 130);
        samples[index] = (mid - low) * (0.19 * lift + 0.15 * flutter + 0.29 * landing) * fade;
      }
    }
    stop();
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.onended = () => {
      source.disconnect();
      if (playing === source) playing = undefined;
    };
    source.start();
    playing = source;
  }

  return { unlock, play, stop };
}
