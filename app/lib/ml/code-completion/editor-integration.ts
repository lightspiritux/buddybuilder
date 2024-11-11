import { CompletionContext } from '@codemirror/autocomplete';
import type { CompletionResult, Completion } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import { codeTransformer } from '../code-understanding/transformer';
import { EditorState } from '@codemirror/state';

/**
 * AI-Powered Code Completion Integration for CodeMirror
 * 
 * This module provides the integration between our ML model and CodeMirror's
 * completion system, offering intelligent code suggestions based on context.
 */

interface CompletionOptions {
  maxResults?: number;
  minCharacters?: number;
  triggerCharacters?: string[];
  debounceMs?: number;
}

const defaultOptions: CompletionOptions = {
  maxResults: 5,
  minCharacters: 2,
  triggerCharacters: ['.', '(', '{', '[', '"', "'", '`'],
  debounceMs: 150
};

export class AICompletionSource {
  private options: CompletionOptions;
  private lastCompletionTime: number = 0;

  constructor(options: Partial<CompletionOptions> = {}) {
    this.options = { ...defaultOptions, ...options };
  }

  /**
   * Main completion function for CodeMirror
   */
  async getCompletions(context: CompletionContext): Promise<CompletionResult | null> {
    // Check if enough time has passed since last completion
    const now = Date.now();
    if (now - this.lastCompletionTime < this.options.debounceMs!) {
      return null;
    }
    this.lastCompletionTime = now;

    // Get current word and context
    const { state, pos, explicit } = context;
    const wordContext = this.getWordContext(state, pos);

    // Check if we should trigger completion
    if (!this.shouldTriggerCompletion(wordContext, explicit)) {
      return null;
    }

    try {
      // Get file context
      const fileContext = this.getFileContext(state);

      // Get completions from transformer
      const completions = await this.getAICompletions(wordContext, fileContext);

      return {
        from: wordContext.from,
        to: wordContext.to,
        options: completions,
        filter: false // We handle filtering in the ML model
      };
    } catch (error) {
      console.error('Error getting AI completions:', error);
      return null;
    }
  }

  /**
   * Get the current word and its context
   */
  private getWordContext(state: EditorState, pos: number) {
    const line = state.doc.lineAt(pos);
    const lineText = line.text;
    const wordBefore = lineText.slice(0, pos - line.from);

    // Find word boundaries
    const wordRegex = /[\w$]+$/;
    const match = wordBefore.match(wordRegex);
    const from = match ? pos - match[0].length : pos;
    const to = pos;

    return {
      word: match ? match[0] : '',
      from,
      to,
      line: line.number,
      lineText,
      prefix: lineText.slice(0, from - line.from),
      suffix: lineText.slice(to - line.from)
    };
  }

  /**
   * Get the broader file context
   */
  private getFileContext(state: EditorState) {
    const doc = state.doc;
    const tree = syntaxTree(state);
    
    // Get imports and dependencies
    const imports: string[] = [];
    tree.iterate({
      enter: (node) => {
        if (node.type.name.includes('import')) {
          imports.push(doc.sliceString(node.from, node.to));
        }
      }
    });

    return {
      content: doc.toString(),
      imports,
      language: tree.type.name,
      // Add more context as needed
    };
  }

  /**
   * Determine if we should trigger completion
   */
  private shouldTriggerCompletion(
    context: ReturnType<typeof this.getWordContext>,
    explicit: boolean
  ): boolean {
    if (explicit) return true;

    const { word } = context;
    if (word.length < this.options.minCharacters!) return false;

    const lastChar = context.prefix.slice(-1);
    if (this.options.triggerCharacters!.includes(lastChar)) return true;

    return word.length >= this.options.minCharacters!;
  }

  /**
   * Get completions from the AI model
   */
  private async getAICompletions(
    wordContext: ReturnType<typeof this.getWordContext>,
    fileContext: ReturnType<typeof this.getFileContext>
  ): Promise<Completion[]> {
    // Process context with transformer
    const processed = await codeTransformer.processCode({
      code: fileContext.content,
      language: fileContext.language,
      imports: fileContext.imports
    });

    // Convert embeddings to completions
    // This is a mock implementation for now
    return [
      {
        label: `${wordContext.word}_completion1`,
        type: 'function',
        boost: 1
      },
      {
        label: `${wordContext.word}_completion2`,
        type: 'variable',
        boost: 0.8
      }
    ];
  }
}

// Export singleton instance
export const aiCompletionSource = new AICompletionSource();
