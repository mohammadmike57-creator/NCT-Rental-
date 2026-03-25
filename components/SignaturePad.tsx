
import React, { useRef, useEffect, useState } from 'react';

interface SignaturePadProps {
    title: string;
    signature?: string;
    onSave: (dataUrl: string) => void;
    onClear: () => void;
    disabled?: boolean;
}

const SignaturePad: React.FC<SignaturePadProps> = ({ title, signature, onSave, onClear, disabled = false }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    // hasSigned tracks if the user has interacted with the current canvas.
    // It's used to differentiate between showing a pre-existing signature (as an image)
    // and showing the active canvas the user is drawing on.
    const [hasSigned, setHasSigned] = useState(false);

    const getContext = () => canvasRef.current?.getContext('2d');

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const resizeCanvas = () => {
          const ctx = getContext();
          if (!ctx) return;
          const { width, height } = canvas.getBoundingClientRect();
          canvas.width = width;
          canvas.height = height;
          
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
        };

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        
        return () => window.removeEventListener('resize', resizeCanvas);

    }, []);

    useEffect(() => {
        // When a signature is provided via props (e.g., after saving or loading),
        // reset hasSigned to false. This ensures the component shows the static <img>
        // of the signature rather than the interactive <canvas>, preventing issues like
        // the signature being cleared on window resize.
        if (signature) {
            setHasSigned(false);
        }
    }, [signature]);

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault(); // Prevent scrolling
        if (disabled || signature) return;
        const ctx = getContext();
        if (!ctx) return;
        
        const pos = getMousePos(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        
        // Draw a single point immediately for a simple touch/click
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        
        setIsDrawing(true);
        setHasSigned(true);
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        if (!isDrawing || disabled || signature) return;
        const ctx = getContext();
        if (!ctx) return;

        const pos = getMousePos(e);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    };

    const stopDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        if (disabled || signature || !isDrawing) return;
        const ctx = getContext();
        if (!ctx) return;
        
        ctx.closePath();
        setIsDrawing(false);

        if (canvasRef.current) {
            onSave(canvasRef.current.toDataURL());
        }
    };
    
    const getMousePos = (e: React.MouseEvent | React.TouchEvent) => {
        const rect = canvasRef.current!.getBoundingClientRect();
        if ('touches' in e && e.touches.length > 0) {
             return {
                x: e.touches[0].clientX - rect.left,
                y: e.touches[0].clientY - rect.top
            };
        }
        return {
            x: (e as React.MouseEvent).clientX - rect.left,
            y: (e as React.MouseEvent).clientY - rect.top
        };
    };

    const handleClear = () => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = getContext();
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        }
        setHasSigned(false);
        onClear();
    };
    
    // Show the saved signature as an image if it exists and the user isn't actively drawing on the canvas.
    // This makes it stable and immune to canvas-clearing events like resize.
    const showImage = signature && !hasSigned;

    return (
        <div>
            <p className="text-sm font-semibold text-gray-700 mb-1">{title}</p>
            <div className="relative w-full h-40 border-2 border-dashed rounded-md bg-gray-50 touch-none">
                {showImage ? (
                    <img src={signature} alt="signature" className="w-full h-full object-contain" />
                ) : (
                    <canvas
                        ref={canvasRef}
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        onTouchStart={startDrawing}
                        onTouchMove={draw}
                        onTouchEnd={stopDrawing}
                        className="w-full h-full"
                    />
                )}
            </div>
             {!disabled && (
                <div className="mt-2 text-right">
                    <button
                        type="button"
                        onClick={handleClear}
                        className="text-sm text-blue-600 hover:underline disabled:text-gray-400"
                        disabled={!signature && !hasSigned}
                    >
                        Clear
                    </button>
                </div>
            )}
        </div>
    );
};

export default SignaturePad;
