import { Global, Module } from '@nestjs/common';
import { AI_PROVIDER } from '../providers/ai.provider';
import { OpenAiProvider } from '../providers/openai.provider';

/**
 * AI providers for drafting and future agents.
 * Skeleton AiController removed — drafts live under DraftController.
 */
@Global()
@Module({
  providers: [
    OpenAiProvider,
    {
      provide: AI_PROVIDER,
      useExisting: OpenAiProvider,
    },
  ],
  exports: [AI_PROVIDER, OpenAiProvider],
})
export class AiModule {}
