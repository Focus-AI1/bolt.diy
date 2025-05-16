import { useStore } from '@nanostores/react';
import { ClientOnly } from 'remix-utils/client-only';
import { chatStore } from '~/lib/stores/chat';
import { classNames } from '~/utils/classNames';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';
import { Link } from '@remix-run/react';

export function Header() {
  const chat = useStore(chatStore);

  return (
    <header
      className={classNames('flex items-center p-5 border-b h-[var(--header-height)]', {
        'border-transparent': !chat.started,
        'border-bolt-elements-borderColor': chat.started,
      })}
    >
      <div className="flex items-center gap-2 z-logo text-bolt-elements-textPrimary cursor-pointer sm:ml-8 sm:mb-3">
        {/* <div className="i-ph:sidebar-simple-duotone text-xl" /> */}
        <Link to="/" className="text-2xl font-semibold text-accent flex items-center">
          {/* Light mode logo (hidden in dark mode) */}
          <img 
            src="/logo-blue.svg" 
            alt="logo" 
            className="w-[120px] inline-block dark:hidden" 
          />
          {/* Dark mode logo (hidden in light mode) */}
          <img 
            src="/logo-white.svg" 
            alt="logo" 
            className="w-[120px] inline-block hidden dark:inline-block" 
          />
        </Link>
      </div>
      {chat.started && (
        <>
          <span className="flex-1 px-4 truncate text-center text-bolt-elements-textPrimary">
            <ClientOnly>{() => <ChatDescription />}</ClientOnly>
          </span>
          <ClientOnly>
            {() => (
              <div className="mr-1">
                <HeaderActionButtons />
              </div>
            )}
          </ClientOnly>
        </>
      )}
    </header>
  );
}
