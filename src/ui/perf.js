// Settings row for the opt-in PixiJS (WebGPU/WebGL) board renderer (src/game/perf.js). Canvas2D stays the default.
import { t } from '../i18n.js';
import './perf.css';
import { gpuSetting, setGpu } from '../game/perf.js';

export function gpuRow() {
  const on = gpuSetting();
  return `<div class="setrow pfgpu"><span>${t('perfGpu')}</span><button class="toggle ${on ? 'on' : ''}" data-act="perfgpu"><i></i><b>${on ? t('on') : t('off')}</b></button></div>`;
}

export function toggleGpu() { setGpu(!gpuSetting()); }
