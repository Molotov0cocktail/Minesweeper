// 每次首点独占一个 Worker：取消和超时均硬终止，不在主线程继续求解。
export const GENERATION_TIMEOUT_MS = 8000;

export function createGenerationClient({
  workerFactory = () => new Worker(new URL('./generation-worker.js', import.meta.url), { type: 'module' }),
  timeoutMs = GENERATION_TIMEOUT_MS,
} = {}) {
  let pending = null;
  let nextId = 0;
  let destroyed = false;
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : GENERATION_TIMEOUT_MS;

  function cancel() {
    pending?.finish(new Error('生成已取消'));
  }

  function prepare(config, startIdx) {
    cancel();
    return new Promise((resolve, reject) => {
      if (destroyed) {
        reject(new Error('生成器已关闭'));
        return;
      }
      let worker;
      try {
        worker = workerFactory();
      } catch {
        reject(new Error('无法启动棋盘生成'));
        return;
      }

      const id = ++nextId;
      let settled = false;
      let timer;
      const listeners = [];
      const request = {
        finish(error, result) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          for (const [type, handler] of listeners) {
            try { worker.removeEventListener(type, handler); } catch { /* 清理其余资源 */ }
          }
          try { worker?.terminate?.(); } catch { /* 已结束的 Worker 无需再处理 */ }
          if (pending === request) pending = null;
          if (error) reject(error);
          else resolve(result);
        },
      };
      pending = request;
      function listen(type, handler) {
        worker.addEventListener(type, handler);
        listeners.push([type, handler]);
      }

      try {
        if (!worker || ['addEventListener', 'removeEventListener', 'postMessage', 'terminate'].some(key => typeof worker[key] !== 'function')) {
          throw new Error('生成器无效');
        }
        listen('message', ({ data }) => {
          if (!data || typeof data !== 'object' || Array.isArray(data)) {
            request.finish(new Error('生成响应无效'));
            return;
          }
          if (data.id !== id) return;
          if (data.error !== undefined || !data.result || typeof data.result !== 'object' || Array.isArray(data.result)) {
            request.finish(new Error('棋盘生成失败'));
            return;
          }
          request.finish(null, data.result);
        });
        listen('error', (event) => {
          event.preventDefault?.();
          request.finish(new Error('棋盘生成失败'));
        });
        listen('messageerror', () => request.finish(new Error('生成通信失败')));
        timer = setTimeout(() => request.finish(new Error('生成超时')), timeout);
        worker.postMessage({ id, config, startIdx });
      } catch {
        request.finish(new Error('无法启动棋盘生成'));
      }
    });
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    cancel();
  }

  return { prepare, cancel, destroy };
}
