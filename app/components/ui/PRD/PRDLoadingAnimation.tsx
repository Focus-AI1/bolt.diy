import React from 'react';
import { motion } from 'framer-motion';

interface PRDLoadingAnimationProps {
  message?: string;
}

/**
 * A polished animation component that displays when no PRD is loaded
 */
const PRDLoadingAnimation: React.FC<PRDLoadingAnimationProps> = ({ 
  message = 'Use the PRD Assistant chat to generate or load a Product Requirements Document.'
}) => {
  // Animation variants for the document icon
  const documentVariants = {
    initial: { scale: 0.8, opacity: 0 },
    animate: { 
      scale: 1, 
      opacity: 1,
      transition: {
        duration: 0.5,
        ease: [0.4, 0, 0.2, 1],
      }
    }
  };

  // Animation variants for the floating pages
  const pageVariants = {
    initial: { opacity: 0, y: 10 },
    animate: (i: number) => ({
      opacity: 1,
      y: [10, -5, 10],
      transition: {
        y: {
          duration: 2.5,
          repeat: Infinity,
          ease: "easeInOut",
          delay: i * 0.2,
        },
        opacity: {
          duration: 0.5,
          ease: "easeOut",
        }
      },
    }),
  };

  // Animation variants for the text
  const textVariants = {
    initial: { opacity: 0, y: 20 },
    animate: { 
      opacity: 1, 
      y: 0,
      transition: {
        delay: 0.3,
        duration: 0.5,
        ease: "easeOut",
      }
    }
  };

  // Animation for the subtle pulse effect
  const pulseVariants = {
    initial: { scale: 1 },
    animate: { 
      scale: [1, 1.05, 1],
      transition: {
        duration: 2,
        repeat: Infinity,
        ease: "easeInOut",
      }
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center h-full">
      <div className="text-center p-10 max-w-md mx-auto">
        {/* Main animated icon container */}
        <div className="relative w-32 h-32 mx-auto mb-8">
          {/* Main document icon */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            variants={documentVariants}
            initial="initial"
            animate="animate"
          >
            <motion.div
              variants={pulseVariants}
              initial="initial"
              animate="animate"
              className="i-ph:clipboard-text text-7xl text-bolt-elements-textTertiary"
            />
          </motion.div>
          
          {/* Floating document pages */}
          <motion.div 
            className="absolute -top-2 -right-2 w-10 h-12 bg-white dark:bg-gray-800 rounded shadow-sm border border-bolt-elements-borderColor"
            variants={pageVariants}
            custom={0}
            initial="initial"
            animate="animate"
          />
          <motion.div 
            className="absolute -bottom-2 -left-2 w-10 h-12 bg-white dark:bg-gray-800 rounded shadow-sm border border-bolt-elements-borderColor"
            variants={pageVariants}
            custom={1}
            initial="initial"
            animate="animate"
          />
        </div>
        
        {/* Text content with animations */}
        <motion.div
          variants={textVariants}
          initial="initial"
          animate="animate"
        >
          <h3 className="text-xl font-semibold text-bolt-elements-textPrimary mb-3">Generating PRD...</h3>
          <p className="text-bolt-elements-textSecondary">
            {message}
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default PRDLoadingAnimation;
