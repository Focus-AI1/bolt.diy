import { json, type MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { Header } from '~/components/header/Header';
import BackgroundRays from '~/components/ui/BackgroundRays';

export const meta: MetaFunction = () => {
  return [{ title: 'Focus AI' }, { name: 'description', content: 'Talk with Copilot, an AI assistant from Focus AI' }];
};

export const loader = () => json({});

/**
 * Landing page component for Copilot
 * Note: Settings functionality should ONLY be accessed through the sidebar menu.
 * Do not add settings button/panel to this landing page as it was intentionally removed
 * to keep the UI clean and consistent with the design system.
 */
export default function Index() {
  return (
    <div className="flex flex-col min-h-screen w-full bg-bolt-elements-background-depth-1 overflow-x-hidden">
      <BackgroundRays />
      <Header />
      <div className="flex-1 flex flex-col overflow-y-auto">
        <ClientOnly fallback={<BaseChat />}>{() => <Chat />}</ClientOnly>
      </div>
    </div>
  );
}
