import React, { useEffect, useState } from 'react';

interface LoadingAnimationProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
  fullScreen?: boolean;
}

export const LoadingAnimation: React.FC<LoadingAnimationProps> = ({
  size = 'md',
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
      logo: 'w-35 h-35',
      orbit: 'w-24 h-24',
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
    
    .pulse-glow {
      animation: pulse-glow 2s infinite ease-in-out, float 3s infinite ease-in-out;
    }
    
    .orbit-clockwise {
      animation: orbit-clockwise 4s infinite linear;
    }
    
    .orbit-counter-clockwise {
      animation: orbit-counter-clockwise 5s infinite linear;
    }
    
    .dot-pulse {
      animation: dot-pulse 2s infinite ease-in-out;
    }
    
    .dot-delay-1 {
      animation-delay: 0s;
    }
    
    .dot-delay-2 {
      animation-delay: 0.5s;
    }
    
    .dot-delay-3 {
      animation-delay: 1s;
    }
    
    .dot-delay-4 {
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
        <div className={`${sizeMap[size].logo} relative z-20 flex items-center justify-center pulse-glow`}>
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
          className={`absolute ${sizeMap[size].orbit} orbit-clockwise z-10`}
        >
          {/* Inner orbiting dots with pulsing effect */}
          <div className={`absolute ${sizeMap[size].dot} rounded-full bg-sky-500 top-0 left-1/2 transform -translate-x-1/2 dot-pulse dot-delay-1`} 
               style={{ boxShadow: '0 0 5px rgba(14, 165, 233, 0.7)' }}></div>
          <div className={`absolute ${sizeMap[size].dot} rounded-full bg-cyan-600 bottom-0 left-1/2 transform -translate-x-1/2 dot-pulse dot-delay-3`}
               style={{ boxShadow: '0 0 5px rgba(8, 145, 178, 0.7)' }}></div>
        </div>

        {/* Outer orbit container */}
        <div 
          className={`absolute ${sizeMap[size].orbit} orbit-counter-clockwise`}
          style={{ 
            width: `calc(${sizeMap[size].orbit.split(' ')[0]} * 1.5)`, 
            height: `calc(${sizeMap[size].orbit.split(' ')[1]} * 1.5)` 
          }}
        >
          {/* Outer orbiting dots with pulsing effect */}
          <div className={`absolute ${sizeMap[size].dot} rounded-full bg-cyan-500 left-0 top-1/2 transform -translate-y-1/2 dot-pulse dot-delay-2`}
               style={{ boxShadow: '0 0 5px rgba(6, 182, 212, 0.7)' }}></div>
          <div className={`absolute ${sizeMap[size].dot} rounded-full bg-sky-600 right-0 top-1/2 transform -translate-y-1/2 dot-pulse dot-delay-4`}
               style={{ boxShadow: '0 0 5px rgba(2, 132, 199, 0.7)' }}></div>
        </div>
      </div>
      
      {/* Loading message with subtle animation */}
      {message && (
        <p className="mt-4 text-gray-600 dark:text-gray-400" 
           style={{ 
             animation: 'pulse 2s infinite ease-in-out',
             opacity: 0.9
           }}>
          {message}
        </p>
      )}
    </div>
  );

  // If fullScreen is true, center in the viewport
  if (fullScreen) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        {spinnerElement}
      </div>
    );
  }

  // Otherwise, just return the spinner itself
  return spinnerElement;
};

export default LoadingAnimation;
