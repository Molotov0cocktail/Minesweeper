// 标准手柄输入映射。纯 ESM，无浏览器依赖；每次 poll 只返回语义动作。
const DEAD_ZONE = 0.35;
const NAV_DELAY_MS = 300;
const NAV_REPEAT_MS = 100;
const RESTART_HOLD_MS = 800;
export const DEFAULT_GAMEPAD_BINDINGS = Object.freeze({
  reveal: 0,
  mark: 1,
  menu: 2,
  pause: 9,
  restart: 3,
  focus: 11,
  help: 8,
});
const BINDING_ACTIONS = Object.keys(DEFAULT_GAMEPAD_BINDINGS);
const DIRECTION_BUTTONS = [[12, 'up'], [13, 'down'], [14, 'left'], [15, 'right']];

export function isValidGamepadBindings(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      Reflect.ownKeys(value).length !== BINDING_ACTIONS.length) return false;
  const buttons = new Set();
  for (const action of BINDING_ACTIONS) {
    if (!Object.hasOwn(value, action)) return false;
    const button = value[action];
    if (!Number.isInteger(button) || button < 0 || button > 11 || buttons.has(button)) return false;
    buttons.add(button);
  }
  return true;
}

export function rebindGamepad(bindings, action, button) {
  const result = { ...bindings };
  if (!isValidGamepadBindings(bindings) || !BINDING_ACTIONS.includes(action) ||
      !Number.isInteger(button) || button < 0 || button > 11) return result;
  const occupied = BINDING_ACTIONS.find(key => bindings[key] === button);
  if (occupied && occupied !== action) result[occupied] = bindings[action];
  result[action] = button;
  return result;
}

function isPressed(pad, index) {
  const button = Array.isArray(pad.buttons) ? pad.buttons[index] : null;
  return button?.pressed === true || (Number.isFinite(button?.value) && button.value > 0.5);
}

function directionOf(pad) {
  for (const [button, direction] of DIRECTION_BUTTONS) {
    if (isPressed(pad, button)) return direction;
  }
  const axes = Array.isArray(pad.axes) ? pad.axes : [];
  const x = Number.isFinite(axes[0]) ? axes[0] : 0;
  const y = Number.isFinite(axes[1]) ? axes[1] : 0;
  if (Math.max(Math.abs(x), Math.abs(y)) <= DEAD_ZONE) return null;
  if (Math.abs(x) >= Math.abs(y)) return x < 0 ? 'left' : 'right';
  return y < 0 ? 'up' : 'down';
}

export function createGamepadMapper({ bindings = DEFAULT_GAMEPAD_BINDINGS } = {}) {
  let currentBindings = { ...(isValidGamepadBindings(bindings) ? bindings : DEFAULT_GAMEPAD_BINDINGS) };
  let device = null;
  let armed = false;
  let previousButtons = new Set();
  let previousDirection = null;
  let repeatAt = 0;
  let restartSince = null;
  let restarted = false;

  function reset() {
    device = null;
    armed = false;
    previousButtons = new Set();
    previousDirection = null;
    repeatAt = 0;
    restartSince = null;
    restarted = false;
  }

  function setBindings(next) {
    if (!isValidGamepadBindings(next) || BINDING_ACTIONS.every(action => next[action] === currentBindings[action])) {
      return false;
    }
    currentBindings = { ...next };
    reset();
    return true;
  }

  function poll(gamepads, now, enabled = true) {
    const pads = Array.isArray(gamepads)
      ? gamepads.map((pad, position) => ({ pad, position })).filter(({ pad }) => pad?.connected === true)
      : [];
    pads.sort((a, b) => {
      const indexA = Number.isInteger(a.pad.index) && a.pad.index >= 0 ? a.pad.index : a.position;
      const indexB = Number.isInteger(b.pad.index) && b.pad.index >= 0 ? b.pad.index : b.position;
      return indexA - indexB;
    });
    const selected = pads.find(({ pad }) => pad.mapping === 'standard') || pads[0];
    const pad = selected?.pad;
    const status = {
      connected: !!pad,
      supported: pad?.mapping === 'standard',
      id: typeof pad?.id === 'string' ? pad.id : '',
      actions: [],
    };
    if (!pad || !status.supported || !enabled) {
      reset();
      return status;
    }

    const identity = `${Number.isInteger(pad.index) ? pad.index : selected.position}:${status.id}`;
    if (identity !== device) {
      reset();
      device = identity;
    }
    const boundButtons = [...Object.values(currentBindings), ...DIRECTION_BUTTONS.map(([index]) => index)];
    const buttons = new Set(boundButtons.filter(index => isPressed(pad, index)));
    const direction = directionOf(pad);
    if (!armed) {
      // 插入设备、切回窗口或退出输入框后，都先等摇杆与绑定键回中立。
      if (buttons.size === 0 && direction === null) armed = true;
      return status;
    }

    const time = Number.isFinite(now) ? now : 0;
    if (direction !== previousDirection) {
      if (direction) status.actions.push(direction);
      repeatAt = time + NAV_DELAY_MS;
    } else if (direction && time >= repeatAt) {
      status.actions.push(direction);
      // 掉帧后只移动一次，避免补发积压动作跨越棋盘。
      repeatAt = time + NAV_REPEAT_MS;
    }
    previousDirection = direction;
    for (const action of BINDING_ACTIONS) {
      if (action === 'restart') continue;
      const button = currentBindings[action];
      if (buttons.has(button) && !previousButtons.has(button)) status.actions.push(action);
    }

    const restartButton = currentBindings.restart;
    if (!buttons.has(restartButton)) {
      restartSince = null;
      restarted = false;
    } else {
      if (!previousButtons.has(restartButton)) restartSince = time;
      if (!restarted && restartSince !== null && time - restartSince >= RESTART_HOLD_MS) {
        status.actions.push('restart');
        restarted = true;
      }
    }
    previousButtons = buttons;
    return status;
  }

  return { poll, reset, setBindings };
}
