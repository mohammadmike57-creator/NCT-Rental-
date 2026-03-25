import React from 'react';

// More detailed front view of a generic sedan
export const FrontCarIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 100 60" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
        {/* Hood */}
        <path d="M20 25 C 25 15, 75 15, 80 25" />
        {/* Windshield */}
        <path d="M22 25 L 30 15 H 70 L 78 25" />
        {/* Bumper */}
        <rect x="15" y="40" width="70" height="8" rx="2" />
        {/* Grille */}
        <rect x="35" y="30" width="30" height="8" />
        <line x1="40" y1="30" x2="40" y2="38" />
        <line x1="45" y1="30" x2="45" y2="38" />
        <line x1="50" y1="30" x2="50" y2="38" />
        <line x1="55" y1="30" x2="55" y2="38" />
        <line x1="60" y1="30" x2="60" y2="38" />
        {/* Headlights */}
        <path d="M20 30 C 25 28, 32 28, 35 30 V 38 C 32 36, 25 36, 20 38 Z" />
        <path d="M80 30 C 75 28, 68 28, 65 30 V 38 C 68 36, 75 36, 80 38 Z" />
        {/* Roof */}
        <path d="M32 15 C 35 10, 65 10, 68 15" />
    </svg>
);

// More detailed back view of a generic sedan
export const BackCarIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 100 60" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
        {/* Trunk */}
        <path d="M20 28 C 25 25, 75 25, 80 28 L 82 40 H 18 Z" />
        {/* Rear Window */}
        <path d="M25 28 L 30 15 H 70 L 75 28" />
        {/* Bumper */}
        <rect x="15" y="42" width="70" height="8" rx="2" />
        {/* Tail Lights */}
        <rect x="20" y="30" width="15" height="8" fill="#ef4444" stroke="none" />
        <rect x="65" y="30" width="15" height="8" fill="#ef4444" stroke="none" />
        {/* License Plate Area */}
        <rect x="40" y="32" width="20" height="8" />
         {/* Roof */}
        <path d="M32 15 C 35 10, 65 10, 68 15" />
    </svg>
);

// More detailed side view of a generic sedan
export const LeftSideCarIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 120 60" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
        {/* Body */}
        <path d="M5 40 L 15 40 C 10 30, 20 25, 30 25 H 80 C 90 25, 105 30, 110 40 L 115 40" />
        {/* Roof */}
        <path d="M30 25 L 40 15 H 75 L 85 25" />
        {/* Windows */}
        <path d="M42 16 L 73 16 L 82 25 L 40 25 Z" />
        <line x1="60" y1="16" x2="60" y2="25" />
        {/* Wheels */}
        <circle cx="30" cy="40" r="8" fill="white" />
        <circle cx="90" cy="40" r="8" fill="white" />
        {/* Door Handles */}
        <line x1="55" y1="28" x2="58" y2="28" />
        <line x1="82" y1="28" x2="85" y2="28" />
    </svg>
);

// Mirrored side view for the right side
export const RightSideCarIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 120 60" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" transform="scale(-1, 1) translate(-120, 0)">
        {/* Body */}
        <path d="M5 40 L 15 40 C 10 30, 20 25, 30 25 H 80 C 90 25, 105 30, 110 40 L 115 40" />
        {/* Roof */}
        <path d="M30 25 L 40 15 H 75 L 85 25" />
        {/* Windows */}
        <path d="M42 16 L 73 16 L 82 25 L 40 25 Z" />
        <line x1="60" y1="16" x2="60" y2="25" />
        {/* Wheels */}
        <circle cx="30" cy="40" r="8" fill="white" />
        <circle cx="90" cy="40" r="8" fill="white" />
        {/* Door Handles */}
        <line x1="55" y1="28" x2="58" y2="28" />
        <line x1="82" y1="28" x2="85" y2="28" />
    </svg>
);
