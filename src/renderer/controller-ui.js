// 将手柄语义动作限定在一个界面作用域内，避免菜单编辑穿透到棋盘。
const ACTIONS = new Set(['up', 'down', 'left', 'right', 'reveal']);
const CONTROL_SELECTOR = 'button, input, select, textarea, a[href], summary, [tabindex]';

function available(element) {
  if (element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true') return false;
  if (element.matches('input[type="hidden"]') || element.getAttribute('tabindex') === '-1') return false;
  for (let node = element; node; node = node.parentElement) {
    if (node.hidden || node.inert || node.hasAttribute('inert') || node.classList.contains('hidden')) return false;
    const style = node.ownerDocument.defaultView.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    // 未展开的 details 仅允许 summary 参与导航。
    if (node.tagName === 'DETAILS' && !node.open && !node.querySelector('summary')?.contains(element)) return false;
  }
  return true;
}

function focusControl(element) {
  element.focus({ preventScroll: true });
  element.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

function dispatch(element, type) {
  const EventClass = element.ownerDocument.defaultView.Event;
  element.dispatchEvent(new EventClass(type, { bubbles: true }));
}

function finiteAttribute(element, name, fallback) {
  const raw = element.getAttribute(name);
  return raw !== null && raw.trim() !== '' && Number.isFinite(Number(raw)) ? Number(raw) : fallback;
}

function editNumber(element, direction) {
  if (element.readOnly) return;
  const previous = element.value;
  try {
    // 原生步进同时处理 step 基准、十进制精度与 min/max。
    if (direction < 0) element.stepDown();
    else element.stepUp();
  } catch {
    // step="any" 无原生步进值，使用 1；异常值仍被上下界限制。
    const min = finiteAttribute(element, 'min', -Infinity);
    const max = finiteAttribute(element, 'max', Infinity);
    const rawStep = finiteAttribute(element, 'step', 1);
    const step = rawStep > 0 ? rawStep : 1;
    const current = Number.isFinite(element.valueAsNumber) ? element.valueAsNumber : Number.isFinite(min) ? min : 0;
    element.value = String(Math.max(min, Math.min(max, current + direction * step)));
  }
  if (element.value !== previous) {
    dispatch(element, 'input');
    dispatch(element, 'change');
  }
}

function editSelect(element, direction) {
  const options = [...element.options].filter(option => !option.disabled && !option.hidden && !option.parentElement?.disabled);
  if (!options.length) return;
  const index = options.findIndex(option => option.index === element.selectedIndex);
  const next = options[Math.max(0, Math.min(options.length - 1, index < 0 ? 0 : index + direction))];
  if (element.selectedIndex !== next.index) {
    element.selectedIndex = next.index;
    dispatch(element, 'change');
  }
}

/** 导航或编辑 scope 内控件；未识别动作、无可用控件时返回 false。 */
export function navigateControls(scope, action) {
  if (!ACTIONS.has(action) || typeof scope?.querySelectorAll !== 'function') return false;
  const controls = [...scope.querySelectorAll(CONTROL_SELECTOR)].filter(available);
  if (!controls.length) return false;
  const active = controls[0].ownerDocument.activeElement;
  const current = controls.indexOf(active);
  if (current < 0) {
    focusControl(controls[0]);
    return true;
  }

  const element = controls[current];
  const horizontal = action === 'left' || action === 'right';
  if (action === 'reveal') {
    if (element.matches('button, input[type="button"], input[type="submit"], input[type="reset"], input[type="checkbox"], input[type="radio"], a[href], summary')) element.click();
    else focusControl(element);
    return true;
  }
  if (horizontal && element.matches('select')) {
    editSelect(element, action === 'right' ? 1 : -1);
    return true;
  }
  if (horizontal && element.matches('input[type="number"]')) {
    editNumber(element, action === 'right' ? 1 : -1);
    return true;
  }
  if (horizontal && element.matches('input[type="checkbox"]')) {
    if (element.checked !== (action === 'right')) element.click();
    return true;
  }

  let group = controls;
  let step = 1;
  const grid = element.closest('[data-controller-grid]');
  const columns = Number(grid?.dataset.controllerGrid);
  if (grid && scope.contains(grid) && Number.isInteger(columns) && columns > 0) {
    group = controls.filter(control => grid.contains(control));
    if (!horizontal) step = columns;
  }
  const direction = action === 'up' || action === 'left' ? -1 : 1;
  const index = group.indexOf(element);
  const candidate = index + direction * step;
  if (group !== controls && (candidate < 0 || candidate >= group.length) && controls.length > group.length) {
    // 越过键盘任一边缘时进入同一模态的输入框或提交区，不能把焦点困在字母区。
    const edge = direction < 0 ? controls.indexOf(group[0]) - 1 : controls.indexOf(group.at(-1)) + 1;
    focusControl(controls[(edge + controls.length) % controls.length]);
    return true;
  }
  const next = ((candidate % group.length) + group.length) % group.length;
  focusControl(group[next]);
  return true;
}
