from __future__ import annotations

import math
import random
import time
import tkinter as tk
from dataclasses import dataclass


TILE_SIZE = 28
MOVE_DELAY_MS = 188
FRAME_DELAY_MS = 16
POWER_TICKS = 36
SCATTER_TICKS = 10
BOARD_PADDING = 12

UP = (-1, 0)
DOWN = (1, 0)
LEFT = (0, -1)
RIGHT = (0, 1)
DIRECTIONS = (UP, DOWN, LEFT, RIGHT)
OPPOSITE = {UP: DOWN, DOWN: UP, LEFT: RIGHT, RIGHT: LEFT}

LEVEL_MAP = [
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
]

ROWS = len(LEVEL_MAP)
COLS = len(LEVEL_MAP[0])

BG_COLOR = "#050505"
WALL_COLOR = "#1238ff"
PELLET_COLOR = "#f6f1d3"
POWER_COLOR = "#fff4b0"
PLAYER_COLOR = "#ffd84d"
FRIGHTENED_COLOR = "#2f64ff"
TEXT_COLOR = "#f4f4f4"

KEY_TO_DIRECTION = {
    "Up": UP,
    "Down": DOWN,
    "Left": LEFT,
    "Right": RIGHT,
    "w": UP,
    "W": UP,
    "s": DOWN,
    "S": DOWN,
    "a": LEFT,
    "A": LEFT,
    "d": RIGHT,
    "D": RIGHT,
}


@dataclass
class Ghost:
    row: int
    col: int
    start_row: int
    start_col: int
    color: str
    personality: str
    scatter_target: tuple[int, int]
    direction: tuple[int, int] = LEFT
    prev_row: int = 0
    prev_col: int = 0


class PacmanGame:
    def __init__(self) -> None:
        self.root = tk.Tk()
        self.root.title("Pac-Man")
        self.root.configure(bg=BG_COLOR)
        self.root.resizable(False, False)

        canvas_width = COLS * TILE_SIZE + BOARD_PADDING * 2
        canvas_height = ROWS * TILE_SIZE + BOARD_PADDING * 2

        self.canvas = tk.Canvas(
            self.root,
            width=canvas_width,
            height=canvas_height,
            bg=BG_COLOR,
            highlightthickness=0,
        )
        self.canvas.pack(padx=10, pady=(10, 6))

        self.status_var = tk.StringVar()
        self.status_label = tk.Label(
            self.root,
            textvariable=self.status_var,
            bg=BG_COLOR,
            fg=TEXT_COLOR,
            font=("Consolas", 11),
        )
        self.status_label.pack(pady=(0, 10))

        self.root.bind("<KeyPress>", self.on_key_press)
        self.root.bind("<Escape>", lambda _event: self.root.destroy())

        self.last_frame_time = time.perf_counter()
        self.move_accumulator = 0.0
        self.animation_time = 0.0
        self.interpolation = 1.0
        self.reset_game()
        self.root.after(FRAME_DELAY_MS, self.game_loop)

    def reset_game(self) -> None:
        self.walls: set[tuple[int, int]] = set()
        self.pellets: set[tuple[int, int]] = set()
        self.power_pellets: set[tuple[int, int]] = set()

        ghost_spawns: list[tuple[int, int]] = []
        self.player_start = (1, 1)

        for row_index, row_text in enumerate(LEVEL_MAP):
            for col_index, tile in enumerate(row_text):
                position = (row_index, col_index)
                if tile == "#":
                    self.walls.add(position)
                elif tile == ".":
                    self.pellets.add(position)
                elif tile == "o":
                    self.power_pellets.add(position)
                elif tile == "P":
                    self.player_start = position
                elif tile == "G":
                    ghost_spawns.append(position)

        ghost_specs = [
            ("#ff5f5f", "chase", (1, COLS - 2)),
            ("#ff9de1", "ambush", (1, 1)),
            ("#67e8f9", "patrol", (ROWS - 2, COLS - 2)),
            ("#ffb347", "patrol", (ROWS - 2, 1)),
        ]

        self.ghosts: list[Ghost] = []
        for index, spawn in enumerate(ghost_spawns):
            color, personality, scatter_target = ghost_specs[index % len(ghost_specs)]
            self.ghosts.append(
                Ghost(
                    row=spawn[0],
                    col=spawn[1],
                    start_row=spawn[0],
                    start_col=spawn[1],
                    color=color,
                    personality=personality,
                    scatter_target=scatter_target,
                    prev_row=spawn[0],
                    prev_col=spawn[1],
                )
            )

        self.player_row, self.player_col = self.player_start
        self.player_prev_row, self.player_prev_col = self.player_start
        self.player_direction = LEFT
        self.pending_direction = LEFT
        self.score = 0
        self.tick_count = 0
        self.power_ticks = 0
        self.is_running = True
        self.did_win = False
        self.move_accumulator = 0.0
        self.interpolation = 1.0
        self.animation_time = 0.0
        self.last_frame_time = time.perf_counter()
        self.update_status()
        self.draw()

    def on_key_press(self, event: tk.Event) -> None:
        direction = KEY_TO_DIRECTION.get(event.keysym)
        if direction is not None:
            self.pending_direction = direction
            return

        if event.keysym == "space" and not self.is_running:
            self.reset_game()

    def game_loop(self) -> None:
        current_time = time.perf_counter()
        elapsed = min(current_time - self.last_frame_time, (MOVE_DELAY_MS / 1000) * 2)
        self.last_frame_time = current_time
        self.animation_time += elapsed

        if self.is_running:
            self.move_accumulator += elapsed
            move_interval = MOVE_DELAY_MS / 1000

            while self.move_accumulator >= move_interval and self.is_running:
                self.move_accumulator -= move_interval
                self.advance_game_state()

            self.interpolation = self.move_accumulator / move_interval if self.is_running else 1.0
        else:
            self.interpolation = 1.0

        self.draw()
        self.root.after(FRAME_DELAY_MS, self.game_loop)

    def advance_game_state(self) -> None:
        self.player_prev_row = self.player_row
        self.player_prev_col = self.player_col
        for ghost in self.ghosts:
            ghost.prev_row = ghost.row
            ghost.prev_col = ghost.col

        self.tick_count += 1
        previous_player_position = (self.player_row, self.player_col)
        previous_ghost_positions = [(ghost.row, ghost.col) for ghost in self.ghosts]

        self.move_player()
        for ghost in self.ghosts:
            self.move_ghost(ghost)

        self.handle_collisions(previous_player_position, previous_ghost_positions)

        if self.power_ticks > 0:
            self.power_ticks -= 1

        if not self.pellets and not self.power_pellets and self.is_running:
            self.did_win = True
            self.is_running = False

        self.update_status()

    def move_player(self) -> None:
        if self.can_move(self.player_row, self.player_col, self.pending_direction):
            self.player_direction = self.pending_direction

        if self.can_move(self.player_row, self.player_col, self.player_direction):
            self.player_row += self.player_direction[0]
            self.player_col += self.player_direction[1]

        player_position = (self.player_row, self.player_col)
        if player_position in self.pellets:
            self.pellets.remove(player_position)
            self.score += 10
        elif player_position in self.power_pellets:
            self.power_pellets.remove(player_position)
            self.score += 50
            self.power_ticks = POWER_TICKS

    def move_ghost(self, ghost: Ghost) -> None:
        options = [
            direction
            for direction in DIRECTIONS
            if self.can_move(ghost.row, ghost.col, direction)
        ]

        if len(options) > 1 and OPPOSITE[ghost.direction] in options:
            options.remove(OPPOSITE[ghost.direction])

        if not options:
            options = [OPPOSITE[ghost.direction]]

        if self.power_ticks > 0:
            ranked_options = self.rank_frightened_moves(ghost, options)
        else:
            ranked_options = self.rank_hunting_moves(ghost, options)

        best_score = ranked_options[0][0]
        best_directions = [direction for score, direction in ranked_options if score == best_score]
        ghost.direction = random.choice(best_directions)
        ghost.row += ghost.direction[0]
        ghost.col += ghost.direction[1]

    def rank_frightened_moves(
        self, ghost: Ghost, options: list[tuple[int, int]]
    ) -> list[tuple[int, tuple[int, int]]]:
        ranked: list[tuple[int, tuple[int, int]]] = []
        for direction in options:
            next_row = ghost.row + direction[0]
            next_col = ghost.col + direction[1]
            distance = abs(next_row - self.player_row) + abs(next_col - self.player_col)
            ranked.append((-distance, direction))
        ranked.sort(key=lambda item: item[0])
        return ranked

    def rank_hunting_moves(
        self, ghost: Ghost, options: list[tuple[int, int]]
    ) -> list[tuple[int, tuple[int, int]]]:
        target_row, target_col = self.get_ghost_target(ghost)
        ranked: list[tuple[int, tuple[int, int]]] = []
        for direction in options:
            next_row = ghost.row + direction[0]
            next_col = ghost.col + direction[1]
            distance = abs(next_row - target_row) + abs(next_col - target_col)
            ranked.append((distance, direction))
        ranked.sort(key=lambda item: item[0])
        return ranked

    def get_ghost_target(self, ghost: Ghost) -> tuple[int, int]:
        if ghost.personality == "ambush":
            target_row = self.player_row + self.player_direction[0] * 2
            target_col = self.player_col + self.player_direction[1] * 2
            return self.clamp_to_board(target_row, target_col)

        if ghost.personality == "patrol":
            if (self.tick_count // SCATTER_TICKS) % 2 == 0:
                return ghost.scatter_target

        return self.player_row, self.player_col

    def clamp_to_board(self, row: int, col: int) -> tuple[int, int]:
        row = min(max(row, 1), ROWS - 2)
        col = min(max(col, 1), COLS - 2)
        return row, col

    def handle_collisions(
        self,
        previous_player_position: tuple[int, int],
        previous_ghost_positions: list[tuple[int, int]],
    ) -> None:
        player_position = (self.player_row, self.player_col)

        for ghost, previous_ghost_position in zip(self.ghosts, previous_ghost_positions):
            ghost_position = (ghost.row, ghost.col)
            collided = ghost_position == player_position or (
                previous_ghost_position == player_position
                and ghost_position == previous_player_position
            )

            if not collided:
                continue

            if self.power_ticks > 0:
                self.score += 200
                ghost.row, ghost.col = ghost.start_row, ghost.start_col
                ghost.prev_row, ghost.prev_col = ghost.start_row, ghost.start_col
                ghost.direction = LEFT
                continue

            self.is_running = False
            self.did_win = False
            break

    def can_move(self, row: int, col: int, direction: tuple[int, int]) -> bool:
        next_row = row + direction[0]
        next_col = col + direction[1]
        return 0 <= next_row < ROWS and 0 <= next_col < COLS and (next_row, next_col) not in self.walls

    def board_to_canvas(self, row: float, col: float) -> tuple[float, float, float, float]:
        x1 = BOARD_PADDING + col * TILE_SIZE
        y1 = BOARD_PADDING + row * TILE_SIZE
        x2 = x1 + TILE_SIZE
        y2 = y1 + TILE_SIZE
        return x1, y1, x2, y2

    def interpolate_position(
        self, previous_row: int, previous_col: int, row: int, col: int
    ) -> tuple[float, float]:
        progress = self.interpolation
        interpolated_row = previous_row + (row - previous_row) * progress
        interpolated_col = previous_col + (col - previous_col) * progress
        return interpolated_row, interpolated_col

    def draw(self) -> None:
        self.canvas.delete("all")

        for row, col in self.walls:
            x1, y1, x2, y2 = self.board_to_canvas(row, col)
            self.canvas.create_rectangle(
                x1 + 1,
                y1 + 1,
                x2 - 1,
                y2 - 1,
                fill=WALL_COLOR,
                outline="#3d63ff",
                width=2,
            )

        for row, col in self.pellets:
            x1, y1, x2, y2 = self.board_to_canvas(row, col)
            cx = (x1 + x2) / 2
            cy = (y1 + y2) / 2
            radius = 3
            self.canvas.create_oval(
                cx - radius,
                cy - radius,
                cx + radius,
                cy + radius,
                fill=PELLET_COLOR,
                outline="",
            )

        power_radius = 6 + 2 * (0.5 + 0.5 * math.sin(self.animation_time * 10))
        for row, col in self.power_pellets:
            x1, y1, x2, y2 = self.board_to_canvas(row, col)
            cx = (x1 + x2) / 2
            cy = (y1 + y2) / 2
            self.canvas.create_oval(
                cx - power_radius,
                cy - power_radius,
                cx + power_radius,
                cy + power_radius,
                fill=POWER_COLOR,
                outline="",
            )

        self.draw_player()
        for ghost in self.ghosts:
            self.draw_ghost(ghost)

        if not self.is_running:
            self.draw_overlay()

    def draw_player(self) -> None:
        row, col = self.interpolate_position(
            self.player_prev_row, self.player_prev_col, self.player_row, self.player_col
        )
        x1, y1, x2, y2 = self.board_to_canvas(row, col)
        mouth = 12 + 20 * (0.5 + 0.5 * math.sin(self.animation_time * 16))
        start_by_direction = {
            RIGHT: mouth / 2,
            LEFT: 180 + mouth / 2,
            UP: 90 + mouth / 2,
            DOWN: 270 + mouth / 2,
        }
        start = start_by_direction[self.player_direction]
        self.canvas.create_arc(
            x1 + 2,
            y1 + 2,
            x2 - 2,
            y2 - 2,
            start=start,
            extent=360 - mouth,
            fill=PLAYER_COLOR,
            outline=PLAYER_COLOR,
            style=tk.PIESLICE,
        )

    def draw_ghost(self, ghost: Ghost) -> None:
        row, col = self.interpolate_position(ghost.prev_row, ghost.prev_col, ghost.row, ghost.col)
        x1, y1, x2, y2 = self.board_to_canvas(row, col)
        color = ghost.color
        if self.power_ticks > 0:
            if self.power_ticks > 8 or int(self.animation_time * 12) % 2 == 0:
                color = FRIGHTENED_COLOR
            else:
                color = "#ffffff"

        self.canvas.create_oval(
            x1 + 3,
            y1 + 3,
            x2 - 3,
            y1 + TILE_SIZE - 8,
            fill=color,
            outline=color,
        )
        self.canvas.create_rectangle(
            x1 + 3,
            y1 + TILE_SIZE / 2,
            x2 - 3,
            y2 - 4,
            fill=color,
            outline=color,
        )

        foot_width = TILE_SIZE / 4
        for index in range(4):
            foot_x1 = x1 + 3 + index * foot_width
            foot_x2 = foot_x1 + foot_width
            foot_y = y2 - 4
            self.canvas.create_polygon(
                foot_x1,
                foot_y,
                (foot_x1 + foot_x2) / 2,
                foot_y - 6,
                foot_x2,
                foot_y,
                fill=BG_COLOR,
                outline=BG_COLOR,
            )

        eye_y1 = y1 + 9
        eye_y2 = eye_y1 + 8
        left_eye_x1 = x1 + 8
        right_eye_x1 = x1 + 15
        for eye_x in (left_eye_x1, right_eye_x1):
            self.canvas.create_oval(
                eye_x,
                eye_y1,
                eye_x + 6,
                eye_y2,
                fill="white",
                outline="white",
            )

        pupil_offset_x = {
            LEFT: -1,
            RIGHT: 1,
            UP: 0,
            DOWN: 0,
        }[ghost.direction]
        pupil_offset_y = {
            LEFT: 0,
            RIGHT: 0,
            UP: -1,
            DOWN: 1,
        }[ghost.direction]
        for pupil_x in (left_eye_x1 + 2, right_eye_x1 + 2):
            self.canvas.create_oval(
                pupil_x + pupil_offset_x,
                eye_y1 + 2 + pupil_offset_y,
                pupil_x + 2 + pupil_offset_x,
                eye_y1 + 4 + pupil_offset_y,
                fill="#112244",
                outline="#112244",
            )

    def draw_overlay(self) -> None:
        width = COLS * TILE_SIZE + BOARD_PADDING * 2
        height = ROWS * TILE_SIZE + BOARD_PADDING * 2
        self.canvas.create_rectangle(0, 0, width, height, fill="#000000", stipple="gray50", outline="")

        headline = "YOU WIN" if self.did_win else "GAME OVER"
        detail = "Space: restart   Esc: quit"

        self.canvas.create_text(
            width / 2,
            height / 2 - 14,
            text=headline,
            fill=TEXT_COLOR,
            font=("Consolas", 24, "bold"),
        )
        self.canvas.create_text(
            width / 2,
            height / 2 + 16,
            text=detail,
            fill=TEXT_COLOR,
            font=("Consolas", 12),
        )

    def update_status(self) -> None:
        remaining = len(self.pellets) + len(self.power_pellets)
        state = "RUNNING" if self.is_running else ("CLEARED" if self.did_win else "FAILED")
        self.status_var.set(
            f"Score: {self.score:04d}   Dots: {remaining:02d}   State: {state}   Move: arrows/WASD"
        )
        self.root.title(f"Pac-Man | Score {self.score}")

    def run(self) -> None:
        self.root.mainloop()


if __name__ == "__main__":
    PacmanGame().run()
