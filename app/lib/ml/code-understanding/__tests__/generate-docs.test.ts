import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as ts from 'typescript';

// Mock the doc-generator module
vi.mock('../docs/doc-generator', () => ({
  createDocGenerator: vi.fn().mockReturnValue({
    generate: vi.fn().mockResolvedValue(new Map([
      ['app/lib/ml/code-understanding/model/layers.ts', {
        path: 'app/lib/ml/code-understanding/model/layers.ts',
        name: 'layers.ts',
        description: 'Neural network layers implementation',
        exports: [
          {
            name: 'Layer',
            kind: ts.SyntaxKind.ClassDeclaration,
            description: 'Base layer class'
          },
          {
            name: 'Dense',
            kind: ts.SyntaxKind.ClassDeclaration,
            description: 'Dense layer implementation'
          }
        ],
        examples: ['const layer = new Dense(64);']
      }],
      ['app/lib/ml/code-understanding/model/tf-model.ts', {
        path: 'app/lib/ml/code-understanding/model/tf-model.ts',
        name: 'tf-model.ts',
        description: 'TensorFlow.js model implementation',
        exports: [
          {
            name: 'TFModel',
            kind: ts.SyntaxKind.ClassDeclaration,
            description: 'TensorFlow model wrapper'
          }
        ]
      }]
    ]))
  })
}));

describe('Documentation Generation Script', () => {
  const mockWriteFile = vi.spyOn(ts.sys, 'writeFile').mockImplementation(() => {});
  const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    vi.resetModules();
    mockWriteFile.mockClear();
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Documentation Generation', () => {
    it('should generate documentation successfully', async () => {
      const { generateDocs } = await import('../docs/generate-docs');
      await generateDocs();

      // Verify console output
      expect(mockConsoleLog).toHaveBeenCalledWith('Generating documentation...');
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Documentation generated successfully'));
      expect(mockConsoleError).not.toHaveBeenCalled();

      // Verify files were written
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('index.md'),
        expect.stringContaining('# API Documentation')
      );

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('Models.md'),
        expect.stringContaining('# Models')
      );
    });

    it('should generate correct statistics', async () => {
      const { generateDocs } = await import('../docs/generate-docs');
      await generateDocs();

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Total files: 2'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Total exports: 3'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Total examples: 1'));
    });

    it('should categorize files correctly', async () => {
      const { generateDocs } = await import('../docs/generate-docs');
      await generateDocs();

      const modelsCategoryCall = mockWriteFile.mock.calls.find(call =>
        call[0].endsWith('Models.md')
      );

      expect(modelsCategoryCall).toBeDefined();
      expect(modelsCategoryCall![1]).toContain('layers.ts');
      expect(modelsCategoryCall![1]).toContain('tf-model.ts');
    });

    it('should handle errors gracefully', async () => {
      const mockError = new Error('Generation failed');
      vi.mock('../docs/doc-generator', () => ({
        createDocGenerator: vi.fn().mockReturnValue({
          generate: vi.fn().mockRejectedValue(mockError)
        })
      }));

      const { generateDocs } = await import('../docs/generate-docs');
      
      try {
        await generateDocs();
      } catch (error) {
        expect(error).toBe(mockError);
      }

      expect(mockConsoleError).toHaveBeenCalledWith(
        'Error generating documentation:',
        mockError
      );
    });
  });

  describe('Category Generation', () => {
    it('should generate category index files', async () => {
      const { generateDocs } = await import('../docs/generate-docs');
      await generateDocs();

      // Check main index
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('index.md'),
        expect.stringMatching(/# API Documentation.*## Categories/s)
      );

      // Check category index
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('Models.md'),
        expect.stringMatching(/# Models.*## \[layers\.ts\]/s)
      );
    });

    it('should include exports in category files', async () => {
      const { generateDocs } = await import('../docs/generate-docs');
      await generateDocs();

      const modelsCategoryCall = mockWriteFile.mock.calls.find(call =>
        call[0].endsWith('Models.md')
      );

      expect(modelsCategoryCall![1]).toContain('Layer: Base layer class');
      expect(modelsCategoryCall![1]).toContain('Dense: Dense layer implementation');
      expect(modelsCategoryCall![1]).toContain('TFModel: TensorFlow model wrapper');
    });

    it('should include examples in documentation', async () => {
      const { generateDocs } = await import('../docs/generate-docs');
      await generateDocs();

      const modelsCategoryCall = mockWriteFile.mock.calls.find(call =>
        call[0].endsWith('Models.md')
      );

      expect(modelsCategoryCall![1]).toContain('const layer = new Dense(64);');
    });
  });

  describe('Path Handling', () => {
    it('should categorize files based on path correctly', async () => {
      const { getCategoryFromPath } = await import('../docs/generate-docs');

      expect(getCategoryFromPath('app/lib/ml/code-understanding/model/layers.ts'))
        .toBe('Models');
      expect(getCategoryFromPath('app/lib/ml/code-understanding/analysis/dependency-analyzer.ts'))
        .toBe('Analysis');
      expect(getCategoryFromPath('app/components/feedback/CompletionFeedback.tsx'))
        .toBe('Feedback UI');
    });

    it('should handle unknown paths gracefully', async () => {
      const { getCategoryFromPath } = await import('../docs/generate-docs');

      expect(getCategoryFromPath('app/unknown/path/file.ts')).toBe('Other');
    });
  });

  describe('Configuration', () => {
    it('should use correct include patterns', async () => {
      const { config } = await import('../docs/generate-docs');

      expect(config.include).toContain('app/lib/ml/code-understanding/**/*.ts');
      expect(config.include).toContain('app/components/feedback/**/*.tsx');
      expect(config.include).toContain('app/components/editor/**/*.tsx');
    });

    it('should exclude test files', async () => {
      const { config } = await import('../docs/generate-docs');

      expect(config.exclude).toContain('**/*.test.ts');
      expect(config.exclude).toContain('**/*.test.tsx');
      expect(config.exclude).toContain('**/__tests__/**');
    });

    it('should enable markdown and typescript output', async () => {
      const { config } = await import('../docs/generate-docs');

      expect(config.markdown).toBe(true);
      expect(config.typescript).toBe(true);
    });
  });
});
