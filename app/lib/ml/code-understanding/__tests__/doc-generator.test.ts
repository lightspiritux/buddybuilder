import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DocGenerator, createDocGenerator, type DocConfig } from '../docs/doc-generator';
import * as ts from 'typescript';
import * as path from 'path';

describe('DocGenerator', () => {
  let docGenerator: DocGenerator;
  let mockConfig: DocConfig;

  beforeEach(() => {
    mockConfig = {
      rootDir: 'test/fixtures',
      outDir: 'test/docs',
      include: ['**/*.ts'],
      exclude: ['**/*.test.ts'],
      examples: true,
      markdown: true,
      typescript: true
    };

    // Mock TypeScript system calls
    vi.spyOn(ts.sys, 'readFile').mockImplementation((path: string) => {
      if (path.endsWith('tsconfig.json')) {
        return JSON.stringify({
          compilerOptions: {
            target: 'es2020',
            module: 'esnext',
            strict: true
          }
        });
      }
      return mockSourceFiles[path] || '';
    });

    vi.spyOn(ts.sys, 'writeFile').mockImplementation(() => {});
    vi.spyOn(ts.sys, 'fileExists').mockImplementation(() => true);

    docGenerator = createDocGenerator(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Mock source files for testing
  const mockSourceFiles: Record<string, string> = {
    'test/fixtures/example.ts': `
      /**
       * Example interface for testing
       * @description This is a test interface
       * @example
       * const user: User = {
       *   id: 1,
       *   name: 'Test User'
       * };
       */
      export interface User {
        /** User's unique identifier */
        id: number;
        /** User's full name */
        name: string;
      }

      /**
       * Example class for testing
       * @description This is a test class
       * @since 1.0.0
       */
      export class UserService {
        /**
         * Get user by ID
         * @param id User ID
         * @returns User object
         * @throws Error if user not found
         */
        async getUser(id: number): Promise<User> {
          // Implementation
          return { id, name: 'Test' };
        }
      }

      /**
       * User role enum
       * @description Available user roles
       */
      export enum UserRole {
        ADMIN = 'admin',
        USER = 'user',
        GUEST = 'guest'
      }

      /**
       * Create a new user
       * @param user User data
       * @returns Created user
       * @example
       * const newUser = await createUser({
       *   name: 'New User'
       * });
       */
      export async function createUser(user: Omit<User, 'id'>): Promise<User> {
        // Implementation
        return { id: 1, ...user };
      }
    `
  };

  describe('Documentation Generation', () => {
    it('should generate documentation for interfaces', async () => {
      const docs = await docGenerator.generate();
      const exampleFile = docs.get('test/fixtures/example.ts');

      expect(exampleFile).toBeDefined();
      const userInterface = exampleFile!.exports.find(exp => exp.name === 'User');
      
      expect(userInterface).toBeDefined();
      expect(userInterface!.description).toContain('test interface');
      expect(userInterface!.members).toHaveLength(2);
      expect(userInterface!.members![0].name).toBe('id');
      expect(userInterface!.members![1].name).toBe('name');
    });

    it('should generate documentation for classes', async () => {
      const docs = await docGenerator.generate();
      const exampleFile = docs.get('test/fixtures/example.ts');

      expect(exampleFile).toBeDefined();
      const userService = exampleFile!.exports.find(exp => exp.name === 'UserService');
      
      expect(userService).toBeDefined();
      expect(userService!.description).toContain('test class');
      expect(userService!.since).toBe('1.0.0');
      expect(userService!.members).toHaveLength(1);
      expect(userService!.members![0].name).toBe('getUser');
    });

    it('should generate documentation for enums', async () => {
      const docs = await docGenerator.generate();
      const exampleFile = docs.get('test/fixtures/example.ts');

      expect(exampleFile).toBeDefined();
      const userRole = exampleFile!.exports.find(exp => exp.name === 'UserRole');
      
      expect(userRole).toBeDefined();
      expect(userRole!.description).toContain('user roles');
      expect(userRole!.members).toHaveLength(3);
      expect(userRole!.members!.map(m => m.name)).toEqual(['ADMIN', 'USER', 'GUEST']);
    });

    it('should generate documentation for functions', async () => {
      const docs = await docGenerator.generate();
      const exampleFile = docs.get('test/fixtures/example.ts');

      expect(exampleFile).toBeDefined();
      const createUserFn = exampleFile!.exports.find(exp => exp.name === 'createUser');
      
      expect(createUserFn).toBeDefined();
      expect(createUserFn!.params).toHaveLength(1);
      expect(createUserFn!.returns).toContain('Promise<User>');
      expect(createUserFn!.examples).toBeDefined();
      expect(createUserFn!.examples![0]).toContain('newUser');
    });
  });

  describe('Markdown Generation', () => {
    it('should generate markdown documentation', async () => {
      const writeFileSpy = vi.spyOn(ts.sys, 'writeFile');
      await docGenerator.generate();

      expect(writeFileSpy).toHaveBeenCalledWith(
        expect.stringContaining('example.md'),
        expect.stringContaining('# example.ts')
      );

      const markdown = writeFileSpy.mock.calls.find(
        call => call[0].endsWith('example.md')
      )?.[1] as string;

      expect(markdown).toContain('## User');
      expect(markdown).toContain('## UserService');
      expect(markdown).toContain('## UserRole');
      expect(markdown).toContain('## createUser');
    });

    it('should include examples in markdown', async () => {
      const writeFileSpy = vi.spyOn(ts.sys, 'writeFile');
      await docGenerator.generate();

      const markdown = writeFileSpy.mock.calls.find(
        call => call[0].endsWith('example.md')
      )?.[1] as string;

      expect(markdown).toContain('```typescript');
      expect(markdown).toContain('const user: User');
      expect(markdown).toContain('const newUser = await createUser');
    });
  });

  describe('TypeScript Declaration Generation', () => {
    it('should generate declaration files', async () => {
      const writeFileSpy = vi.spyOn(ts.sys, 'writeFile');
      await docGenerator.generate();

      expect(writeFileSpy).toHaveBeenCalledWith(
        expect.stringContaining('example.d.ts'),
        expect.stringContaining('export interface User')
      );

      const dts = writeFileSpy.mock.calls.find(
        call => call[0].endsWith('example.d.ts')
      )?.[1] as string;

      expect(dts).toContain('export interface User');
      expect(dts).toContain('export class UserService');
      expect(dts).toContain('export enum UserRole');
      expect(dts).toContain('export function createUser');
    });

    it('should include JSDoc comments in declarations', async () => {
      const writeFileSpy = vi.spyOn(ts.sys, 'writeFile');
      await docGenerator.generate();

      const dts = writeFileSpy.mock.calls.find(
        call => call[0].endsWith('example.d.ts')
      )?.[1] as string;

      expect(dts).toContain('/** User\'s unique identifier */');
      expect(dts).toContain('@description');
      expect(dts).toContain('@example');
      expect(dts).toContain('@param');
      expect(dts).toContain('@returns');
    });
  });

  describe('Configuration Options', () => {
    it('should respect include/exclude patterns', async () => {
      mockConfig.exclude = ['**/*.ts'];
      docGenerator = createDocGenerator(mockConfig);
      const docs = await docGenerator.generate();

      expect(docs.size).toBe(0);
    });

    it('should handle missing tsconfig.json', async () => {
      vi.spyOn(ts.sys, 'fileExists').mockImplementation(() => false);

      await expect(async () => {
        docGenerator = createDocGenerator(mockConfig);
        await docGenerator.generate();
      }).rejects.toThrow('Could not find tsconfig.json');
    });

    it('should skip markdown generation when disabled', async () => {
      mockConfig.markdown = false;
      docGenerator = createDocGenerator(mockConfig);
      const writeFileSpy = vi.spyOn(ts.sys, 'writeFile');
      
      await docGenerator.generate();

      expect(writeFileSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('.md'),
        expect.any(String)
      );
    });

    it('should skip TypeScript declaration generation when disabled', async () => {
      mockConfig.typescript = false;
      docGenerator = createDocGenerator(mockConfig);
      const writeFileSpy = vi.spyOn(ts.sys, 'writeFile');
      
      await docGenerator.generate();

      expect(writeFileSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('.d.ts'),
        expect.any(String)
      );
    });
  });
});
