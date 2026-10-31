// 浏览器手柄轮询：读取标准 Gamepad API，转发纯映射器产生的语义动作。
import { createGamepadMapper } from '../core/gamepad.js';

export function startGamepad({
  onAction = () => {},
  onStatus = () => {},
  isEnabled = () => true,
  getGamepads = () => globalThis.navigator?.getGamepads?.() ?? [],
  requestFrame = callback => globalThis.requestAnimationFrame?.(callback) ?? null,
  cancelFrame = frame => globalThis.cancelAnimationFrame?.(frame),
} = {}) {
  const mapper = createGamepadMapper();
  let stopped = false;
  let pendingFrame = null;
  let previousStatus = null;

  function schedule() {
    if (stopped) return;
    try {
      pendingFrame = requestFrame(tick);
    } catch {
      pendingFrame = null;
      stopped = true;
    }
  }

  function tick(now) {
    if (stopped) return;
    pendingFrame = null;
    let pads = [];
    let enabled = false;
    try { pads = getGamepads(); } catch { /* API 不可用按未连接处理。 */ }
    try { enabled = Boolean(isEnabled()); } catch { /* 不确定界面状态时禁用输入。 */ }
    const { actions, ...status } = mapper.poll(pads, now, enabled);
    if (!previousStatus || Object.keys(status).some(key => previousStatus[key] !== status[key])) {
      previousStatus = status;
      onStatus(status);
    }
    for (const action of actions) {
      if (stopped) break;
      onAction(action);
    }
    schedule();
  }

  schedule();
  return function stop() {
    if (stopped) return;
    stopped = true;
    mapper.reset();
    if (pendingFrame !== null && pendingFrame !== undefined) {
      try { cancelFrame(pendingFrame); } catch { /* 已结束的帧无需重复取消。 */ }
    }
    pendingFrame = null;
  };
}
