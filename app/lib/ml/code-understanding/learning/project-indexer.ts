import { contextAnalyzer, type FileContext } from '../analysis/context-analyzer';

/**
 * Project Indexer
 * 
 * Manages project-specific learning through:
 * 1. File indexing and pattern storage
 * 2. Incremental updates
 * 3. Persistent storage of learned patterns
 */

interface FileIndex {
  path: string;
  hash: string;
  lastModified: number;
  patterns: CodePattern[];
  context: {
    imports: string[];
    exports: string[];
    dependencies: string[];
  };
}

export interface CodePattern {
  type: 'import' | 'function' | 'class' | 'variable' | 'style' | 'structure';
  pattern: string;
  context: string;
  frequency: number;
  lastSeen: number;
  score: number;
  examples: PatternExample[];
}

export interface PatternExample {
  path: string;
  lineStart: number;
  lineEnd: number;
  code: string;
  context: string;
}

interface IndexStats {
  totalFiles: number;
  totalPatterns: number;
  lastUpdate: number;
  coverage: number;
}

export class ProjectIndexer {
  private fileIndices: Map<string, FileIndex>;
  private patterns: Map<string, CodePattern>;
  private stats: IndexStats;
  private indexVersion: number;

  constructor() {
    this.fileIndices = new Map();
    this.patterns = new Map();
    this.indexVersion = 1;
    this.stats = {
      totalFiles: 0,
      totalPatterns: 0,
      lastUpdate: Date.now(),
      coverage: 0
    };
  }

  /**
   * Index a file and extract patterns
   */
  async indexFile(path: string, content: string): Promise<FileIndex> {
    const hash = this.computeHash(content);
    const existingIndex = this.fileIndices.get(path);

    // Check if file needs reindexing
    if (existingIndex && existingIndex.hash === hash) {
      return existingIndex;
    }

    try {
      // Analyze file context
      const fileContext = await contextAnalyzer.analyzeFile(path, content);
      
      // Extract patterns
      const patterns = await this.extractPatterns(content, fileContext);

      // Create file index
      const fileIndex: FileIndex = {
        path,
        hash,
        lastModified: Date.now(),
        patterns,
        context: {
          imports: fileContext.imports.map(imp => imp.path),
          exports: fileContext.exports.map(exp => exp.name),
          dependencies: fileContext.dependencies
        }
      };

      // Update indices
      this.fileIndices.set(path, fileIndex);
      this.updatePatternStats(patterns);
      this.updateIndexStats();

      return fileIndex;
    } catch (error) {
      console.error(`Error indexing file ${path}:`, error);
      throw error;
    }
  }

  /**
   * Extract code patterns from file
   */
  private async extractPatterns(content: string, context: FileContext): Promise<CodePattern[]> {
    const patterns: CodePattern[] = [];

    // Extract import patterns
    context.imports.forEach(imp => {
      patterns.push({
        type: 'import',
        pattern: `import { ${imp.symbols.join(', ')} } from '${imp.path}'`,
        context: 'module-level',
        frequency: 1,
        lastSeen: Date.now(),
        score: 0,
        examples: [{
          path: context.path,
          lineStart: 0, // TODO: Get actual line numbers
          lineEnd: 0,
          code: `import { ${imp.symbols.join(', ')} } from '${imp.path}'`,
          context: 'module-level'
        }]
      });
    });

    // Extract function patterns
    const functionPattern = /function\s+(\w+)\s*\(([\s\S]*?)\)\s*{/g;
    let match;
    while ((match = functionPattern.exec(content)) !== null) {
      patterns.push({
        type: 'function',
        pattern: `function ${match[1]}(${match[2]})`,
        context: this.getPatternContext(content, match.index),
        frequency: 1,
        lastSeen: Date.now(),
        score: 0,
        examples: [{
          path: context.path,
          lineStart: this.getLineNumber(content, match.index),
          lineEnd: this.getLineNumber(content, match.index + match[0].length),
          code: match[0],
          context: this.getPatternContext(content, match.index)
        }]
      });
    }

    // Extract class patterns
    const classPattern = /class\s+(\w+)(?:\s+extends\s+(\w+))?\s*{/g;
    while ((match = classPattern.exec(content)) !== null) {
      patterns.push({
        type: 'class',
        pattern: match[2] ? `class ${match[1]} extends ${match[2]}` : `class ${match[1]}`,
        context: this.getPatternContext(content, match.index),
        frequency: 1,
        lastSeen: Date.now(),
        score: 0,
        examples: [{
          path: context.path,
          lineStart: this.getLineNumber(content, match.index),
          lineEnd: this.getLineNumber(content, match.index + match[0].length),
          code: match[0],
          context: this.getPatternContext(content, match.index)
        }]
      });
    }

    return patterns;
  }

  /**
   * Get pattern context from surrounding code
   */
  private getPatternContext(content: string, index: number): string {
    const contextStart = Math.max(0, index - 100);
    const contextEnd = Math.min(content.length, index + 100);
    return content.slice(contextStart, contextEnd);
  }

  /**
   * Get line number for position in content
   */
  private getLineNumber(content: string, index: number): number {
    return content.slice(0, index).split('\n').length;
  }

  /**
   * Update pattern statistics
   */
  private updatePatternStats(newPatterns: CodePattern[]) {
    newPatterns.forEach(pattern => {
      const existing = this.patterns.get(pattern.pattern);
      if (existing) {
        existing.frequency++;
        existing.lastSeen = Date.now();
        existing.examples.push(...pattern.examples);
        existing.score = this.calculatePatternScore(existing);
      } else {
        pattern.score = this.calculatePatternScore(pattern);
        this.patterns.set(pattern.pattern, pattern);
      }
    });
  }

  /**
   * Calculate pattern score based on frequency and recency
   */
  private calculatePatternScore(pattern: CodePattern): number {
    const recency = Math.exp(-(Date.now() - pattern.lastSeen) / (1000 * 60 * 60 * 24)); // Decay over days
    return pattern.frequency * recency;
  }

  /**
   * Update index statistics
   */
  private updateIndexStats() {
    this.stats = {
      totalFiles: this.fileIndices.size,
      totalPatterns: this.patterns.size,
      lastUpdate: Date.now(),
      coverage: this.calculateCoverage()
    };
  }

  /**
   * Calculate index coverage
   */
  private calculateCoverage(): number {
    const totalFiles = this.fileIndices.size;
    if (totalFiles === 0) return 0;

    const filesWithPatterns = Array.from(this.fileIndices.values())
      .filter(index => index.patterns.length > 0).length;

    return filesWithPatterns / totalFiles;
  }

  /**
   * Compute content hash
   */
  private computeHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Get index statistics
   */
  getStats(): IndexStats {
    return { ...this.stats };
  }

  /**
   * Get patterns for a file
   */
  getFilePatterns(path: string): CodePattern[] {
    const index = this.fileIndices.get(path);
    return index?.patterns || [];
  }

  /**
   * Get all patterns sorted by score
   */
  getAllPatterns(): CodePattern[] {
    return Array.from(this.patterns.values())
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Clear index
   */
  clearIndex(): void {
    this.fileIndices.clear();
    this.patterns.clear();
    this.updateIndexStats();
  }
}

// Export singleton instance
export const projectIndexer = new ProjectIndexer();
