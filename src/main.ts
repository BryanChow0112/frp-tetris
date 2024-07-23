/**
 * Inside this file you will use the classes and functions from rx.js
 * to add visuals to the svg element in index.html, animate them, and make them interactive.
 *
 * Study and complete the tasks in observable exercises first to get ideas.
 *
 * Course Notes showing Asteroids in FRP: https://tgdwyer.github.io/asteroids/
 *
 * You will be marked on your functional programming style
 * as well as the functionality that you implement.
 *
 * Document your code!
 */

import "./style.css";
import { Observable, Subscription, fromEvent, interval, merge } from "rxjs";
import { map, filter, scan } from "rxjs/operators";


/** Constants */

const Viewport = {
  CANVAS_WIDTH: 200,
  CANVAS_HEIGHT: 400,
  PREVIEW_WIDTH: 160,
  PREVIEW_HEIGHT: 80,
} as const;

const Constants = {
  TICK_RATE_MS: 500,
  GRID_WIDTH: 10,
  GRID_HEIGHT: 20,
} as const;

const Block = {
  WIDTH: Viewport.CANVAS_WIDTH / Constants.GRID_WIDTH,
  HEIGHT: Viewport.CANVAS_HEIGHT / Constants.GRID_HEIGHT,
};

/**
 * An array consisting of the 7 types of tetrominos, each with a type, positions, and color
 */
const tetrominos: Tetromino[] = [
  {
    type: "I",
    positions: [
      { x: 3, y: 0 },
      { x: 4, y: 0 },
      { x: 5, y: 0 },
      { x: 6, y: 0 },
    ],
    color: "aqua",
  },

  {
    type: "J",
    positions: [
      { x: 3, y: 0 },
      { x: 4, y: 1 },
      { x: 3, y: 1 },
      { x: 5, y: 1 },
    ],
    color: "blue",
  },

  {
    type: "L",
    positions: [
      { x: 3, y: 1 },
      { x: 4, y: 1 },
      { x: 5, y: 1 },
      { x: 5, y: 0 },
    ],
    color: "orangered",
  },

  {
    type: "O",
    positions: [
      { x: 3, y: 0 },
      { x: 3, y: 1 },
      { x: 4, y: 0 },
      { x: 4, y: 1 },
    ],
    color: "yellow",
  },

  {
    type: "S",
    positions: [
      { x: 3, y: 1 },
      { x: 4, y: 1 },
      { x: 4, y: 0 },
      { x: 5, y: 0 },
    ],
    color: "green",
  },

  {
    type: "T",
    positions: [
      { x: 3, y: 0 },
      { x: 4, y: 0 },
      { x: 5, y: 0 },
      { x: 4, y: -1 },
    ],
    color: "blueviolet",
  },
  
  {
    type: "Z",
    positions: [
      { x: 3, y: 0 },
      { x: 4, y: 1 },
      { x: 4, y: 0 },
      { x: 5, y: 1 },
    ],
    color: "red",
  }
];


/** Common Tetris type definitions */

/** User Input */

/**
 * a string literal type for each key used in game control
 */
type Key = "KeyS" | "KeyA" | "KeyD" | "KeyW" | "Enter";


/** Game Objects */

/**
 * Represents the possible types of tetrominos in the game
 */
type TetrominoType = "I" | "J" | "L" | "O" | "S" | "T" | "Z";

/**
 * Structure of a Tetromino
 */
type Tetromino = {
  type: TetrominoType,
  positions: Position[],
  color: string
};

/**
 * Represents a position (x, y) in the game grid
 */
type Position = Readonly<{
  x: number,
  y: number;
}>

/**
 * An array of Object Ids (used for identifying objects)
 */
type ObjectId = Readonly<{ id: string }>;

/**
 * Structure of a Block
 */
type Blocks = Tetromino & ObjectId;

/**
 * Represents individual squares in the game grid (can hold a 'Blocks' object or a 'null')
 */
type GridSquare = Blocks | null

/**
 * Represents the game grid, 2D array of GridSquares
 */
type Grid = ReadonlyArray<GridSquare[]>

/**
* Game state
*/
type State = Readonly<{
  currentBlock: Blocks;
  nextBlock: Blocks;
  grid: Grid
  score: number;
  highscore: number;
  gameEnd: boolean;
}>


/** Utility functions */

/**
* Checks for vertical collision of a block with the grid 
* @param blocks game Blocks
* @param grid game Grid
* @returns boolean value to indicate if there is a vertical collision
*/
const checkVerticalCollision = (blocks: Blocks, grid: Grid): boolean =>
  blocks.positions.some((position) => {
    const { x, y } = position;
    const reachedBottom = y >= Constants.GRID_HEIGHT - 1;
    const collidedWithBlock = grid[y + 1] && grid[y + 1][x];

    return reachedBottom || collidedWithBlock;
  });

/**
 * Checks for horizontal collision of a block with the grid
 * @param blocks game Blocks
 * @param dx horizontal movement of the block
 * @returns boolean value to indicate if there is a horizontal collision
 */
const checkHorizontalCollision = (blocks: Blocks, dx: number): boolean =>
    blocks.positions.some((position) => {
    const { x, y } = position;
    const newX = x + dx;

    // Checks if the new position exceeds the grid's horizontal bounds
    const reachedLeftEdge = newX < -1;
    const reachedRightEdge = newX >= Constants.GRID_WIDTH + 1;

    return reachedLeftEdge || reachedRightEdge ;
  });

/**
 * Checks for full rows in the grid
 * @param grid game Grid
 * @returns an array of row indices that are full
 */
const findFullRows = (grid: Grid): number[] => {
    // Convert each row into a boolean indicating if it's full
  const fullRowIndicators = grid.map((row) => row.every((block) => block !== null));

  // Find the indices of full rows
  const fullRowIndices = fullRowIndicators
    .map((isFull, index) => (isFull ? index : -1)) // Map to row indices or -1 for non-full rows
    .filter((index) => index !== -1); // Filter out the -1 values

  return fullRowIndices;
}

/**
 * Removes and drops full rows in the grid
 * @param grid game Grid
 * @param rowIndex row index of the full row
 * @returns the updated grid
 */
const removeAndDropRows = (grid: Grid, rowIndex: number): Grid => {
  // Create an empty row to add to the top of the grid
  const emptyRow = [null, null, null, null, null, null, null, null, null, null],
    
  removedRow = grid[rowIndex], // Save the row to be removed for later use in rendering
  
  // Remove the full row from the grid then add an empty row to the top
  removedRowGrid = grid.filter((row) => row !== grid[rowIndex]),
  updatedGrid = removedRowGrid.unshift(emptyRow)
  
  return removedRowGrid;
}

/**
 * The inspiration of this function was from Asteroids2023
 * Rotates a position by a given degree
 * @param deg degree to rotate
 * @param position positions to rotate
 * @returns updated positions after rotation
 */
const rotateVector = (deg: number, position: Position): Position => {
  const rad = (Math.PI * deg) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const { x, y } = position;

  // Apply 2D rotation matrix
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

/**
 * Rotates a block by 90 degrees
 * @param blocks game Blocks
 * @returns a new Blocks object with the rotated positions
 */
const rotateBlocks = (blocks: Blocks): Blocks => {
  // Get pivot point of block
  const pivot = blocks.positions[1];

  // Perform rotation for each block except pivot
  const rotatedPositions = blocks.positions.map((block) => {
    if (block === pivot) {
      return block; // Leave the pivot unchanged

    } else {
      // Calculate the new position after a 90-degree rotation.
      const rotatedBlock = rotateVector(90, {
        x: block.x - pivot.x,
        y: block.y - pivot.y,
      });

      // Translate the rotated block back to its original position
      return {
        x: rotatedBlock.x + pivot.x,
        y: rotatedBlock.y + pivot.y,
      };
    }
  });

  // Return a new Blocks object with the rotated positions.
  return { ...blocks, positions: rotatedPositions };
}

/**
 * Updates the high score if the current score is higher
 * @param score current score
 * @param highscore current high score
 * @returns updated high score
 */
const updateHighScore = (score: number, highscore: number): number => {
  if (score > highscore) {
    highscore = score;

    // Store the high score in local storage
    localStorage.setItem('highScore', highscore.toString());
  }

  return highscore;
}

/**
 * Checks if the game has ended
 * @param s current State
 * @returns boolean value to indicate if the game has ended
 */
const checkGameEnd = (s: State): boolean => {
  // Checks if the top row of the grid contains any blocks
  return s.grid[0].some((elem)=> elem !== null);
}


/** State processing */

/////////////// INITIAL STATE SET UP////////////////////

/**
 * Generates a random Blocks object 
 * @return a Blocks object with a random tetromino type, color, and positions
 */
const getRandomBlock = (): Blocks => {
  // Randomly select one tetromino from the tetrominos array
  const randomIndex = Math.floor(Math.random() * tetrominos.length);
  
  const objectId: ObjectId = { id: `${Math.random()}`};
  // Create a new block based on the randomly selected tetromino
  const tetromino = tetrominos[randomIndex];

  const block: Blocks = {

    type: tetromino.type,
    positions: tetromino.positions,
    color: tetromino.color,
    ...objectId,

  };
  return block;
}

/**
 * Gets the high score from local storage
 * @returns high score
 */
const getHighScore = (): number => {
  const savedHighScore = localStorage.getItem('highScore');
  return savedHighScore !== null ? parseInt(savedHighScore, 10) : 0; // If null, initialise to 0
}

/** 
* Intial State 
*/
const initialState: State = {
  currentBlock: getRandomBlock(),
  nextBlock: getRandomBlock(),
  grid: Array(Constants.GRID_HEIGHT).fill(Array(Constants.GRID_WIDTH).fill(null)),
  score: 0,
  highscore: getHighScore(),
  gameEnd: false,

} as const;


//////////////// STATE UPDATES //////////////////////

// Action types that trigger game state transitions
class Move implements Action {
  constructor(public readonly dx: number, public readonly dy: number) {}

  /**
  * Handles horizontal and vertical movement of the current block.
  * @param s Current state
  * @returns Updated state
  */
  apply = (s: State): State => {
    
    const newPositions = s.currentBlock.positions.map((p) => ({
      x: p.x + this.dx,
      y: p.y + this.dy,
    }));

    const hasHorizontalCollision = checkHorizontalCollision(
      { ...s.currentBlock, positions: newPositions },
      this.dx < 0 ? -1 : 1
    );

    const hasVerticalCollision = checkVerticalCollision(
      { ...s.currentBlock, positions: newPositions },
      s.grid
    );

    // Keep the same positions if there's a horizontal or vertical collision
    const finalPositions = hasHorizontalCollision
      ? s.currentBlock.positions 
      : hasVerticalCollision
      ? s.currentBlock.positions 
      : newPositions; // Use the new positions if no collisions detected

    // Return the updated state with the final positions
    return {
      ...s,
      currentBlock: { ...s.currentBlock, positions: finalPositions },
    };
  }
}

class Rotate implements Action {
  constructor(public readonly direction: number = 1) {}

  /**
  * Handles rotation of the current block.
  * @param s Current state
  * @returns Updated state
  */
  apply = (s: State): State => {
    
    const rotatedBlock = rotateBlocks(s.currentBlock);

    const hasHorizontalCollision = checkHorizontalCollision(
      { ...rotatedBlock, positions: rotatedBlock.positions },
      this.direction < 0 ? -1 : 1
    );

    const hasVerticalCollision = checkVerticalCollision(
      { ...rotatedBlock, positions: rotatedBlock.positions },
      s.grid
    );

    // Keep the same positions if there's a horizontal or vertical collision
    const finalPositions = hasHorizontalCollision
      ? s.currentBlock.positions 
      : hasVerticalCollision
      ? s.currentBlock.positions 
      : rotatedBlock.positions; // Use the rotated positions if no collisions detected

    // Return the updated state with the final positions
    return {
      ...s,
      currentBlock: { ...s.currentBlock, positions: finalPositions },
    };
  }
}

class Restart implements Action {

  /**
  * Handles game restart.
  * @returns Initial state
  */
  apply = (): State => initialState;
}

class Tick implements Action {
  constructor(public readonly elapsed: number) {}

  /**
  * Updates the state by proceeding with one time step.
  * interval tick: handle full rows, check game end, handle collisions, move blocks down
  * @param s Current state
  * @returns Updated state
  */
  apply = (s: State): State => {
    
    const fullRowIndices = findFullRows(s.grid);
    
    if (fullRowIndices.length > 0) {
      // Handle full rows (fullRowIndices contains the row indices)
      const removedRowGrid = removeAndDropRows(s.grid, fullRowIndices[0]);
  
      // Update scores
      const newScore = s.score + 100;
      const highscore = updateHighScore(newScore, s.highscore);

      // Return the updated state with the removed row and updated grid (will be handled in the next tick)
      return {
        ...s,
        score: newScore,
        highscore: highscore,
        grid: removedRowGrid,
      }
    } 

    // Check for game end
    const gameEnd = checkGameEnd(s);
    if (gameEnd) {
      return {
        ...s,
        gameEnd: true,
      };
    }

    // Check for vertical collisions
    const hasVerticalCollision = checkVerticalCollision(s.currentBlock, s.grid);
    
    // Create a new grid with the current block's positions (deep copy of the existing grid)
    const newGrid = s.grid.map((row) => [...row]); 
    
    // Update the current block's position if there are no collisions
    const updatedPositions = !hasVerticalCollision
      ? s.currentBlock.positions.map((p) => ({ x: p.x, y: p.y + 1 })) // Vertical movement
      : s.currentBlock.positions; // No movement if there's a collision
    
    // stop 
    if (hasVerticalCollision) {
      
      // Add the current block's positions to the new grid
      s.currentBlock.positions.forEach((position) => {
        
        // Ensure the block is within the grid's vertical and horizontal bounds 
        // Check if the grid cell is empty
        if (position.y >= 0 && position.y < Constants.GRID_HEIGHT && position.x >= 0 
          && position.x < Constants.GRID_WIDTH && newGrid[position.y ][position.x] === null) {
            // Set the grid cell to the current block
            newGrid[position.y ][position.x] = s.currentBlock;

        }
      });
    
      // Update info for next round
      return {
        ...s,
        currentBlock: s.nextBlock,
        nextBlock: getRandomBlock(),
        grid: newGrid, // Update the grid
      };
    };
    
    // Update positions if there are no collisions
    return {
      ...s,
      currentBlock: { ...s.currentBlock, positions: updatedPositions },
    };
  }
}

/**
 * This function was from Asteroids2023
* state transducer
* @param s input State
* @param action type of action to apply to the State
* @returns a new State 
*/
// Action Types: Tick | Move | Rotate | Restart;
const reduceState = (s: State, action: Action) => action.apply(s);

/**
 * This interface was from Asteroids2023
 * Actions modify state
 */
interface Action {
  apply(s: State): State;
}


/////////////// WARNING: IMPURE CODE ZONE! ////////////////////

/** Enter at your own risk! Expect side effects! */

/** Rendering (side effects) */

/**
 * Displays a SVG element on the canvas. Brings to foreground.
 * @param elem SVG element to display
 */
const show = (elem: SVGGraphicsElement) => {
  elem.setAttribute("visibility", "visible");
  elem.parentNode!.appendChild(elem);
};

/**
 * Hides a SVG element on the canvas.
 * @param elem SVG element to hide
 */
const hide = (elem: SVGGraphicsElement) =>
  elem.setAttribute("visibility", "hidden");

/**
 * Creates an SVG element with the given properties.
 *
 * See https://developer.mozilla.org/en-US/docs/Web/SVG/Element for valid
 * element names and properties.
 *
 * @param namespace Namespace of the SVG element
 * @param name SVGElement name
 * @param props Properties to set on the SVG element
 * @returns SVG element
 */
const createSvgElement = (
  namespace: string | null,
  name: string,
  props: Record<string, string> = {}
) => {
  const elem = document.createElementNS(namespace, name) as SVGElement;
  Object.entries(props).forEach(([k, v]) => elem.setAttribute(k, v));
  return elem;
};

/**
* Renders the current state to the canvas.
* In MVC terms, this updates the View using the Model.
* @param s Current state
*/
const render = (s: State) => {
  
  // Canvas elements
  const svg = document.querySelector("#svgCanvas") as SVGGraphicsElement &
    HTMLElement;
  const preview = document.querySelector("#svgPreview") as SVGGraphicsElement &
    HTMLElement;
  const gameover = document.querySelector("#gameOver") as SVGGraphicsElement &
    HTMLElement;
  const container = document.querySelector("#main") as HTMLElement;

  svg.setAttribute("height", `${Viewport.CANVAS_HEIGHT}`);
  svg.setAttribute("width", `${Viewport.CANVAS_WIDTH}`);
  preview.setAttribute("height", `${Viewport.PREVIEW_HEIGHT}`);
  preview.setAttribute("width", `${Viewport.PREVIEW_WIDTH}`);

  // Text fields
  const levelText = document.querySelector("#levelText") as HTMLElement;
  const scoreText = document.querySelector("#scoreText") as HTMLElement;
  const highScoreText = document.querySelector("#highScoreText") as HTMLElement;


  // Remove all nodes except the game over text
  const nodesToRemove: ChildNode[] = [];
  const childNodes = Array.from(svg.childNodes);
  
  childNodes.forEach((node) => {
    if (node !== gameover) {
      nodesToRemove.push(node);
    }
  });
  // Remove all nodes except the game over text
  nodesToRemove.forEach((node) => svg.removeChild(node));
  

  // Clear the canvas
  preview.innerHTML = "";
  levelText.innerHTML = `${"Easy"}`;
  scoreText.innerHTML = `${s.score}`;
  highScoreText.innerHTML = `${s.highscore}`;


  // Add the current block to the main canvas
  const currentBlock = s.currentBlock;
  currentBlock.positions.map((block, index) => {
    
    const cube = createSvgElement(svg.namespaceURI, "rect", {
      height: `${Block.HEIGHT}`,
      width: `${Block.WIDTH}`,
      x: `${Block.WIDTH * block.x}`,
      y: `${Block.HEIGHT * block.y}`,
      style: `fill: ${currentBlock.color}`,
      id: `${currentBlock.id}`,
    });
    svg.appendChild(cube);
  });
  

  // Add the grid to the main canvas
  s.grid.map((row) => {
    row.map((block) => {
      if (block != null) {

        // Iterate through each position in the block and add it to the canvas
        block.positions.map((position) => {
          const gcube = createSvgElement(svg.namespaceURI, "rect", {
            height: `${Block.HEIGHT}`,
            width: `${Block.WIDTH}`,
            x: `${Block.WIDTH * position.x}`,
            y: `${Block.HEIGHT * position.y}`,
            style: `fill: ${block.color}`,
            id: `${block.id}`,
          });
          svg.appendChild(gcube);
        });
      }
    });
  });
  

  //Add the next block to the preview canvas
  const pcurrentBlock = s.nextBlock;
  pcurrentBlock.positions.map((block) => {
    
    const pcube = createSvgElement(svg.namespaceURI, "rect", {
      height: `${Block.HEIGHT}`,
      width: `${Block.WIDTH}`,
      x: `${Block.WIDTH * block.x - 10}`,
      y: `${Block.HEIGHT * block.y + 20}`,
      style: `fill: ${pcurrentBlock.color}`,
    });
    preview.appendChild(pcube);
  });


  // Game over
  if (s.gameEnd) {
    highScoreText.innerHTML = `${s.score}`;
    show(gameover);
  } else {
    hide(gameover);
  }
};


/**
 * This is the function called on page load. Your main game loop
 * should be called here.
 */
export function main() {
  
  /** Observables */

  /** Determines the rate of time steps */
  const 
    tick$ = interval(Constants.TICK_RATE_MS)
      .pipe(map(elapsed => new Tick(elapsed))),

   /** User input */
   key$ = fromEvent<KeyboardEvent>(document, "keypress"),

   fromKey = (keyCode: Key) =>
     key$.pipe(filter(({ code }) => code === keyCode)),
     
     // Initialises all Observable streams
     left$ = fromKey("KeyA").pipe(map(_ => new Move(-1, 0))),
     right$ = fromKey("KeyD").pipe(map(_ => new Move(1, 0))),
     down$ = fromKey("KeyS").pipe(map(_ => new Move(0, 1))),
     rotate$ = fromKey("KeyW").pipe(map(_ => new Rotate())),
     restart$ = fromKey("Enter").pipe(map(_ => new Restart()));
     

     /** Main Game  */
     const action$: Observable<Action> = merge(tick$, left$, right$, down$, rotate$, restart$);
     const state$: Observable<State> = action$.pipe(scan(reduceState, initialState));
     const subscription: Subscription = state$.subscribe((s: State) => { render(s) });

  }

// The following simply runs your main function on window load.  Make sure to leave it in place.
if (typeof window !== "undefined") {
  window.onload = () => {
   main();
  };
}
