import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  className?: string;
}

// Convert HSL to HEX
const hslToHex = (h: number, s: number, l: number): string => {
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0, g = 0, b = 0;

  if (0 <= h && h < 60) {
    r = c; g = x; b = 0;
  } else if (60 <= h && h < 120) {
    r = x; g = c; b = 0;
  } else if (120 <= h && h < 180) {
    r = 0; g = c; b = x;
  } else if (180 <= h && h < 240) {
    r = 0; g = x; b = c;
  } else if (240 <= h && h < 300) {
    r = x; g = 0; b = c;
  } else if (300 <= h && h < 360) {
    r = c; g = 0; b = x;
  }

  const toHex = (n: number) => {
    const hex = Math.round((n + m) * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

// Convert HEX to HSL
const hexToHsl = (hex: string): { h: number; s: number; l: number } => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { h: 0, s: 100, l: 50 };

  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
};

const ColorPicker = ({ value, onChange, className }: ColorPickerProps) => {
  const initialHsl = hexToHsl(value);
  const [hue, setHue] = useState(initialHsl.h);
  const [saturation, setSaturation] = useState(initialHsl.s);
  const [lightness, setLightness] = useState(100 - initialHsl.l); // Invert for picker

  const gradientRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const isDraggingGradient = useRef(false);
  const isDraggingHue = useRef(false);

  // Update color when HSL changes
  useEffect(() => {
    const newColor = hslToHex(hue, saturation, 100 - lightness);
    if (newColor.toLowerCase() !== value.toLowerCase()) {
      onChange(newColor);
    }
  }, [hue, saturation, lightness]);

  // Handle gradient picker (saturation/brightness)
  const handleGradientInteraction = useCallback((clientX: number, clientY: number) => {
    if (!gradientRef.current) return;
    
    const rect = gradientRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(clientY - rect.top, rect.height));
    
    const newSaturation = (x / rect.width) * 100;
    const newLightness = (y / rect.height) * 100;
    
    setSaturation(Math.round(newSaturation));
    setLightness(Math.round(newLightness));
  }, []);

  // Handle hue slider
  const handleHueInteraction = useCallback((clientX: number) => {
    if (!hueRef.current) return;
    
    const rect = hueRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const newHue = (x / rect.width) * 360;
    
    setHue(Math.round(newHue));
  }, []);

  // Mouse/touch events for gradient
  const handleGradientMouseDown = (e: React.MouseEvent) => {
    isDraggingGradient.current = true;
    handleGradientInteraction(e.clientX, e.clientY);
  };

  const handleGradientTouchStart = (e: React.TouchEvent) => {
    isDraggingGradient.current = true;
    handleGradientInteraction(e.touches[0].clientX, e.touches[0].clientY);
  };

  // Mouse/touch events for hue
  const handleHueMouseDown = (e: React.MouseEvent) => {
    isDraggingHue.current = true;
    handleHueInteraction(e.clientX);
  };

  const handleHueTouchStart = (e: React.TouchEvent) => {
    isDraggingHue.current = true;
    handleHueInteraction(e.touches[0].clientX);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingGradient.current) {
        handleGradientInteraction(e.clientX, e.clientY);
      }
      if (isDraggingHue.current) {
        handleHueInteraction(e.clientX);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (isDraggingGradient.current) {
        handleGradientInteraction(e.touches[0].clientX, e.touches[0].clientY);
      }
      if (isDraggingHue.current) {
        handleHueInteraction(e.touches[0].clientX);
      }
    };

    const handleMouseUp = () => {
      isDraggingGradient.current = false;
      isDraggingHue.current = false;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchend', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchend', handleMouseUp);
    };
  }, [handleGradientInteraction, handleHueInteraction]);

  const pureHueColor = hslToHex(hue, 100, 50);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Saturation/Brightness Gradient */}
      <div
        ref={gradientRef}
        className="relative w-full h-40 rounded-lg cursor-crosshair overflow-hidden select-none"
        style={{
          background: `
            linear-gradient(to bottom, transparent, black),
            linear-gradient(to right, white, ${pureHueColor})
          `,
        }}
        onMouseDown={handleGradientMouseDown}
        onTouchStart={handleGradientTouchStart}
      >
        {/* Selector circle */}
        <div
          className="absolute w-4 h-4 border-2 border-white rounded-full shadow-md pointer-events-none"
          style={{
            left: `${saturation}%`,
            top: `${lightness}%`,
            transform: 'translate(-50%, -50%)',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.3)',
          }}
        />
      </div>

      {/* Hue Slider */}
      <div
        ref={hueRef}
        className="relative w-full h-4 rounded-full cursor-pointer overflow-hidden select-none"
        style={{
          background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
        }}
        onMouseDown={handleHueMouseDown}
        onTouchStart={handleHueTouchStart}
      >
        {/* Hue selector */}
        <div
          className="absolute w-4 h-4 border-2 border-white rounded-full shadow-md pointer-events-none"
          style={{
            left: `${(hue / 360) * 100}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.3)',
            backgroundColor: pureHueColor,
          }}
        />
      </div>

      {/* Preview and HEX input */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg border border-border shadow-inner flex-shrink-0"
          style={{ backgroundColor: value }}
        />
        <div className="flex-1">
          <input
            type="text"
            value={value.toUpperCase()}
            onChange={(e) => {
              const hex = e.target.value;
              if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
                const hsl = hexToHsl(hex);
                setHue(hsl.h);
                setSaturation(hsl.s);
                setLightness(100 - hsl.l);
                onChange(hex);
              }
            }}
            className="w-full px-3 py-2 text-sm font-mono bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="#000000"
          />
        </div>
      </div>
    </div>
  );
};

export { ColorPicker };
