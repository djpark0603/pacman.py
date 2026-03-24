const TILE_SIZE = 24;
const MOVE_DELAY_MS = 188;
const POWER_TICKS = 36;
const SCATTER_TICKS = 10;
const BOARD_PADDING = 12;

const UP = Object.freeze({ dr: -1, dc: 0, key: "up" });
const DOWN = Object.freeze({ dr: 1, dc: 0, key: "down" });
const LEFT = Object.freeze({ dr: 0, dc: -1, key: "left" });
const RIGHT = Object.freeze({ dr: 0, dc: 1, key: "right" });
const DIRECTIONS = [UP, DOWN, LEFT, RIGHT];
const OPPOSITE = {
  up: DOWN,
  down: UP,
  left: RIGHT,
  right: LEFT,
};

const LEVEL_MAP = [
  "###############",
  "#o....#.#....o#",
  "#.###.#.#.###.#",
  "#.............#",
  "#.###.###.###.#",
  "#.....#.#.....#",
  "###.#.#.#.#.###",
  "#...#..P..#...#",
  "###.#.#.#.#.###",
  "#.....#.#.....#",
  "#.###.###.###.#",
  "#....G...G....#",
  "#.###.#.#.###.#",
  "#o....#.#....o#",
  "###############",
];

const ROWS = LEVEL_MAP.length;
const COLS = LEVEL_MAP[0].length;
const CANVAS_WIDTH = COLS * TILE_SIZE + BOARD_PADDING * 2;
const CANVAS_HEIGHT = ROWS * TILE_SIZE + BOARD_PADDING * 2;

const BG_COLOR = "#050505";
const WALL_COLOR = "#1238ff";
const PELLET_COLOR = "#f6f1d3";
const POWER_COLOR = "#fff4b0";
const PLAYER_COLOR = "#ffd84d";
const FRIGHTENED_COLOR = "#2f64ff";
const TEXT_COLOR = "#f4f4f4";

const KEY_TO_DIRECTION = {
  ArrowUp: UP,
  ArrowDown: DOWN,
  ArrowLeft: LEFT,
  ArrowRight: RIGHT,
  w: UP,
  W: UP,
  s: DOWN,
  S: DOWN,
  a: LEFT,
  A: LEFT,
  d: RIGHT,
  D: RIGHT,
};

const BUTTON_DIRECTIONS = {
  up: UP,
  down: DOWN,
  left: LEFT,
  right: RIGHT,
};

export function initPacmanEasterEgg() {
  const elements = {
    canvas: document.querySelector("#pacman-canvas"),
    closeButton: document.querySelector("#pacman-close-button"),
    dialog: document.querySelector("#pacman-dialog"),
    easterEggCard: document.querySelector("#pacman-easter-egg"),
    launchButton: document.querySelector("#pacman-launch-button"),
    padButtons: [...document.querySelectorAll("[data-pacman-direction]")],
    restartButton: document.querySelector("#pacman-restart-button"),
    status: document.querySelector("#pacman-status"),
  };

  if (!elements.canvas || !elements.dialog || !elements.launchButton || !elements.status) {
    return null;
  }

  const game = new PacmanEasterEgg(elements);
  game.init();
  return game;
}

class PacmanEasterEgg {
  constructor(elements) {
    this.elements = elements;
    this.ctx = elements.canvas.getContext("2d");
    this.rafId = 0;
    this.animationTime = 0;
    this.didWin = false;
    this.ghosts = [];
    this.interpolation = 1;
    this.isRunning = true;
    this.lastFrameTime = 0;
    this.moveAccumulator = 0;
    this.pendingDirection = LEFT;
    this.playerDirection = LEFT;
    this.powerPellets = new Set();
    this.powerTicks = 0;
    this.pellets = new Set();
    this.playerCol = 1;
    this.playerPrevCol = 1;
    this.playerPrevRow = 1;
    this.playerRow = 1;
    this.score = 0;
    this.tickCount = 0;
    this.walls = new Set();

    this.gameLoop = this.gameLoop.bind(this);
    this.handleKeydown = this.handleKeydown.bind(this);
  }

  init() {
    this.elements.canvas.width = CANVAS_WIDTH;
    this.elements.canvas.height = CANVAS_HEIGHT;

    this.elements.launchButton.addEventListener("click", () => {
      this.open();
    });
    this.elements.closeButton.addEventListener("click", () => {
      this.close();
    });
    this.elements.restartButton.addEventListener("click", () => {
      this.resetGame();
    });
    this.elements.dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.close();
    });

    for (const button of this.elements.padButtons) {
      button.addEventListener("click", () => {
        const direction = BUTTON_DIRECTIONS[button.dataset.pacmanDirection];
        if (direction) {
          this.pendingDirection = direction;
          this.elements.canvas.focus();
        }
      });
    }

    document.addEventListener("keydown", this.handleKeydown);
    this.observeReveal();
    this.resetGame();
  }

  observeReveal() {
    if (!("IntersectionObserver" in window)) {
      this.elements.easterEggCard.classList.add("is-revealed");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            this.elements.easterEggCard.classList.add("is-revealed");
            observer.disconnect();
            break;
          }
        }
      },
      {
        threshold: 0.45,
      }
    );

    observer.observe(this.elements.easterEggCard);
  }

  open() {
    this.resetGame();

    if (typeof this.elements.dialog.showModal === "function") {
      this.elements.dialog.showModal();
    } else {
      this.elements.dialog.setAttribute("open", "open");
    }

    this.startLoop();
    this.elements.canvas.focus();
  }

  close() {
    this.stopLoop();
    if (this.elements.dialog.open) {
      this.elements.dialog.close();
    }
  }

  startLoop() {
    this.stopLoop();
    this.lastFrameTime = performance.now();
    this.rafId = window.requestAnimationFrame(this.gameLoop);
  }

  stopLoop() {
    if (this.rafId) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  handleKeydown(event) {
    if (!this.elements.dialog.open) {
      return;
    }

    const direction = KEY_TO_DIRECTION[event.key];
    if (direction) {
      event.preventDefault();
      this.pendingDirection = direction;
      return;
    }

    if (event.code === "Space") {
      event.preventDefault();
      if (!this.isRunning) {
        this.resetGame();
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
    }
  }

  resetGame() {
    this.walls = new Set();
    this.pellets = new Set();
    this.powerPellets = new Set();

    const ghostSpawns = [];
    let playerStart = { row: 1, col: 1 };

    for (let rowIndex = 0; rowIndex < LEVEL_MAP.length; rowIndex += 1) {
      for (let colIndex = 0; colIndex < LEVEL_MAP[rowIndex].length; colIndex += 1) {
        const tile = LEVEL_MAP[rowIndex][colIndex];
        const key = this.cellKey(rowIndex, colIndex);

        if (tile === "#") {
          this.walls.add(key);
        } else if (tile === ".") {
          this.pellets.add(key);
        } else if (tile === "o") {
          this.powerPellets.add(key);
        } else if (tile === "P") {
          playerStart = { row: rowIndex, col: colIndex };
        } else if (tile === "G") {
          ghostSpawns.push({ row: rowIndex, col: colIndex });
        }
      }
    }

    const ghostSpecs = [
      { color: "#ff5f5f", personality: "chase", scatterTarget: [1, COLS - 2] },
      { color: "#ff9de1", personality: "ambush", scatterTarget: [1, 1] },
      { color: "#67e8f9", personality: "patrol", scatterTarget: [ROWS - 2, COLS - 2] },
      { color: "#ffb347", personality: "patrol", scatterTarget: [ROWS - 2, 1] },
    ];

    this.ghosts = ghostSpawns.map((spawn, index) => {
      const spec = ghostSpecs[index % ghostSpecs.length];
      return {
        color: spec.color,
        direction: LEFT,
        personality: spec.personality,
        prevCol: spawn.col,
        prevRow: spawn.row,
        row: spawn.row,
        col: spawn.col,
        scatterTarget: spec.scatterTarget,
        startCol: spawn.col,
        startRow: spawn.row,
      };
    });

    this.playerRow = playerStart.row;
    this.playerCol = playerStart.col;
    this.playerPrevRow = playerStart.row;
    this.playerPrevCol = playerStart.col;
    this.playerDirection = LEFT;
    this.pendingDirection = LEFT;
    this.score = 0;
    this.tickCount = 0;
    this.powerTicks = 0;
    this.isRunning = true;
    this.didWin = false;
    this.moveAccumulator = 0;
    this.interpolation = 1;
    this.animationTime = 0;
    this.lastFrameTime = performance.now();
    this.updateStatus();
    this.draw();
  }

  gameLoop(timestamp) {
    if (!this.elements.dialog.open) {
      this.stopLoop();
      return;
    }

    const moveInterval = MOVE_DELAY_MS / 1000;
    const elapsed = Math.min((timestamp - this.lastFrameTime) / 1000, moveInterval * 2);
    this.lastFrameTime = timestamp;
    this.animationTime += elapsed;

    if (this.isRunning) {
      this.moveAccumulator += elapsed;

      while (this.moveAccumulator >= moveInterval && this.isRunning) {
        this.moveAccumulator -= moveInterval;
        this.advanceGameState();
      }

      this.interpolation = this.moveAccumulator / moveInterval;
    } else {
      this.interpolation = 1;
    }

    this.draw();
    this.rafId = window.requestAnimationFrame(this.gameLoop);
  }

  advanceGameState() {
    this.playerPrevRow = this.playerRow;
    this.playerPrevCol = this.playerCol;

    for (const ghost of this.ghosts) {
      ghost.prevRow = ghost.row;
      ghost.prevCol = ghost.col;
    }

    this.tickCount += 1;
    const previousPlayerPosition = { row: this.playerRow, col: this.playerCol };
    const previousGhostPositions = this.ghosts.map((ghost) => ({
      row: ghost.row,
      col: ghost.col,
    }));

    this.movePlayer();
    for (const ghost of this.ghosts) {
      this.moveGhost(ghost);
    }

    this.handleCollisions(previousPlayerPosition, previousGhostPositions);

    if (this.powerTicks > 0) {
      this.powerTicks -= 1;
    }

    if (!this.pellets.size && !this.powerPellets.size && this.isRunning) {
      this.didWin = true;
      this.isRunning = false;
    }

    this.updateStatus();
  }

  movePlayer() {
    if (this.canMove(this.playerRow, this.playerCol, this.pendingDirection)) {
      this.playerDirection = this.pendingDirection;
    }

    if (this.canMove(this.playerRow, this.playerCol, this.playerDirection)) {
      this.playerRow += this.playerDirection.dr;
      this.playerCol += this.playerDirection.dc;
    }

    const playerKey = this.cellKey(this.playerRow, this.playerCol);
    if (this.pellets.has(playerKey)) {
      this.pellets.delete(playerKey);
      this.score += 10;
    } else if (this.powerPellets.has(playerKey)) {
      this.powerPellets.delete(playerKey);
      this.score += 50;
      this.powerTicks = POWER_TICKS;
    }
  }

  moveGhost(ghost) {
    let options = DIRECTIONS.filter((direction) =>
      this.canMove(ghost.row, ghost.col, direction)
    );

    if (options.length > 1) {
      options = options.filter((direction) => direction !== OPPOSITE[ghost.direction.key]);
    }

    if (!options.length) {
      options = [OPPOSITE[ghost.direction.key]];
    }

    const rankedOptions =
      this.powerTicks > 0
        ? this.rankFrightenedMoves(ghost, options)
        : this.rankHuntingMoves(ghost, options);

    const bestScore = rankedOptions[0].score;
    const bestDirections = rankedOptions
      .filter((option) => option.score === bestScore)
      .map((option) => option.direction);

    ghost.direction =
      bestDirections[Math.floor(Math.random() * bestDirections.length)] ?? options[0];
    ghost.row += ghost.direction.dr;
    ghost.col += ghost.direction.dc;
  }

  rankFrightenedMoves(ghost, options) {
    return options
      .map((direction) => {
        const nextRow = ghost.row + direction.dr;
        const nextCol = ghost.col + direction.dc;
        const distance =
          Math.abs(nextRow - this.playerRow) + Math.abs(nextCol - this.playerCol);
        return {
          direction,
          score: -distance,
        };
      })
      .sort((left, right) => left.score - right.score);
  }

  rankHuntingMoves(ghost, options) {
    const [targetRow, targetCol] = this.getGhostTarget(ghost);

    return options
      .map((direction) => {
        const nextRow = ghost.row + direction.dr;
        const nextCol = ghost.col + direction.dc;
        const distance = Math.abs(nextRow - targetRow) + Math.abs(nextCol - targetCol);
        return {
          direction,
          score: distance,
        };
      })
      .sort((left, right) => left.score - right.score);
  }

  getGhostTarget(ghost) {
    if (ghost.personality === "ambush") {
      return this.clampToBoard(
        this.playerRow + this.playerDirection.dr * 2,
        this.playerCol + this.playerDirection.dc * 2
      );
    }

    if (ghost.personality === "patrol" && Math.floor(this.tickCount / SCATTER_TICKS) % 2 === 0) {
      return ghost.scatterTarget;
    }

    return [this.playerRow, this.playerCol];
  }

  clampToBoard(row, col) {
    const clampedRow = Math.min(Math.max(row, 1), ROWS - 2);
    const clampedCol = Math.min(Math.max(col, 1), COLS - 2);
    return [clampedRow, clampedCol];
  }

  handleCollisions(previousPlayerPosition, previousGhostPositions) {
    const playerPosition = { row: this.playerRow, col: this.playerCol };

    for (let index = 0; index < this.ghosts.length; index += 1) {
      const ghost = this.ghosts[index];
      const previousGhost = previousGhostPositions[index];
      const collided =
        (ghost.row === playerPosition.row && ghost.col === playerPosition.col) ||
        (previousGhost.row === playerPosition.row &&
          previousGhost.col === playerPosition.col &&
          ghost.row === previousPlayerPosition.row &&
          ghost.col === previousPlayerPosition.col);

      if (!collided) {
        continue;
      }

      if (this.powerTicks > 0) {
        this.score += 200;
        ghost.row = ghost.startRow;
        ghost.col = ghost.startCol;
        ghost.prevRow = ghost.startRow;
        ghost.prevCol = ghost.startCol;
        ghost.direction = LEFT;
        continue;
      }

      this.isRunning = false;
      this.didWin = false;
      break;
    }
  }

  canMove(row, col, direction) {
    const nextRow = row + direction.dr;
    const nextCol = col + direction.dc;

    return (
      nextRow >= 0 &&
      nextRow < ROWS &&
      nextCol >= 0 &&
      nextCol < COLS &&
      !this.walls.has(this.cellKey(nextRow, nextCol))
    );
  }

  cellKey(row, col) {
    return `${row},${col}`;
  }

  boardToCanvas(row, col) {
    const x1 = BOARD_PADDING + col * TILE_SIZE;
    const y1 = BOARD_PADDING + row * TILE_SIZE;
    return {
      x1,
      y1,
      x2: x1 + TILE_SIZE,
      y2: y1 + TILE_SIZE,
    };
  }

  interpolatePosition(previousRow, previousCol, row, col) {
    const progress = this.interpolation;
    return {
      row: previousRow + (row - previousRow) * progress,
      col: previousCol + (col - previousCol) * progress,
    };
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    for (const key of this.walls) {
      const [row, col] = key.split(",").map(Number);
      const { x1, y1, x2, y2 } = this.boardToCanvas(row, col);
      ctx.fillStyle = WALL_COLOR;
      ctx.strokeStyle = "#3d63ff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x1 + 1, y1 + 1, x2 - x1 - 2, y2 - y1 - 2, 6);
      ctx.fill();
      ctx.stroke();
    }

    for (const key of this.pellets) {
      const [row, col] = key.split(",").map(Number);
      const { x1, y1, x2, y2 } = this.boardToCanvas(row, col);
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      ctx.fillStyle = PELLET_COLOR;
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    const powerRadius = 6 + 2 * (0.5 + 0.5 * Math.sin(this.animationTime * 10));
    for (const key of this.powerPellets) {
      const [row, col] = key.split(",").map(Number);
      const { x1, y1, x2, y2 } = this.boardToCanvas(row, col);
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      ctx.fillStyle = POWER_COLOR;
      ctx.beginPath();
      ctx.arc(cx, cy, powerRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    this.drawPlayer();
    for (const ghost of this.ghosts) {
      this.drawGhost(ghost);
    }

    if (!this.isRunning) {
      this.drawOverlay();
    }
  }

  drawPlayer() {
    const ctx = this.ctx;
    const position = this.interpolatePosition(
      this.playerPrevRow,
      this.playerPrevCol,
      this.playerRow,
      this.playerCol
    );
    const { x1, y1, x2, y2 } = this.boardToCanvas(position.row, position.col);
    const mouth = 12 + 20 * (0.5 + 0.5 * Math.sin(this.animationTime * 16));
    const startByDirection = {
      right: mouth / 2,
      left: 180 + mouth / 2,
      up: 90 + mouth / 2,
      down: 270 + mouth / 2,
    };
    const radius = (x2 - x1) / 2 - 2;
    const centerX = (x1 + x2) / 2;
    const centerY = (y1 + y2) / 2;
    const start = this.toRadians(startByDirection[this.playerDirection.key]);
    const end = this.toRadians(startByDirection[this.playerDirection.key] + 360 - mouth);

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, start, end, false);
    ctx.closePath();
    ctx.fillStyle = PLAYER_COLOR;
    ctx.fill();
  }

  drawGhost(ghost) {
    const ctx = this.ctx;
    const position = this.interpolatePosition(ghost.prevRow, ghost.prevCol, ghost.row, ghost.col);
    const { x1, y1, x2, y2 } = this.boardToCanvas(position.row, position.col);
    let color = ghost.color;

    if (this.powerTicks > 0) {
      color =
        this.powerTicks > 8 || Math.floor(this.animationTime * 12) % 2 === 0
          ? FRIGHTENED_COLOR
          : "#ffffff";
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc((x1 + x2) / 2, y1 + TILE_SIZE / 2, TILE_SIZE / 2 - 3, Math.PI, 0, false);
    ctx.lineTo(x2 - 3, y2 - 4);

    const footWidth = TILE_SIZE / 4;
    for (let index = 3; index >= 0; index -= 1) {
      const footX1 = x1 + 3 + index * footWidth;
      const footX2 = footX1 + footWidth;
      ctx.lineTo(footX2, y2 - 4);
      ctx.lineTo((footX1 + footX2) / 2, y2 - 10);
      ctx.lineTo(footX1, y2 - 4);
    }

    ctx.closePath();
    ctx.fill();

    const eyeY1 = y1 + 9;
    const eyeY2 = eyeY1 + 8;
    const leftEyeX1 = x1 + 8;
    const rightEyeX1 = x1 + 15;

    for (const eyeX of [leftEyeX1, rightEyeX1]) {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(eyeX + 3, (eyeY1 + eyeY2) / 2, 3, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const pupilOffsetX = {
      left: -1,
      right: 1,
      up: 0,
      down: 0,
    }[ghost.direction.key];
    const pupilOffsetY = {
      left: 0,
      right: 0,
      up: -1,
      down: 1,
    }[ghost.direction.key];

    for (const pupilX of [leftEyeX1 + 3, rightEyeX1 + 3]) {
      ctx.fillStyle = "#112244";
      ctx.beginPath();
      ctx.arc(pupilX + pupilOffsetX, eyeY1 + 4 + pupilOffsetY, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawOverlay() {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0, 0, 0, 0.66)";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.fillStyle = TEXT_COLOR;
    ctx.textAlign = "center";
    ctx.font = "700 28px 'Space Grotesk', sans-serif";
    ctx.fillText(this.didWin ? "YOU WIN" : "GAME OVER", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 12);

    ctx.font = "500 13px 'IBM Plex Sans KR', sans-serif";
    ctx.fillText(
      "Restart 버튼 또는 Space로 다시 시작",
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2 + 20
    );
  }

  updateStatus() {
    const remaining = this.pellets.size + this.powerPellets.size;
    const stateLabel = this.isRunning ? "RUNNING" : this.didWin ? "CLEARED" : "FAILED";
    this.elements.status.textContent =
      `Score ${String(this.score).padStart(4, "0")} · Dots ${String(remaining).padStart(2, "0")} · ${stateLabel}`;
  }

  toRadians(degrees) {
    return (degrees * Math.PI) / 180;
  }
}
