import React, { useEffect, useState } from 'react';

interface ClerkLoadingOverlayProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
  fullScreen?: boolean;
}

/**
 * Custom loading overlay to replace Clerk's default loading animation
 * Used during authentication state loading
 */
const ClerkLoadingOverlay: React.FC<ClerkLoadingOverlayProps> = ({
  size = 'lg',
  message = 'Loading...',
  fullScreen = true,
}) => {
  // Size mapping for the logo and container
  const sizeMap = {
    sm: {
      logo: 'w-8 h-8',
      orbit: 'w-12 h-12',
      dot: 'w-1.5 h-1.5',
      glow: '0 0 10px',
    },
    md: {
      logo: 'w-12 h-12',
      orbit: 'w-16 h-16',
      dot: 'w-2 h-2',
      glow: '0 0 15px',
    },
    lg: {
      logo: 'w-34 h-34',
      orbit: 'w-40 h-40',
      dot: 'w-2.5 h-2.5',
      glow: '0 0 20px',
    },
  };

  // Add fade-in effect
  const [opacity, setOpacity] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setOpacity(100), 50);
    return () => clearTimeout(timer);
  }, []);
  
  // Define keyframe animations and styles
  const animationCSS = `
    @keyframes pulse-glow {
      0% { filter: drop-shadow(0 0 0 rgba(14, 165, 233, 0.3)); transform: scale(0.95); }
      50% { filter: drop-shadow(${sizeMap[size].glow} rgba(14, 165, 233, 0.5)); transform: scale(1.05); }
      100% { filter: drop-shadow(0 0 0 rgba(14, 165, 233, 0.3)); transform: scale(0.95); }
    }
    
    @keyframes orbit-clockwise {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    @keyframes orbit-counter-clockwise {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(-360deg); }
    }
    
    @keyframes dot-pulse {
      0%, 100% { transform: scale(0.8); opacity: 0.6; }
      50% { transform: scale(1.2); opacity: 1; }
    }

    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-5px); }
    }
    
    .clerkLoader-pulse-glow {
      animation: pulse-glow 2s infinite ease-in-out, float 3s infinite ease-in-out;
    }
    
    .clerkLoader-orbit-clockwise {
      animation: orbit-clockwise 4s infinite linear;
    }
    
    .clerkLoader-orbit-counter-clockwise {
      animation: orbit-counter-clockwise 5s infinite linear;
    }
    
    .clerkLoader-dot-pulse {
      animation: dot-pulse 2s infinite ease-in-out;
    }
    
    .clerkLoader-dot-delay-1 {
      animation-delay: 0s;
    }
    
    .clerkLoader-dot-delay-2 {
      animation-delay: 0.5s;
    }
    
    .clerkLoader-dot-delay-3 {
      animation-delay: 1s;
    }
    
    .clerkLoader-dot-delay-4 {
      animation-delay: 1.5s;
    }
  `;

  // Effect to inject and remove styles
  useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.innerHTML = animationCSS;
    document.head.appendChild(styleElement);
    
    return () => {
      document.head.removeChild(styleElement);
    };
  }, [animationCSS]);

  const spinnerElement = (
    <div className="text-center" style={{ opacity: `${opacity}%`, transition: 'opacity 0.5s ease-in' }}>

      <div className="relative mx-auto flex items-center justify-center" style={{ width: 'fit-content' }}>
        {/* Main logo with sophisticated pulsing glow effect */}
        <div className={`${sizeMap[size].logo} relative z-20 flex items-center justify-center clerkLoader-pulse-glow`}>
          <img 
            src="/logo-blue.svg" 
            className={`${sizeMap[size].logo}`} 
            alt="Loading"
            style={{ 
              filter: 'brightness(1.05)',
            }} 
          />
        </div>
        
        {/* Inner orbit container */}
        <div 
          className={`absolute ${sizeMap[size].orbit} clerkLoader-orbit-clockwise z-10`}
        >
          {/* Inner orbiting dots with pulsing effect */}
          <div className={`absolute ${sizeMap[size].dot} rounded-full bg-sky-500 top-0 left-1/2 transform -translate-x-1/2 clerkLoader-dot-pulse clerkLoader-dot-delay-1`} 
               style={{ boxShadow: '0 0 5px rgba(14, 165, 233, 0.7)' }}></div>
          <div className={`absolute ${sizeMap[size].dot} rounded-full bg-cyan-600 bottom-0 left-1/2 transform -translate-x-1/2 clerkLoader-dot-pulse clerkLoader-dot-delay-3`}
               style={{ boxShadow: '0 0 5px rgba(8, 145, 178, 0.7)' }}></div>
        </div>

        {/* Outer orbit container */}
        <div 
          className={`absolute ${sizeMap[size].orbit} clerkLoader-orbit-counter-clockwise`}
          style={{ 
            width: `calc(${sizeMap[size].orbit.split(' ')[0]} * 1.5)`, 
            height: `calc(${sizeMap[size].orbit.split(' ')[1]} * 1.5)` 
          }}
        >
          {/* Outer orbiting dots with pulsing effect */}
          <div className={`absolute ${sizeMap[size].dot} rounded-full bg-cyan-500 left-0 top-1/2 transform -translate-y-1/2 clerkLoader-dot-pulse clerkLoader-dot-delay-2`}
               style={{ boxShadow: '0 0 5px rgba(6, 182, 212, 0.7)' }}></div>
          <div className={`absolute ${sizeMap[size].dot} rounded-full bg-sky-600 right-0 top-1/2 transform -translate-y-1/2 clerkLoader-dot-pulse clerkLoader-dot-delay-4`}
               style={{ boxShadow: '0 0 5px rgba(2, 132, 199, 0.7)' }}></div>
        </div>
      </div>
      
      {/* Loading message with subtle animation */}
      {message && (
        <p className="mt-4 text-gray-600 dark:text-gray-400" 
           style={{ 
             opacity: 0.9
           }}>
          {message}
        </p>
      )}
    </div>
  );

  // If fullScreen is true, center in the viewport with fixed positioning
  if (fullScreen) {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm">
        {spinnerElement}
      </div>
    );
  }

  // Otherwise, just return the spinner itself
  return spinnerElement;
};

export default ClerkLoadingOverlay;
