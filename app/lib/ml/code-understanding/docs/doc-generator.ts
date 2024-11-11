/**
 * Documentation Generator
 * 
 * Provides automatic API documentation generation:
 * 1. TypeScript type extraction
 * 2. JSDoc parsing
 * 3. Markdown generation
 * 4. Code examples
 * 5. API reference
 */

import * as ts from 'typescript';
import * as path from 'path';

export interface DocNode {
  name: string;
  kind: ts.SyntaxKind;
  description?: string;
  params?: DocParam[];
  returns?: string;
  type?: string;
  modifiers?: string[];
  members?: DocNode[];
  examples?: string[];
  deprecated?: boolean;
  since?: string;
  see?: string[];
  value?: string | number; // For enum members
}

export interface DocParam {
  name: string;
  type: string;
  description?: string;
  optional?: boolean;
  defaultValue?: string;
}

export interface DocFile {
  path: string;
  name: string;
  description?: string;
  exports: DocNode[];
  imports: string[];
  examples?: string[];
}

export interface DocConfig {
  rootDir: string;
  outDir: string;
  include: string[];
  exclude?: string[];
  examples?: boolean;
  markdown?: boolean;
  typescript?: boolean;
}

export class DocGenerator {
  private program: ts.Program;
  private checker: ts.TypeChecker;
  private files: Map<string, DocFile>;
  private config: DocConfig;

  constructor(config: DocConfig) {
    this.config = config;
    this.files = new Map();
    this.program = this.createProgram();
    this.checker = this.program.getTypeChecker();
  }

  /**
   * Generate documentation
   */
  async generate(): Promise<Map<string, DocFile>> {
    const sourceFiles = this.program.getSourceFiles()
      .filter(file => this.shouldIncludeFile(file.fileName));

    for (const sourceFile of sourceFiles) {
      const docFile = await this.processSourceFile(sourceFile);
      this.files.set(sourceFile.fileName, docFile);
    }

    if (this.config.markdown) {
      await this.generateMarkdown();
    }

    if (this.config.typescript) {
      await this.generateTypeScript();
    }

    return this.files;
  }

  private createProgram(): ts.Program {
    const configPath = ts.findConfigFile(
      this.config.rootDir,
      ts.sys.fileExists,
      'tsconfig.json'
    );

    if (!configPath) {
      throw new Error('Could not find tsconfig.json');
    }

    const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
    const { options, fileNames } = ts.parseJsonConfigFileContent(
      config,
      ts.sys,
      path.dirname(configPath)
    );

    return ts.createProgram(fileNames, options);
  }

  private shouldIncludeFile(fileName: string): boolean {
    const relativePath = path.relative(this.config.rootDir, fileName);

    // Check include patterns
    const included = this.config.include.some(pattern =>
      this.matchPattern(relativePath, pattern)
    );

    // Check exclude patterns
    const excluded = this.config.exclude?.some(pattern =>
      this.matchPattern(relativePath, pattern)
    );

    return included && !excluded;
  }

  private matchPattern(filePath: string, pattern: string): boolean {
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${regexPattern}$`).test(filePath);
  }

  private async processSourceFile(sourceFile: ts.SourceFile): Promise<DocFile> {
    const docFile: DocFile = {
      path: sourceFile.fileName,
      name: path.basename(sourceFile.fileName),
      exports: [],
      imports: []
    };

    // Get file description from JSDoc
    const fileDoc = this.getFileDoc(sourceFile);
    if (fileDoc) {
      docFile.description = fileDoc.description;
      docFile.examples = fileDoc.examples;
    }

    // Process imports
    ts.forEachChild(sourceFile, node => {
      if (ts.isImportDeclaration(node)) {
        docFile.imports.push(this.processImport(node));
      }
    });

    // Process exports
    ts.forEachChild(sourceFile, node => {
      if (this.isExported(node)) {
        const docNode = this.processNode(node);
        if (docNode) {
          docFile.exports.push(docNode);
        }
      }
    });

    return docFile;
  }

  private getFileDoc(sourceFile: ts.SourceFile): { description?: string; examples?: string[] } {
    const fileDoc = sourceFile.getFullText().match(/\/\*\*([\s\S]*?)\*\//);
    if (!fileDoc) return {};

    const jsdoc = fileDoc[1];
    const description = jsdoc.match(/@description\s+([\s\S]*?)(?=@|$)/)?.[1]?.trim();
    const examples = jsdoc.match(/@example\s+([\s\S]*?)(?=@|$)/g)?.map(
      example => example.replace(/@example\s+/, '').trim()
    );

    return { description, examples };
  }

  private processImport(node: ts.ImportDeclaration): string {
    const moduleSpecifier = node.moduleSpecifier.getText().replace(/['"]/g, '');
    const importClause = node.importClause?.getText() || '*';
    return `${importClause} from ${moduleSpecifier}`;
  }

  private isExported(node: ts.Node): boolean {
    return (
      (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) !== 0 ||
      (!!node.parent && node.parent.kind === ts.SyntaxKind.SourceFile)
    );
  }

  private processNode(node: ts.Node): DocNode | undefined {
    if (ts.isClassDeclaration(node)) {
      return this.processClass(node);
    } else if (ts.isInterfaceDeclaration(node)) {
      return this.processInterface(node);
    } else if (ts.isEnumDeclaration(node)) {
      return this.processEnum(node);
    } else if (ts.isFunctionDeclaration(node)) {
      return this.processFunction(node);
    } else if (ts.isTypeAliasDeclaration(node)) {
      return this.processTypeAlias(node);
    }
  }

  private processClass(node: ts.ClassDeclaration): DocNode {
    const symbol = this.checker.getSymbolAtLocation(node.name!);
    const type = this.checker.getTypeAtLocation(node);
    const docs = this.getJSDocInfo(symbol);

    return {
      name: node.name?.getText() || 'Anonymous',
      kind: node.kind,
      description: docs.description,
      members: this.processClassMembers(node),
      modifiers: node.modifiers?.map(m => m.getText()),
      examples: docs.examples,
      deprecated: docs.deprecated,
      since: docs.since,
      see: docs.see
    };
  }

  private processInterface(node: ts.InterfaceDeclaration): DocNode {
    const symbol = this.checker.getSymbolAtLocation(node.name);
    const docs = this.getJSDocInfo(symbol);

    return {
      name: node.name.getText(),
      kind: node.kind,
      description: docs.description,
      members: node.members.map(member => this.processInterfaceMember(member)),
      examples: docs.examples,
      deprecated: docs.deprecated,
      since: docs.since,
      see: docs.see
    };
  }

  private processEnum(node: ts.EnumDeclaration): DocNode {
    const symbol = this.checker.getSymbolAtLocation(node.name);
    const docs = this.getJSDocInfo(symbol);

    return {
      name: node.name.getText(),
      kind: node.kind,
      description: docs.description,
      members: node.members.map(member => ({
        name: member.name.getText(),
        kind: member.kind,
        type: 'number',
        value: member.initializer?.getText()
      })),
      examples: docs.examples,
      deprecated: docs.deprecated,
      since: docs.since,
      see: docs.see
    };
  }

  private processFunction(node: ts.FunctionDeclaration): DocNode {
    const symbol = this.checker.getSymbolAtLocation(node.name!);
    const signature = this.checker.getSignatureFromDeclaration(node);
    const docs = this.getJSDocInfo(symbol);

    return {
      name: node.name?.getText() || 'Anonymous',
      kind: node.kind,
      description: docs.description,
      params: this.processParameters(node.parameters),
      returns: this.getReturnType(signature!),
      examples: docs.examples,
      deprecated: docs.deprecated,
      since: docs.since,
      see: docs.see
    };
  }

  private processTypeAlias(node: ts.TypeAliasDeclaration): DocNode {
    const symbol = this.checker.getSymbolAtLocation(node.name);
    const docs = this.getJSDocInfo(symbol);

    return {
      name: node.name.getText(),
      kind: node.kind,
      description: docs.description,
      type: node.type.getText(),
      examples: docs.examples,
      deprecated: docs.deprecated,
      since: docs.since,
      see: docs.see
    };
  }

  private processClassMembers(node: ts.ClassDeclaration): DocNode[] {
    const members: DocNode[] = [];

    node.members.forEach(member => {
      if (ts.isMethodDeclaration(member)) {
        members.push(this.processMethod(member));
      } else if (ts.isPropertyDeclaration(member)) {
        members.push(this.processProperty(member));
      }
    });

    return members;
  }

  private processMethod(node: ts.MethodDeclaration): DocNode {
    const symbol = this.checker.getSymbolAtLocation(node.name);
    const signature = this.checker.getSignatureFromDeclaration(node);
    const docs = this.getJSDocInfo(symbol);

    return {
      name: node.name.getText(),
      kind: node.kind,
      description: docs.description,
      params: this.processParameters(node.parameters),
      returns: this.getReturnType(signature!),
      modifiers: node.modifiers?.map(m => m.getText()),
      examples: docs.examples,
      deprecated: docs.deprecated,
      since: docs.since,
      see: docs.see
    };
  }

  private processProperty(node: ts.PropertyDeclaration): DocNode {
    const symbol = this.checker.getSymbolAtLocation(node.name);
    const docs = this.getJSDocInfo(symbol);

    return {
      name: node.name.getText(),
      kind: node.kind,
      description: docs.description,
      type: node.type?.getText(),
      modifiers: node.modifiers?.map(m => m.getText()),
      examples: docs.examples,
      deprecated: docs.deprecated,
      since: docs.since,
      see: docs.see
    };
  }

  private processInterfaceMember(member: ts.TypeElement): DocNode {
    if (!member.name) {
      return {
        name: 'anonymous',
        kind: member.kind,
        type: 'unknown'
      };
    }

    const symbol = this.checker.getSymbolAtLocation(member.name);
    const docs = this.getJSDocInfo(symbol);
    const type = ts.isPropertySignature(member) || ts.isMethodSignature(member)
      ? member.type?.getText()
      : undefined;

    if (ts.isMethodSignature(member)) {
      return {
        name: member.name.getText(),
        kind: member.kind,
        description: docs.description,
        params: this.processParameters(member.parameters),
        returns: type,
        examples: docs.examples,
        deprecated: docs.deprecated,
        since: docs.since,
        see: docs.see
      };
    } else {
      return {
        name: member.name.getText(),
        kind: member.kind,
        description: docs.description,
        type,
        examples: docs.examples,
        deprecated: docs.deprecated,
        since: docs.since,
        see: docs.see
      };
    }
  }

  private processParameters(params: ts.NodeArray<ts.ParameterDeclaration>): DocParam[] {
    return params.map(param => ({
      name: param.name.getText(),
      type: param.type?.getText() || 'any',
      description: this.getParamDescription(param),
      optional: param.questionToken !== undefined,
      defaultValue: param.initializer?.getText()
    }));
  }

  private getParamDescription(param: ts.ParameterDeclaration): string | undefined {
    const symbol = this.checker.getSymbolAtLocation(param.name);
    if (!symbol) return undefined;

    const jsDoc = symbol.getDocumentationComment(this.checker);
    return jsDoc.map(doc => doc.text).join('\n');
  }

  private getReturnType(signature: ts.Signature): string {
    return this.checker.typeToString(
      this.checker.getReturnTypeOfSignature(signature)
    );
  }

  private getJSDocInfo(symbol?: ts.Symbol): {
    description?: string;
    examples?: string[];
    deprecated?: boolean;
    since?: string;
    see?: string[];
  } {
    if (!symbol) return {};

    const jsDoc = symbol.getJsDocTags();
    const description = symbol.getDocumentationComment(this.checker)
      .map(doc => doc.text)
      .join('\n');

    const examples = jsDoc
      .filter(tag => tag.name === 'example')
      .map(tag => tag.text?.[0].text || '');

    const deprecated = jsDoc.some(tag => tag.name === 'deprecated');
    const since = jsDoc.find(tag => tag.name === 'since')?.text?.[0].text;
    const see = jsDoc
      .filter(tag => tag.name === 'see')
      .map(tag => tag.text?.[0].text || '');

    return {
      description,
      examples: examples.length > 0 ? examples : undefined,
      deprecated,
      since,
      see: see.length > 0 ? see : undefined
    };
  }

  private async generateMarkdown(): Promise<void> {
    // Generate markdown documentation
    for (const [fileName, docFile] of this.files) {
      const markdown = await this.generateMarkdownForFile(docFile);
      const outPath = path.join(
        this.config.outDir,
        'markdown',
        path.basename(fileName, '.ts') + '.md'
      );
      await this.writeFile(outPath, markdown);
    }
  }

  private async generateTypeScript(): Promise<void> {
    // Generate TypeScript declaration files
    for (const [fileName, docFile] of this.files) {
      const declarations = await this.generateDeclarationsForFile(docFile);
      const outPath = path.join(
        this.config.outDir,
        'types',
        path.basename(fileName, '.ts') + '.d.ts'
      );
      await this.writeFile(outPath, declarations);
    }
  }

  private async generateMarkdownForFile(docFile: DocFile): Promise<string> {
    let markdown = `# ${docFile.name}\n\n`;

    if (docFile.description) {
      markdown += `${docFile.description}\n\n`;
    }

    if (docFile.examples?.length) {
      markdown += '## Examples\n\n';
      docFile.examples.forEach(example => {
        markdown += '```typescript\n' + example + '\n```\n\n';
      });
    }

    if (docFile.exports.length) {
      markdown += '## Exports\n\n';
      docFile.exports.forEach(exp => {
        markdown += this.generateMarkdownForNode(exp);
      });
    }

    return markdown;
  }

  private generateMarkdownForNode(node: DocNode, level: number = 2): string {
    let markdown = `${'#'.repeat(level)} ${node.name}\n\n`;

    if (node.description) {
      markdown += `${node.description}\n\n`;
    }

    if (node.deprecated) {
      markdown += '> **Deprecated**\n\n';
    }

    if (node.params?.length) {
      markdown += '### Parameters\n\n';
      node.params.forEach(param => {
        markdown += `- \`${param.name}${param.optional ? '?' : ''}: ${param.type}\``;
        if (param.description) {
          markdown += ` - ${param.description}`;
        }
        if (param.defaultValue) {
          markdown += ` (default: ${param.defaultValue})`;
        }
        markdown += '\n';
      });
      markdown += '\n';
    }

    if (node.returns) {
      markdown += `### Returns\n\n\`${node.returns}\`\n\n`;
    }

    if (node.examples?.length) {
      markdown += '### Examples\n\n';
      node.examples.forEach(example => {
        markdown += '```typescript\n' + example + '\n```\n\n';
      });
    }

    if (node.members?.length) {
      markdown += '### Members\n\n';
      node.members.forEach(member => {
        markdown += this.generateMarkdownForNode(member, level + 1);
      });
    }

    if (node.see?.length) {
      markdown += '### See Also\n\n';
      node.see.forEach(ref => {
        markdown += `- ${ref}\n`;
      });
      markdown += '\n';
    }

    return markdown;
  }

  private async generateDeclarationsForFile(docFile: DocFile): Promise<string> {
    let declarations = '';

    // Add imports
    docFile.imports.forEach(imp => {
      declarations += `import ${imp};\n`;
    });
    declarations += '\n';

    // Add exports
    docFile.exports.forEach(exp => {
      declarations += this.generateDeclarationForNode(exp);
      declarations += '\n\n';
    });

    return declarations;
  }

  private generateDeclarationForNode(node: DocNode): string {
    let declaration = '';

    // Add JSDoc
    declaration += this.generateJSDoc(node);

    // Add declaration
    switch (node.kind) {
      case ts.SyntaxKind.ClassDeclaration:
        declaration += this.generateClassDeclaration(node);
        break;
      case ts.SyntaxKind.InterfaceDeclaration:
        declaration += this.generateInterfaceDeclaration(node);
        break;
      case ts.SyntaxKind.EnumDeclaration:
        declaration += this.generateEnumDeclaration(node);
        break;
      case ts.SyntaxKind.FunctionDeclaration:
        declaration += this.generateFunctionDeclaration(node);
        break;
      case ts.SyntaxKind.TypeAliasDeclaration:
        declaration += this.generateTypeAliasDeclaration(node);
        break;
    }

    return declaration;
  }

  private generateJSDoc(node: DocNode): string {
    let jsdoc = '/**\n';

    if (node.description) {
      jsdoc += ` * ${node.description}\n *\n`;
    }

    if (node.params?.length) {
      node.params.forEach(param => {
        jsdoc += ` * @param ${param.name}`;
        if (param.description) {
          jsdoc += ` ${param.description}`;
        }
        jsdoc += '\n';
      });
      jsdoc += ' *\n';
    }

    if (node.returns) {
      jsdoc += ` * @returns ${node.returns}\n *\n`;
    }

    if (node.examples?.length) {
      node.examples.forEach(example => {
        jsdoc += ' * @example\n';
        jsdoc += ` * \`\`\`typescript\n`;
        example.split('\n').forEach(line => {
          jsdoc += ` * ${line}\n`;
        });
        jsdoc += ` * \`\`\`\n`;
      });
    }

    if (node.deprecated) {
      jsdoc += ' * @deprecated\n';
    }

    if (node.since) {
      jsdoc += ` * @since ${node.since}\n`;
    }

    if (node.see?.length) {
      node.see.forEach(ref => {
        jsdoc += ` * @see ${ref}\n`;
      });
    }

    jsdoc += ' */\n';
    return jsdoc;
  }

  private generateClassDeclaration(node: DocNode): string {
    let declaration = `export class ${node.name}`;

    if (node.members?.length) {
      declaration += ' {\n';
      node.members.forEach(member => {
        declaration += '  ' + this.generateMemberDeclaration(member);
      });
      declaration += '}';
    } else {
      declaration += ' {}';
    }

    return declaration;
  }

  private generateInterfaceDeclaration(node: DocNode): string {
    let declaration = `export interface ${node.name}`;

    if (node.members?.length) {
      declaration += ' {\n';
      node.members.forEach(member => {
        declaration += '  ' + this.generateMemberDeclaration(member);
      });
      declaration += '}';
    } else {
      declaration += ' {}';
    }

    return declaration;
  }

  private generateEnumDeclaration(node: DocNode): string {
    let declaration = `export enum ${node.name}`;

    if (node.members?.length) {
      declaration += ' {\n';
      node.members.forEach(member => {
        declaration += `  ${member.name}`;
        if (member.value !== undefined) {
          declaration += ` = ${member.value}`;
        }
        declaration += ',\n';
      });
      declaration += '}';
    } else {
      declaration += ' {}';
    }

    return declaration;
  }

  private generateFunctionDeclaration(node: DocNode): string {
    let declaration = `export function ${node.name}`;

    declaration += '(';
    if (node.params?.length) {
      declaration += node.params
        .map(param => {
          let paramStr = `${param.name}${param.optional ? '?' : ''}: ${param.type}`;
          if (param.defaultValue) {
            paramStr += ` = ${param.defaultValue}`;
          }
          return paramStr;
        })
        .join(', ');
    }
    declaration += ')';

    if (node.returns) {
      declaration += `: ${node.returns}`;
    }

    declaration += ';';
    return declaration;
  }

  private generateTypeAliasDeclaration(node: DocNode): string {
    return `export type ${node.name} = ${node.type};`;
  }

  private generateMemberDeclaration(node: DocNode): string {
    let declaration = this.generateJSDoc(node);

    if (node.modifiers?.length) {
      declaration += node.modifiers.join(' ') + ' ';
    }

    declaration += node.name;

    if (node.kind === ts.SyntaxKind.MethodDeclaration) {
      declaration += '(';
      if (node.params?.length) {
        declaration += node.params
          .map(param => {
            let paramStr = `${param.name}${param.optional ? '?' : ''}: ${param.type}`;
            if (param.defaultValue) {
              paramStr += ` = ${param.defaultValue}`;
            }
            return paramStr;
          })
          .join(', ');
      }
      declaration += ')';

      if (node.returns) {
        declaration += `: ${node.returns}`;
      }
    } else if (node.type) {
      declaration += `: ${node.type}`;
    }

    declaration += ';\n';
    return declaration;
  }

  private async writeFile(filePath: string, content: string): Promise<void> {
    await ts.sys.writeFile(filePath, content);
  }
}

// Export factory function
export function createDocGenerator(config: DocConfig): DocGenerator {
  return new DocGenerator(config);
}
