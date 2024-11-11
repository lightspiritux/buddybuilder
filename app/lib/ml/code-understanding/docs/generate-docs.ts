/**
 * Documentation Generation Script
 * 
 * Generates comprehensive documentation for the codebase:
 * 1. API documentation
 * 2. Architecture diagrams
 * 3. Usage guides
 * 4. Examples
 */

import { createDocGenerator, type DocConfig } from './doc-generator';
import * as path from 'path';
import * as ts from 'typescript';

const ROOT_DIR = path.resolve(__dirname, '../../../..');
const OUT_DIR = path.join(ROOT_DIR, 'docs');

export const config: DocConfig = {
  rootDir: ROOT_DIR,
  outDir: OUT_DIR,
  include: [
    // Core ML components
    'app/lib/ml/code-understanding/**/*.ts',
    'app/lib/ml/code-completion/**/*.ts',
    
    // Analysis components
    'app/lib/ml/code-understanding/analysis/**/*.ts',
    'app/lib/ml/code-understanding/learning/**/*.ts',
    
    // Performance components
    'app/lib/ml/code-understanding/performance/**/*.ts',
    'app/lib/ml/code-understanding/telemetry/**/*.ts',
    
    // Error handling
    'app/lib/ml/code-understanding/error/**/*.ts',
    
    // Models and tokenizers
    'app/lib/ml/code-understanding/model/**/*.ts',
    'app/lib/ml/code-understanding/tokenizer/**/*.ts',
    'app/lib/ml/code-understanding/prediction/**/*.ts',
    
    // UI components
    'app/components/feedback/**/*.tsx',
    'app/components/editor/**/*.tsx'
  ],
  exclude: [
    // Exclude test files and type definitions
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/*.d.ts',
    '**/__tests__/**'
  ],
  examples: true,
  markdown: true,
  typescript: true
};

/**
 * Generate documentation for the codebase
 */
export async function generateDocs(): Promise<void> {
  console.log('Generating documentation...');
  console.log(`Root directory: ${ROOT_DIR}`);
  console.log(`Output directory: ${OUT_DIR}`);

  try {
    const docGenerator = createDocGenerator(config);
    const docs = await docGenerator.generate();

    console.log('\nDocumentation generated successfully!');
    console.log(`Generated documentation for ${docs.size} files:`);

    // Log statistics about generated documentation
    let totalExports = 0;
    let totalExamples = 0;

    docs.forEach((docFile, fileName) => {
      const relativePath = path.relative(ROOT_DIR, fileName);
      totalExports += docFile.exports.length;
      totalExamples += docFile.examples?.length || 0;

      console.log(`\n${relativePath}:`);
      console.log(`  - ${docFile.exports.length} exports`);
      if (docFile.examples?.length) {
        console.log(`  - ${docFile.examples.length} examples`);
      }

      // Log exported items by category
      const categories = docFile.exports.reduce((acc, exp) => {
        const category = getCategory(exp.kind);
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      Object.entries(categories).forEach(([category, count]) => {
        console.log(`  - ${count} ${category}${count > 1 ? 's' : ''}`);
      });
    });

    console.log('\nSummary:');
    console.log(`Total files: ${docs.size}`);
    console.log(`Total exports: ${totalExports}`);
    console.log(`Total examples: ${totalExamples}`);

    // Generate index files
    await generateIndexFiles(docs);

  } catch (error) {
    console.error('Error generating documentation:', error);
    process.exit(1);
  }
}

/**
 * Get category name for a TypeScript syntax kind
 */
export function getCategory(kind: number): string {
  switch (kind) {
    case ts.SyntaxKind.ClassDeclaration:
      return 'class';
    case ts.SyntaxKind.InterfaceDeclaration:
      return 'interface';
    case ts.SyntaxKind.EnumDeclaration:
      return 'enum';
    case ts.SyntaxKind.FunctionDeclaration:
      return 'function';
    case ts.SyntaxKind.TypeAliasDeclaration:
      return 'type';
    default:
      return 'other';
  }
}

/**
 * Generate index files for documentation
 */
export async function generateIndexFiles(docs: Map<string, any>): Promise<void> {
  const categories = new Map<string, Set<string>>();

  // Collect files by category
  docs.forEach((docFile, fileName) => {
    const relativePath = path.relative(ROOT_DIR, fileName);
    const category = getCategoryFromPath(relativePath);
    
    if (!categories.has(category)) {
      categories.set(category, new Set());
    }
    categories.get(category)!.add(relativePath);
  });

  // Generate category index files
  for (const [category, files] of categories) {
    let content = `# ${category}\n\n`;
    
    for (const file of files) {
      const docFile = docs.get(path.join(ROOT_DIR, file));
      if (!docFile) continue;

      content += `## [${path.basename(file)}](${file})\n\n`;
      if (docFile.description) {
        content += `${docFile.description}\n\n`;
      }

      if (docFile.exports.length) {
        content += '### Exports\n\n';
        docFile.exports.forEach((exp: any) => {
          content += `- \`${exp.name}\`: ${exp.description || ''}\n`;
        });
        content += '\n';
      }
    }

    await ts.sys.writeFile(
      path.join(OUT_DIR, 'markdown', `${category}.md`),
      content
    );
  }

  // Generate main index
  let mainIndex = '# API Documentation\n\n';
  mainIndex += 'Welcome to the BuddyBuilder API documentation.\n\n';
  mainIndex += '## Categories\n\n';

  for (const category of categories.keys()) {
    mainIndex += `- [${category}](${category}.md)\n`;
  }

  await ts.sys.writeFile(
    path.join(OUT_DIR, 'markdown', 'index.md'),
    mainIndex
  );
}

/**
 * Get category from file path
 */
export function getCategoryFromPath(filePath: string): string {
  if (filePath.includes('code-understanding')) {
    if (filePath.includes('analysis')) return 'Analysis';
    if (filePath.includes('learning')) return 'Learning';
    if (filePath.includes('performance')) return 'Performance';
    if (filePath.includes('telemetry')) return 'Telemetry';
    if (filePath.includes('error')) return 'Error Handling';
    if (filePath.includes('model')) return 'Models';
    if (filePath.includes('tokenizer')) return 'Tokenization';
    if (filePath.includes('prediction')) return 'Prediction';
    return 'Code Understanding';
  }
  if (filePath.includes('code-completion')) return 'Code Completion';
  if (filePath.includes('components')) {
    if (filePath.includes('feedback')) return 'Feedback UI';
    if (filePath.includes('editor')) return 'Editor UI';
    return 'Components';
  }
  return 'Other';
}

// Run documentation generation if this is the main module
if (require.main === module) {
  generateDocs().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
