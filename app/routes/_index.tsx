import { json, type MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { Header } from '~/components/header/Header';
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from '~/utils/constants';

export const meta: MetaFunction = () => {
  return [
    { title: 'BuddyBuilder' },
    { name: 'description', content: 'Talk with BuddyBuilder, your AI development assistant' }
  ];
};

export const loader = () => json({});

export default function Index() {
  return (
    <div className="flex flex-col h-full w-full">
      <Header />
      <ClientOnly fallback={
        <BaseChat 
          model={DEFAULT_MODEL}
          setModel={() => {}}
          provider={DEFAULT_PROVIDER}
          setProvider={() => {}}
        />
      }>
        {() => <Chat />}
      </ClientOnly>
    </div>
  );
}
