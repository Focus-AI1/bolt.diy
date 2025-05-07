import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';

interface PRDStreamingIndicatorProps {
  /**
   * Custom text to display during the initial loading phase
   * @default "Generating PRD content"
   */
  text?: string;
  /**
   * Optional callback when generation is complete
   */
  onComplete?: () => void;
  /**
   * Optional custom theme
   * @default "blue"
   */
  theme?: 'blue' | 'purple' | 'teal' | 'amber';
  /**
   * Optional estimated completion time in seconds (for progress estimation)
   * @default 32
   */
  estimatedTime?: number;
}

/**
 * A sophisticated streaming indicator component that shows the progress of PRD generation
 * with smooth animations, visual feedback, and modern design patterns.
 */
const PRDStreamingIndicator: React.FC<PRDStreamingIndicatorProps> = ({
  text = 'Generating PRD content',
  onComplete,
  theme = 'blue',
  estimatedTime = 32
}) => {
  // State management
  const [loadingPhase, setLoadingPhase] = useState<number>(0);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [isComplete, setIsComplete] = useState<boolean>(false);
  const progressAnimation = useAnimation();
  const pulseAnimation = useAnimation();
  const startTime = useRef<number>(Date.now());
  
  // Theme configurations
  const themes = {
    blue: {
      primary: 'from-blue-500 to-blue-600',
      secondary: 'from-indigo-500 to-violet-600',
      accent: 'blue-500',
      textAccent: 'text-blue-600',
      background: 'bg-blue-50 dark:bg-blue-900/20',
      progress: 'from-blue-500 via-indigo-500 to-blue-500',
      border: 'border-blue-200 dark:border-blue-800'
    },
    purple: {
      primary: 'from-purple-500 to-purple-600',
      secondary: 'from-fuchsia-500 to-purple-600',
      accent: 'purple-500',
      textAccent: 'text-purple-600',
      background: 'bg-purple-50 dark:bg-purple-900/20',
      progress: 'from-purple-500 via-fuchsia-500 to-purple-500',
      border: 'border-purple-200 dark:border-purple-800'
    },
    teal: {
      primary: 'from-teal-500 to-teal-600',
      secondary: 'from-cyan-500 to-teal-600',
      accent: 'teal-500',
      textAccent: 'text-teal-600',
      background: 'bg-teal-50 dark:bg-teal-900/20',
      progress: 'from-teal-500 via-cyan-500 to-teal-500',
      border: 'border-teal-200 dark:border-teal-800'
    },
    amber: {
      primary: 'from-amber-500 to-amber-600',
      secondary: 'from-orange-500 to-amber-600',
      accent: 'amber-500',
      textAccent: 'text-amber-600',
      background: 'bg-amber-50 dark:bg-amber-900/20',
      progress: 'from-amber-500 via-orange-500 to-amber-500',
      border: 'border-amber-200 dark:border-amber-800'
    }
  };
  
  const activeTheme = themes[theme];

  // Enhanced loading phases with more detailed steps
  const loadingPhases = [
    text,
    'Analyzing requirements',
    'Defining key features',
    'Structuring document sections',
    'Researching market context',
    'Establishing user stories',
    'Creating specifications',
    'Building implementation details',
    'Finalizing content'
  ];

  // Calculate estimated progress
  const calculateProgress = () => {
    const progress = Math.min((elapsedTime / estimatedTime) * 100, 99);
    return isComplete ? 100 : progress;
  };
  
  // Time-based progress updates
  useEffect(() => {
    const timer = setInterval(() => {
      const newElapsedTime = (Date.now() - startTime.current) / 1000;
      setElapsedTime(newElapsedTime);
      
      // If we've reached the estimated time, complete the animation
      if (newElapsedTime >= estimatedTime && !isComplete) {
        setIsComplete(true);
        if (onComplete) onComplete();
      }
    }, 1000);
    
    return () => clearInterval(timer);
  }, [estimatedTime, isComplete, onComplete]);
  
  // Progress animation update
  useEffect(() => {
    progressAnimation.start({
      width: `${calculateProgress()}%`,
      transition: { 
        duration: 0.8, 
        ease: 'easeInOut'
      }
    });
  }, [elapsedTime, isComplete, progressAnimation]);

  // Phase cycling animation
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isComplete) {
        setLoadingPhase(prev => (prev + 1) % loadingPhases.length);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isComplete, loadingPhases.length]);
  
  // Pulse animation setup
  useEffect(() => {
    pulseAnimation.start({
      scale: [1, 1.05, 1],
      transition: {
        duration: 2,
        repeat: Infinity,
        ease: 'easeInOut'
      }
    });
  }, [pulseAnimation]);

  // Animation variants
  const spinnerVariants = {
    animate: {
      rotate: 360,
      transition: {
        duration: 1.5,
        repeat: Infinity,
        ease: 'linear'
      }
    }
  };

  const dotsVariants = {
    animate: {
      x: [0, 14, 0],
      transition: {
        duration: 2.5,
        repeat: Infinity,
        ease: 'easeInOut'
      }
    }
  };

  const textVariants = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
    transition: { duration: 0.3, ease: 'easeOut' }
  };

  const glowVariants = {
    animate: {
      boxShadow: [
        '0 0 0 0 rgba(59, 130, 246, 0)',
        '0 0 12px 4px rgba(59, 130, 246, 0.3)',
        '0 0 0 0 rgba(59, 130, 246, 0)'
      ],
      transition: {
        duration: 3,
        repeat: Infinity,
        ease: 'easeInOut'
      }
    }
  };

  // SVG paths for the advanced spinner
  const spinnerPaths = {
    outer: "M18.364 5.636a9 9 0 0 1 0 12.728m-12.728 0a9 9 0 0 1 0-12.728",
    middle: "M16.243 7.757a6 6 0 0 1 0 8.486m-8.486 0a6 6 0 0 1 0-8.486",
    inner: "M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"
  };

  return (
    <div className={`w-full rounded-lg border ${activeTheme.border} overflow-hidden shadow-sm`}>
      {/* Main container with subtle gradient background */}
      <div className={`${activeTheme.background} backdrop-blur-sm backdrop-saturate-150`}>
        {/* Header section with spinner and text */}
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center space-x-4">
            {/* Advanced animated spinner */}
            <div className="relative w-6 h-6">
              <motion.svg 
                viewBox="0 0 24 24" 
                fill="none" 
                xmlns="http://www.w3.org/2000/svg"
                className="w-6 h-6 absolute"
                variants={spinnerVariants}
                animate="animate"
              >
                <motion.path 
                  d={spinnerPaths.outer} 
                  stroke={`url(#gradient-${theme})`} 
                  strokeWidth="1.5" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                />
                <motion.path 
                  d={spinnerPaths.middle} 
                  stroke={`url(#gradient-${theme})`} 
                  strokeWidth="1.5" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.path 
                  d={spinnerPaths.inner} 
                  fill={`url(#gradient-${theme})`} 
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1.2 }}
                  transition={{ duration: 1.5, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
                />
                {/* SVG gradient definitions */}
                <defs>
                  <linearGradient id={`gradient-${theme}`} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" className={`stop-${activeTheme.accent}`} />
                    <stop offset="100%" className={`stop-${activeTheme.accent}`} style={{ stopOpacity: 0.6 }} />
                  </linearGradient>
                </defs>
              </motion.svg>
            </div>

            {/* Text animation with phase indicator */}
            <div className="flex flex-col">
              <AnimatePresence mode="wait">
                <motion.span
                  key={loadingPhase}
                  variants={textVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className={`text-sm font-semibold ${activeTheme.textAccent}`}
                >
                  {loadingPhases[loadingPhase]}
                </motion.span>
              </AnimatePresence>
              
              {/* Secondary status with animated dots */}
              <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                <span>Processing</span>
                <div className="flex ml-1 overflow-hidden">
                  <motion.div
                    variants={dotsVariants}
                    animate="animate"
                    className="flex space-x-0.5"
                  >
                    <div className={`w-1 h-1 rounded-full bg-${activeTheme.accent}`}></div>
                    <div className={`w-1 h-1 rounded-full bg-${activeTheme.accent}`}></div>
                    <div className={`w-1 h-1 rounded-full bg-${activeTheme.accent}`}></div>
                  </motion.div>
                </div>
              </div>
            </div>
          </div>

          {/* Status badge with pulse animation */}
          <motion.div
            animate={pulseAnimation}
            className={`bg-gradient-to-r ${activeTheme.secondary} text-xs font-semibold text-white px-3 py-1.5 rounded-full flex items-center shadow-sm`}
          >
            {/* AI chip icon */}
            <svg className="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" clipRule="evenodd" d="M14 7C13.4477 7 13 7.44772 13 8V16C13 16.5523 13.4477 17 14 17H18C18.5523 17 19 16.5523 19 16V8C19 7.44772 18.5523 7 18 7H14ZM11 8C11 6.34315 12.3431 5 14 5H18C19.6569 5 21 6.34315 21 8V16C21 17.6569 19.6569 19 18 19H14C12.3431 19 11 17.6569 11 16V8Z" fill="currentColor" />
              <path fillRule="evenodd" clipRule="evenodd" d="M8 7C7.44772 7 7 7.44772 7 8V16C7 16.5523 7.44772 17 8 17H10C10.5523 17 11 16.5523 11 16V8C11 7.44772 10.5523 7 10 7H8ZM5 8C5 6.34315 6.34315 5 8 5H10C11.6569 5 13 6.34315 13 8V16C13 17.6569 11.6569 19 10 19H8C6.34315 19 5 17.6569 5 16V8Z" fill="currentColor" />
              <path fillRule="evenodd" clipRule="evenodd" d="M1 8C1 6.34315 2.34315 5 4 5H6C7.65685 5 9 6.34315 9 8V16C9 17.6569 7.65685 19 6 19H4C2.34315 19 1 17.6569 1 16V8ZM4 7C3.44772 7 3 7.44772 3 8V16C3 16.5523 3.44772 17 4 17H6C6.55228 17 7 16.5523 7 16V8C7 7.44772 6.55228 7 6 7H4Z" fill="currentColor" />
            </svg>
            <span className="whitespace-nowrap">AI Processing</span>
          </motion.div>
        </div>
        
        {/* Information section with current stage and estimated time */}
        <div className="px-5 pb-3 pt-1 flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center">
            <svg className="w-3.5 h-3.5 mr-1" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 8V12L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            <span>
              {isComplete 
                ? 'Completed' 
                : `Estimated time: ${Math.max(0, Math.ceil(estimatedTime - elapsedTime))}s remaining`
              }
            </span>
          </div>
          <div className="text-xs">
            Stage {loadingPhase + 1}/{loadingPhases.length}
          </div>
        </div>

        {/* Progress bar with dynamic width */}
        <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <motion.div
            className={`h-full bg-gradient-to-r ${activeTheme.progress}`}
            animate={progressAnimation}
            initial={{ width: '0%' }}
            style={{ transformOrigin: 'left center' }}
          />
        </div>
      </div>
    </div>
  );
};

export default PRDStreamingIndicator;