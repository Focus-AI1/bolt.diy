import React from 'react';
import { STARTER_TEMPLATES } from '~/utils/constants';

const StarterTemplates = () => {
  return (
    <div className="w-full max-w-[1200px] mx-auto px-4 mb-16 mt-2">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-bolt-elements-textPrimary">Developer Templates</h2>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {STARTER_TEMPLATES.map((template) => (
          <a 
            key={template.name}
            href={`/git?url=https://github.com/${template.githubRepo}.git`}
            className="group flex flex-col rounded-lg overflow-hidden border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 hover:shadow-md transition-all duration-200 cursor-pointer"
          >
            {/* Template image or icon fallback */}
            <div className="h-40 bg-bolt-elements-background-depth-2 relative overflow-hidden">
              {template.image ? (
                <img 
                  src={template.image} 
                  alt={template.label}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className={`text-4xl ${template.icon}`}></div>
                </div>
              )}
            </div>
            
            {/* Content area with flex-grow to push button to bottom */}
            <div className="p-4 flex-grow flex flex-col">
              <div className="flex items-center gap-2 mb-2">
                <div className={`text-xl ${template.icon}`}></div>
                <h3 className="font-medium text-bolt-elements-textPrimary">{template.label}</h3>
              </div>
              
              <p className="text-sm text-bolt-elements-textSecondary mb-3 line-clamp-2">
                {template.description}
              </p>
              
              <div className="flex flex-wrap gap-2 mt-auto">
                {template.tags.slice(0, 3).map((tag) => (
                  <span 
                    key={tag} 
                    className="px-2 py-1 text-xs rounded-full bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            
            {/* Button at the bottom */}
            <div className="block w-full py-2 text-center text-sm font-medium bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary group-hover:bg-bolt-elements-item-backgroundAccent group-hover:text-bolt-elements-item-contentAccent transition-colors duration-200">
              Use Template
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};

export default StarterTemplates;
