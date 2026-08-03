// 扫雷游戏状态机 + 正向累加计时（纯 ESM，零 DOM，零副作用）
// 依赖 board.js 的棋盘操作与 solve.js 的防猜测重排生成器。
// game 内部自行组合 randomMineSet + setMines 布雷，不调用 board.placeMines，
// 以便测试通过 mock board.randomMineSet 实现确定性布局。

import {
  createBoard,
  randomMineSet,
  setMines,
  reveal as revealBoard,
  chordLeft as boardChordLeft,
  chordRight as boardChordRight,
  cycleMark as boardCycleMark,
  isWin,
  revealAllMines,
  indexAt,
} from './board.js';
import { generateAntiGuess } from './solve.js';

export const STATE = {
  READY: 'ready',
  PLAYING: 'playing',
  PAUSED: 'paused',
  WON: 'won',
  LOST: 'lost',
};

const WARNING_DENSITY = '防猜测已关闭：雷密度过高，无法保证无猜';
const WARNING_RETRIES = '防猜测已关闭：重排 20 次仍无法保证无猜';

/**
 * 创建游戏实例。
 * @param {{ rows:number, cols:number, mines:number, antiGuess:boolean, mode:string }} config
 * @param {{ now?: () => number }} [opts] now 可注入假时钟，默认 () => Date.now()
 * @returns {Game}
 */
export function createGame(config, opts = {}) {
  return new Game(config, opts);
}

class Game {
  #now;
  #listeners;
  #accumulated;
  #startAt;
  #finalTimeMs;

  constructor(config, opts = {}) {
    this.rows = config.rows;
    this.cols = config.cols;
    this.mines = config.mines;
    this.mode = config.mode;
    this.antiGuess = Boolean(config.antiGuess);

    this.board = createBoard(this.rows, this.cols, this.mines);
    this.state = STATE.READY;
    this.antiGuessActive = false;
    this.warning = null;

    this.#now = opts.now || (() => Date.now());
    this.#listeners = Object.create(null);
    this.#accumulated = 0;
    this.#startAt = 0;
    this.#finalTimeMs = null;
  }

  /** 注册事件：'win' | 'lose' | 'warning' */
  on(evt, cb) {
    if (!this.#listeners[evt]) this.#listeners[evt] = [];
    this.#listeners[evt].push(cb);
  }

  #emit(evt, payload) {
    const cbs = this.#listeners[evt];
    if (cbs) for (const cb of cbs) cb(payload);
  }

  /** 重置：新空棋盘，state=READY，计时清零，warning=null，antiGuessActive 复位 */
  restart() {
    this.board = createBoard(this.rows, this.cols, this.mines);
    this.state = STATE.READY;
    this.antiGuessActive = false;
    this.warning = null;
    this.#accumulated = 0;
    this.#startAt = 0;
    this.#finalTimeMs = null;
  }

  /**
   * 翻开格子。READY 下为首次点击（触发布雷），PLAYING 下正常翻开。
   * @returns {{ type:'reveal'|'win'|'lose'|'noop' }}
   */
  reveal(row, col) {
    if (this.state === STATE.READY) {
      return this.#firstReveal(row, col);
    }
    if (this.state !== STATE.PLAYING) {
      return { type: 'noop' };
    }
    const result = revealBoard(this.board, row, col);
    if (result.revealed.length === 0 && !result.exploded) {
      return { type: 'noop' };
    }
    return this.#settle(result);
  }

  /**
   * 左键 chord：已翻开且 count>0 格上，相邻旗数==count 时翻开相邻未翻开格。
   * @returns {{ type:'reveal'|'win'|'lose'|'noop' }}
   */
  chordLeft(row, col) {
    if (this.state !== STATE.PLAYING) {
      return { type: 'noop' };
    }
    const result = boardChordLeft(this.board, row, col);
    if (result.revealed.length === 0 && !result.exploded) {
      return { type: 'noop' };
    }
    return this.#settle(result);
  }

  /**
   * 右键 chord：已翻开且 count>0 格上，count==相邻未翻开格数 时批量标旗。
   * @returns {{ type:'flag'|'blocked'|'noop' }}
   */
  chordRight(row, col) {
    if (this.state !== STATE.PLAYING) {
      return { type: 'noop' };
    }
    const result = boardChordRight(this.board, row, col);
    if (result.blocked) {
      return { type: 'blocked' };
    }
    if (result.flagged.length > 0) {
      return { type: 'flag' };
    }
    return { type: 'noop' };
  }

  /**
   * 标记循环：hidden → flagged（旗满则 blocked）→ questioned → hidden。
   * READY/PLAYING 下允许；暂停与终态忽略。
   * @returns {{ type:'mark', state:string, blocked:boolean }}
   */
  cycleMark(row, col) {
    if (this.state !== STATE.READY && this.state !== STATE.PLAYING) {
      return { type: 'noop' };
    }
    const result = boardCycleMark(this.board, row, col);
    return { type: 'mark', state: result.state, blocked: result.blocked };
  }

  /** 暂停：冻结当前累计计时，进入 PAUSED（仅从 PLAYING 可进入） */
  pause() {
    if (this.state !== STATE.PLAYING) return;
    this.#accumulated += this.#now() - this.#startAt;
    this.state = STATE.PAUSED;
  }

  /** 继续：重设计时基点，回到 PLAYING（仅从 PAUSED 可进入） */
  resume() {
    if (this.state !== STATE.PAUSED) return;
    this.#startAt = this.#now();
    this.state = STATE.PLAYING;
  }

  /** 正向累加计时；暂停时冻结；终态返回固化的 finalTimeMs */
  getElapsedMs() {
    if (this.#finalTimeMs != null) return this.#finalTimeMs;
    if (this.state === STATE.PLAYING) {
      return this.#accumulated + (this.#now() - this.#startAt);
    }
    return this.#accumulated;
  }

  /** 剩余雷数 = max(0, mines - flagCount) */
  getRemainingMines() {
    return Math.max(0, this.mines - this.board.flagCount);
  }

  /** 首次点击：确定 safeIdx，按防猜测三分支布雷，随后翻开首格 */
  #firstReveal(row, col) {
    const safeIdx = indexAt(this.rows, this.cols, row, col);
    if (safeIdx === -1) return { type: 'noop' };

    if (this.antiGuess) {
      const result = generateAntiGuess(this.rows, this.cols, this.mines, safeIdx);
      if (result.ok) {
        // 可解：防猜测生效，直接用返回布局布雷
        this.antiGuessActive = true;
        this.warning = null;
        setMines(this.board, result.mineSet);
      } else if (result.reason === 'density') {
        // 密度超限：防猜测关闭，回退普通随机布雷
        this.antiGuessActive = false;
        this.warning = WARNING_DENSITY;
        this.#emit('warning', this.warning);
        setMines(this.board, randomMineSet(this.rows, this.cols, this.mines, safeIdx));
      } else {
        // 重排耗尽：防猜测关闭，使用最后一次 mineSet 布雷
        this.antiGuessActive = false;
        this.warning = WARNING_RETRIES;
        this.#emit('warning', this.warning);
        setMines(this.board, result.mineSet);
      }
    } else {
      // 防猜测关闭：普通随机布雷（首点安全）
      this.antiGuessActive = false;
      this.warning = null;
      setMines(this.board, randomMineSet(this.rows, this.cols, this.mines, safeIdx));
    }

    this.state = STATE.PLAYING;
    this.#startAt = this.#now();
    const result = revealBoard(this.board, row, col);
    return this.#settle(result);
  }

  /** 结算：踩雷→LOST（revealAllMines+固化计时）；翻开全部非雷→WON（固化计时） */
  #settle(result) {
    if (result.exploded) {
      const timeMs = this.getElapsedMs();
      this.state = STATE.LOST;
      revealAllMines(this.board);
      this.#finalTimeMs = timeMs;
      this.#emit('lose', {
        timeMs,
        mode: this.mode,
        antiGuessActive: this.antiGuessActive,
      });
      return { type: 'lose' };
    }
    if (isWin(this.board)) {
      const timeMs = this.getElapsedMs();
      this.state = STATE.WON;
      this.#finalTimeMs = timeMs;
      this.#emit('win', {
        timeMs,
        mode: this.mode,
        antiGuessActive: this.antiGuessActive,
        rows: this.rows,
        cols: this.cols,
        mines: this.mines,
      });
      return { type: 'win' };
    }
    return { type: 'reveal' };
  }
}
