import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { motion } from 'framer-motion';
import styles from './UpdateNotification.module.scss';

interface UpdateNotificationProps {
  type: 'prd' | 'ticket';
  details?: {
    id?: string;
    title?: string;
    lastUpdated?: string;
    sections?: { title: string; id: string }[];
    changeCount?: number;
    type?: string;
    priority?: string;
    status?: string;
  };
  onRegenerateClick: () => void;
  onValidateClick: () => void;
}

export const UpdateNotification: React.FC<UpdateNotificationProps> = ({ 
  type, 
  details, 
  onRegenerateClick,
  onValidateClick
}) => {
  const getNotificationMessage = () => {
    if (type === 'prd') {
      if (details?.title) {
        return `We've detected an update in the Product Requirements Document "${details.title}"`;
      }
      return "We've detected an update in the Product Requirements Document";
    } else {
      if (details?.id && details?.title) {
        return `Ticket #${details.id} "${details.title}" has been updated`;
      } else if (details?.id) {
        return `Ticket #${details.id} has been updated`;
      } else if (details?.title) {
        return `Ticket "${details.title}" has been updated`;
      }
      return "We've detected an update in the Ticket information";
    }
  };

  const getTimeInfo = () => {
    if (details?.lastUpdated) {
      try {
        const date = new Date(details.lastUpdated);
        return formatDistanceToNow(date, { addSuffix: true });
      } catch (e) {
        return '';
      }
    }
    return '';
  };

  const getAdditionalInfo = () => {
    if (type === 'prd') {
      const changeText = details?.changeCount 
        ? `${details.changeCount} section${details.changeCount > 1 ? 's' : ''} ${details.changeCount > 1 ? 'have' : 'has'} been modified.` 
        : 'Some sections have been modified.';
        
      return `Changes to requirements may affect the implementation of your prototype. ${changeText} Regenerating will ensure your code aligns with the latest specifications and business requirements.`;
    } else {
      const changeText = details?.changeCount 
        ? `${details.changeCount} ticket${details.changeCount > 1 ? 's' : ''} ${details.changeCount > 1 ? 'have' : 'has'} been updated.` 
        : 'Some tickets have been updated.';
        
      return `Updates to tickets may include new features, bug fixes, priority changes, or implementation details. ${changeText} Regenerating will incorporate these changes into your prototype.`;
    }
  };

  const getImpactInfo = () => {
    if (type === 'prd') {
      return "This update might impact the architecture, features, or implementation details of your prototype. Regenerating now will help maintain alignment with the latest product vision.";
    } else {
      return "This ticket update might affect specific components, functionality, or the priority of implementation tasks. Regenerating now will ensure your prototype reflects these changes.";
    }
  };

  const getChangedSections = () => {
    if (type === 'prd' && details?.sections && details.sections.length > 0) {
      return (
        <div className="mt-2 text-sm">
          <div className="font-medium text-bolt-elements-textSecondary mb-1">Changed sections:</div>
          <ul className="list-disc pl-5 text-bolt-elements-textSecondary">
            {details.sections.map(section => (
              <li key={section.id}>{section.title}</li>
            ))}
          </ul>
        </div>
      );
    }
    return null;
  };

  const getTicketDetails = () => {
    if (type === 'ticket' && (details?.type || details?.priority || details?.status)) {
      return (
        <div className="mt-2 flex flex-wrap gap-2">
          {details.type && (
            <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">
              Type: {details.type}
            </span>
          )}
          {details.priority && (
            <span className={`px-2 py-1 text-xs rounded-full ${getPriorityClass(details.priority)}`}>
              {details.priority}
            </span>
          )}
          {details.status && (
            <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
              {details.status}
            </span>
          )}
        </div>
      );
    }
    return null;
  };

  const getPriorityClass = (priority: string) => {
    const lowerPriority = priority.toLowerCase();
    if (lowerPriority.includes('high') || lowerPriority.includes('urgent')) {
      return 'bg-red-100 text-red-800';
    } else if (lowerPriority.includes('medium')) {
      return 'bg-yellow-100 text-yellow-800';
    } else if (lowerPriority.includes('low')) {
      return 'bg-green-100 text-green-800';
    }
    return 'bg-gray-100 text-gray-800';
  };

  const timeInfo = getTimeInfo();
  const iconClass = type === 'prd' ? 'i-ph:file-doc-duotone' : 'i-ph:ticket-duotone';
  const gradientClass = type === 'prd' ? 'from-blue-500/10 to-indigo-500/10' : 'from-amber-500/10 to-orange-500/10';
  const iconColorClass = type === 'prd' ? 'text-blue-500' : 'text-amber-500';

  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`mb-4 rounded-lg border border-bolt-elements-borderColor overflow-hidden ${styles.notification} ${styles[type]}`}
    >
      <div className={`bg-gradient-to-r ${gradientClass} p-5`}>
        <div className={styles.shimmer}></div>
        <div className="flex items-start">
          <div className={`${iconClass} ${iconColorClass} text-3xl mr-4 mt-0.5 flex-shrink-0`}></div>
          <div className="flex-grow">
            <div className="flex items-center">
              <span className={`${styles.badge} ${styles[type]} mr-2`}>
                {type === 'prd' ? 'PRD Update' : 'Ticket Update'}
              </span>
              {timeInfo && (
                <span className="text-xs text-bolt-elements-textTertiary flex items-center">
                  <div className="i-ph:clock-duotone mr-1"></div>
                  {timeInfo}
                </span>
              )}
            </div>
            
            <div className="font-semibold text-bolt-elements-textPrimary text-lg mt-1">
              {getNotificationMessage()}
            </div>
            
            {getTicketDetails()}
            
            <div className="mt-3 text-sm text-bolt-elements-textSecondary">
              {getAdditionalInfo()}
            </div>
            
            {getChangedSections()}
            
            <div className="mt-2 text-sm text-bolt-elements-textSecondary">
              {getImpactInfo()}
            </div>
            
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={onRegenerateClick}
                className={`px-4 py-2 rounded-md bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-4 text-sm font-medium transition-colors flex items-center ${styles.button}`}
              >
                <div className="i-ph:arrows-clockwise mr-1.5"></div>
                Regenerate Prototype
              </button>
              
              <button
                onClick={onValidateClick}
                className={`px-4 py-2 rounded-md bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 text-sm font-medium transition-colors flex items-center ${styles.button}`}
              >
                <div className="i-ph:check-circle mr-1.5"></div>
                Cancel
              </button>
              
              <div className="text-xs text-bolt-elements-textTertiary flex items-center">
                <div className="i-ph:info-duotone mr-1"></div>
                This will use the latest document versions
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
