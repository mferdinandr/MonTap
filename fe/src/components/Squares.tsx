import { useRef, useEffect } from 'react';

interface SquaresProps {
  direction?: 'right' | 'left' | 'up' | 'down' | 'diagonal';
  speed?: number;
  borderColor?: string;
  squareSize?: number;
  hoverFillColor?: string;
  clickFillColor?: string;
  clickImage?: string;
}

interface ClickedSquare {
  screenX: number;
  screenY: number;
  movementX: number;
  movementY: number;
  anim: number;       // 0 to 1 for animation progress
  removing: boolean;   // true when fading out
}

const Squares = ({
  direction = 'right',
  speed = 1,
  borderColor = '#999',
  squareSize = 40,
  hoverFillColor = '#222',
  clickFillColor = '#0a1a3a',
  clickImage
}: SquaresProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  const numSquaresX = useRef(0);
  const numSquaresY = useRef(0);
  const gridOffset = useRef({ x: 0, y: 0 });
  const hoveredSquareRef = useRef<{ x: number; y: number } | null>(null);
  const clickedSquaresRef = useRef<ClickedSquare[]>([]);
  const totalMovementRef = useRef({ x: 0, y: 0 });
  const logoImageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      numSquaresX.current = Math.ceil(canvas.width / squareSize) + 1;
      numSquaresY.current = Math.ceil(canvas.height / squareSize) + 1;
    };

    // Load logo image
    if (clickImage) {
      const img = new Image();
      img.src = clickImage;
      img.onload = () => {
        logoImageRef.current = img;
      };
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Easing function for smooth animation
    const easeOutBack = (t: number) => {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    };

    const drawGrid = () => {
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const startX = Math.floor(gridOffset.current.x / squareSize) * squareSize;
      const startY = Math.floor(gridOffset.current.y / squareSize) * squareSize;

      // Draw hovered square fill
      for (let x = startX; x < canvas.width + squareSize; x += squareSize) {
        for (let y = startY; y < canvas.height + squareSize; y += squareSize) {
          const squareX = x - (gridOffset.current.x % squareSize);
          const squareY = y - (gridOffset.current.y % squareSize);

          const gridX = Math.floor((x - startX) / squareSize);
          const gridY = Math.floor((y - startY) / squareSize);

          if (
            hoveredSquareRef.current &&
            gridX === hoveredSquareRef.current.x &&
            gridY === hoveredSquareRef.current.y
          ) {
            ctx.fillStyle = hoverFillColor;
            ctx.globalAlpha = 0.4;
            ctx.fillRect(squareX, squareY, squareSize, squareSize);
            ctx.globalAlpha = 1;
          }
        }
      }

      // Draw grid lines separately for consistent dashes
      ctx.strokeStyle = borderColor;
      ctx.setLineDash([4, 10]);

      // Vertical lines
      for (let x = startX; x < canvas.width + squareSize; x += squareSize) {
        const lineX = x - (gridOffset.current.x % squareSize);
        ctx.beginPath();
        ctx.moveTo(lineX, 0);
        ctx.lineTo(lineX, canvas.height);
        ctx.stroke();
      }

      // Horizontal lines
      for (let y = startY; y < canvas.height + squareSize; y += squareSize) {
        const lineY = y - (gridOffset.current.y % squareSize);
        ctx.beginPath();
        ctx.moveTo(0, lineY);
        ctx.lineTo(canvas.width, lineY);
        ctx.stroke();
      }

      ctx.setLineDash([]);

      // Update and draw clicked squares
      const animSpeed = 0.06;
      clickedSquaresRef.current = clickedSquaresRef.current.filter(clicked => {
        // Update animation progress
        if (clicked.removing) {
          clicked.anim -= animSpeed;
          if (clicked.anim <= 0) return false;
        } else {
          if (clicked.anim < 1) clicked.anim = Math.min(clicked.anim + animSpeed, 1);
        }

        const dx = totalMovementRef.current.x - clicked.movementX;
        const dy = totalMovementRef.current.y - clicked.movementY;
        const rawX = clicked.screenX + dx;
        const rawY = clicked.screenY + dy;

        // Snap to grid to prevent floating point drift
        const offX = gridOffset.current.x % squareSize;
        const offY = gridOffset.current.y % squareSize;
        const currentX = Math.round((rawX + offX) / squareSize) * squareSize - offX;
        const currentY = Math.round((rawY + offY) / squareSize) * squareSize - offY;

        // Remove if off screen
        if (
          currentX + squareSize < 0 || currentX > canvas.width ||
          currentY + squareSize < 0 || currentY > canvas.height
        ) {
          return false;
        }

        const alpha = clicked.anim;
        const logoScale = Math.min(easeOutBack(clicked.anim), 1);

        // Fill background - snapped to grid
        ctx.fillStyle = clickFillColor;
        ctx.globalAlpha = 0.6 * alpha;
        ctx.fillRect(currentX, currentY, squareSize, squareSize);
        ctx.globalAlpha = 1;

        // Draw dashed border - snapped to grid
        ctx.strokeStyle = '#06b6d4';
        ctx.globalAlpha = alpha;
        ctx.setLineDash([4, 10]);
        ctx.lineWidth = 2.5;
        ctx.strokeRect(currentX, currentY, squareSize, squareSize);
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
        ctx.globalAlpha = 1;

        // Draw logo image with scale animation
        if (logoImageRef.current) {
          const imgScaledSize = squareSize * logoScale;
          const centerX = currentX + squareSize / 2;
          const centerY = currentY + squareSize / 2;
          const padding = 4 * logoScale;
          const imgSize = imgScaledSize - padding * 2;
          ctx.globalAlpha = 0.8 * alpha;
          ctx.drawImage(
            logoImageRef.current,
            centerX - imgSize / 2,
            centerY - imgSize / 2,
            imgSize,
            imgSize
          );
          ctx.globalAlpha = 1;
        }

        return true;
      });

    };

    const updateAnimation = () => {
      const effectiveSpeed = Math.max(speed, 0.1);

      // Track cumulative screen movement
      switch (direction) {
        case 'right':
          totalMovementRef.current.x += effectiveSpeed;
          break;
        case 'left':
          totalMovementRef.current.x -= effectiveSpeed;
          break;
        case 'up':
          totalMovementRef.current.y -= effectiveSpeed;
          break;
        case 'down':
          totalMovementRef.current.y += effectiveSpeed;
          break;
        case 'diagonal':
          totalMovementRef.current.x += effectiveSpeed;
          totalMovementRef.current.y += effectiveSpeed;
          break;
        default:
          break;
      }

      // Update grid offset (with modulo wrapping for seamless tiling)
      switch (direction) {
        case 'right':
          gridOffset.current.x = (gridOffset.current.x - effectiveSpeed + squareSize) % squareSize;
          break;
        case 'left':
          gridOffset.current.x = (gridOffset.current.x + effectiveSpeed + squareSize) % squareSize;
          break;
        case 'up':
          gridOffset.current.y = (gridOffset.current.y + effectiveSpeed + squareSize) % squareSize;
          break;
        case 'down':
          gridOffset.current.y = (gridOffset.current.y - effectiveSpeed + squareSize) % squareSize;
          break;
        case 'diagonal':
          gridOffset.current.x = (gridOffset.current.x - effectiveSpeed + squareSize) % squareSize;
          gridOffset.current.y = (gridOffset.current.y - effectiveSpeed + squareSize) % squareSize;
          break;
        default:
          break;
      }

      drawGrid();
      requestRef.current = requestAnimationFrame(updateAnimation);
    };

    const getGridPosition = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      const startX = Math.floor(gridOffset.current.x / squareSize) * squareSize;
      const startY = Math.floor(gridOffset.current.y / squareSize) * squareSize;

      return {
        x: Math.floor((mouseX + gridOffset.current.x - startX) / squareSize),
        y: Math.floor((mouseY + gridOffset.current.y - startY) / squareSize),
      };
    };

    const handleMouseMove = (event: MouseEvent) => {
      const pos = getGridPosition(event);
      if (
        !hoveredSquareRef.current ||
        hoveredSquareRef.current.x !== pos.x ||
        hoveredSquareRef.current.y !== pos.y
      ) {
        hoveredSquareRef.current = pos;
      }
    };

    const handleClick = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      // Snap to the grid cell's top-left corner
      const offsetX = gridOffset.current.x % squareSize;
      const offsetY = gridOffset.current.y % squareSize;
      const cellX = Math.floor((mouseX + offsetX) / squareSize);
      const cellY = Math.floor((mouseY + offsetY) / squareSize);
      const screenX = cellX * squareSize - offsetX;
      const screenY = cellY * squareSize - offsetY;

      // Check if clicking on an already-clicked square (toggle off with animation)
      const existingIndex = clickedSquaresRef.current.findIndex(clicked => {
        if (clicked.removing) return false;
        const dx = totalMovementRef.current.x - clicked.movementX;
        const dy = totalMovementRef.current.y - clicked.movementY;
        const rawX = clicked.screenX + dx;
        const rawY = clicked.screenY + dy;
        const snappedX = Math.round((rawX + offsetX) / squareSize) * squareSize - offsetX;
        const snappedY = Math.round((rawY + offsetY) / squareSize) * squareSize - offsetY;
        return Math.abs(snappedX - screenX) < 2 && Math.abs(snappedY - screenY) < 2;
      });

      if (existingIndex !== -1) {
        // Mark for animated removal
        clickedSquaresRef.current[existingIndex].removing = true;
      } else {
        clickedSquaresRef.current.push({
          screenX,
          screenY,
          movementX: totalMovementRef.current.x,
          movementY: totalMovementRef.current.y,
          anim: 0,
          removing: false,
        });
      }
    };

    const handleMouseLeave = () => {
      hoveredSquareRef.current = null;
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('click', handleClick);
    requestRef.current = requestAnimationFrame(updateAnimation);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('click', handleClick);
    };
  }, [direction, speed, borderColor, hoverFillColor, clickFillColor, squareSize, clickImage]);

  return <canvas ref={canvasRef} className="w-full h-full border-none block cursor-pointer"></canvas>;
};

export default Squares;
