/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Mobile-first breakpoints
      screens: {
        'xs': '375px',   // iPhone SE and similar small phones
        'sm': '640px',   // Large phones landscape / small tablets portrait
        'md': '768px',   // Tablets portrait
        'lg': '1024px',  // Tablets landscape / small laptops
        'xl': '1280px',  // Laptops
        '2xl': '1536px', // Large screens

        // Special device breakpoints
        'iPhone-SE': '375px',
        'iPhone': '390px',
        'iPhone-Pro-Max': '428px',
        'iPad': '768px',
        'iPad-Pro': '1024px',

        // Orientation-specific
        'portrait': { 'raw': '(orientation: portrait)' },
        'landscape': { 'raw': '(orientation: landscape)' },

        // Touch-specific
        'touch': { 'raw': '(pointer: coarse)' },
        'mouse': { 'raw': '(pointer: fine)' },

        // Hover support
        'hover': { 'raw': '(hover: hover)' },
        'no-hover': { 'raw': '(hover: none)' },
      },

      // Touch-friendly spacing
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-right': 'env(safe-area-inset-right)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',

        // Common mobile spacing
        'touch-target': '44px',  // Minimum touch target size
        'bottom-nav': '64px',    // Bottom navigation height
        'top-bar': '56px',       // Top bar height
        'fab': '56px',           // FAB size
      },

      // Touch-friendly sizing
      minHeight: {
        'touch': '44px',
        'screen-safe': 'calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
      },

      minWidth: {
        'touch': '44px',
      },

      maxHeight: {
        'screen-safe': 'calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
      },

      // Mobile-optimized colors
      colors: {
        ios: {
          blue: '#007AFF',
          green: '#34C759',
          orange: '#FF9500',
          red: '#FF3B30',
          gray: {
            50: '#F2F2F7',
            100: '#E5E5EA',
            200: '#D1D1D6',
            300: '#C7C7CC',
            400: '#AEAEB2',
            500: '#8E8E93',
            600: '#636366',
            700: '#48484A',
            800: '#3A3A3C',
            900: '#2C2C2E',
          },
        },
        android: {
          blue: '#2196F3',
          green: '#4CAF50',
          orange: '#FF9800',
          red: '#F44336',
        },
      },

      // Mobile-optimized animations
      animation: {
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'slide-left': 'slideLeft 0.3s ease-out',
        'slide-right': 'slideRight 0.3s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
        'fade-out': 'fadeOut 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'scale-out': 'scaleOut 0.2s ease-out',
        'bounce-subtle': 'bounceSubtle 0.5s ease-out',
        'shake': 'shake 0.5s ease-out',
        'pulse-subtle': 'pulseSubtle 2s ease-in-out infinite',
      },

      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        slideLeft: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        slideRight: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        scaleOut: {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(0.9)', opacity: '0' },
        },
        bounceSubtle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-5px)' },
          '20%, 40%, 60%, 80%': { transform: 'translateX(5px)' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },

      // Mobile-optimized typography
      fontSize: {
        'touch-xs': ['12px', { lineHeight: '16px', letterSpacing: '0.01em' }],
        'touch-sm': ['14px', { lineHeight: '20px', letterSpacing: '0.01em' }],
        'touch-base': ['16px', { lineHeight: '24px', letterSpacing: '0' }],
        'touch-lg': ['18px', { lineHeight: '28px', letterSpacing: '-0.01em' }],
        'touch-xl': ['20px', { lineHeight: '32px', letterSpacing: '-0.01em' }],
      },

      // Mobile-optimized shadows
      boxShadow: {
        'mobile-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'mobile': '0 2px 4px 0 rgba(0, 0, 0, 0.1)',
        'mobile-md': '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        'mobile-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
        'mobile-xl': '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        'bottom-nav': '0 -2px 8px 0 rgba(0, 0, 0, 0.1)',
        'fab': '0 4px 12px 0 rgba(0, 0, 0, 0.15)',
      },

      // Mobile-optimized border radius
      borderRadius: {
        'mobile': '12px',
        'mobile-lg': '16px',
        'mobile-xl': '20px',
        'mobile-2xl': '24px',
        'ios': '10px',
        'android': '8px',
      },

      // Z-index layers
      zIndex: {
        'bottom-nav': '40',
        'top-bar': '40',
        'drawer': '50',
        'modal': '50',
        'fab': '30',
        'toast': '60',
        'tooltip': '70',
      },

      // Backdrop blur
      backdropBlur: {
        'mobile': '8px',
        'ios': '20px',
      },

      // Transitions optimized for 60fps
      transitionDuration: {
        'fast': '150ms',
        'normal': '250ms',
        'slow': '350ms',
      },

      transitionTimingFunction: {
        'ios': 'cubic-bezier(0.25, 0.1, 0.25, 1)',
        'android': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'bounce-subtle': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },

  plugins: [
    // Plugin for safe area
    function({ addUtilities }) {
      const newUtilities = {
        '.safe-area-top': {
          paddingTop: 'env(safe-area-inset-top)',
        },
        '.safe-area-right': {
          paddingRight: 'env(safe-area-inset-right)',
        },
        '.safe-area-bottom': {
          paddingBottom: 'env(safe-area-inset-bottom)',
        },
        '.safe-area-left': {
          paddingLeft: 'env(safe-area-inset-left)',
        },
        '.safe-area-inset': {
          paddingTop: 'env(safe-area-inset-top)',
          paddingRight: 'env(safe-area-inset-right)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
        },

        // Touch manipulation
        '.touch-manipulation': {
          touchAction: 'manipulation',
          WebkitTapHighlightColor: 'transparent',
          userSelect: 'none',
        },

        // Scrollbar hide
        '.scrollbar-hide': {
          '-ms-overflow-style': 'none',
          'scrollbar-width': 'none',
          '&::-webkit-scrollbar': {
            display: 'none',
          },
        },

        // Smooth scrolling
        '.scroll-smooth-mobile': {
          scrollBehavior: 'smooth',
          WebkitOverflowScrolling: 'touch',
        },

        // Prevent text selection
        '.no-select': {
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none',
          userSelect: 'none',
        },

        // GPU acceleration
        '.gpu-accelerated': {
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
          perspective: '1000px',
        },

        // iOS-style card
        '.ios-card': {
          backgroundColor: '#FFFFFF',
          borderRadius: '10px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        },

        // Android-style card
        '.android-card': {
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.15)',
        },

        // Bottom sheet backdrop
        '.bottom-sheet-backdrop': {
          position: 'fixed',
          inset: '0',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
        },

        // Haptic feedback ready
        '.haptic-ready': {
          cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        },
      };

      addUtilities(newUtilities);
    },

    // Plugin for aspect ratios (for older Tailwind versions)
    require('@tailwindcss/aspect-ratio'),

    // Plugin for forms
    require('@tailwindcss/forms')({
      strategy: 'class',
    }),

    // Plugin for line clamp
    require('@tailwindcss/line-clamp'),
  ],

  // Variants for mobile interactions
  variants: {
    extend: {
      opacity: ['active', 'disabled'],
      backgroundColor: ['active', 'disabled'],
      borderColor: ['active', 'disabled'],
      transform: ['active', 'group-hover'],
      scale: ['active', 'group-hover'],
    },
  },

  // Safelist important mobile classes
  safelist: [
    'safe-area-top',
    'safe-area-bottom',
    'safe-area-left',
    'safe-area-right',
    'touch-manipulation',
    'scrollbar-hide',
    'gpu-accelerated',
  ],
};
