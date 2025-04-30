import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { Header } from '~/components/header/Header';
import BackgroundRays from '~/components/ui/BackgroundRays';
import TicketChat from '~/components/chat/TicketChat.client';
import { BaseChat } from '~/components/chat/BaseChat';

export async function loader(args: LoaderFunctionArgs) {
  return json({ id: args.params.id });
}

/**
 * Ticket Chat page component
 */
export default function TicketChatPage() {
  return (
    <div className="flex flex-col min-h-screen w-full bg-bolt-elements-background-depth-1 overflow-x-hidden">
      <BackgroundRays />
      <Header />
      <div className="flex-1 flex flex-col overflow-y-auto">
        <ClientOnly fallback={<BaseChat />}>{() => <TicketChat />}</ClientOnly>
      </div>
    </div>
  );
}