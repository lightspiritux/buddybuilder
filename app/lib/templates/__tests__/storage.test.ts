import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TemplateStorage, Template } from '../storage';

// Mock metrics collector
vi.mock('../../../ml/code-understanding/telemetry/metrics-collector', () => ({
  metricsCollector: {
    record: vi.fn(),
    registerMetric: vi.fn()
  },
  MetricType: {
    COUNTER: 'counter'
  },
  MetricCategory: {
    SYSTEM: 'system'
  }
}));

// Mock performance tracker
vi.mock('../../../ml/code-understanding/telemetry/performance-tracker', () => ({
  performanceTracker: {
    startOperation: vi.fn(() => 'operation-id'),
    endOperation: vi.fn()
  },
  OperationType: {
    RESOURCE_CLEANUP: 'resource_cleanup',
    WORKER_TASK: 'worker_task'
  }
}));

describe('TemplateStorage', () => {
  let storage: TemplateStorage;
  const mockTemplate = {
    name: 'Test Template',
    description: 'A test template',
    content: 'Template content',
    category: 'test',
    tags: ['test', 'example'],
    version: '1.0.0',
    author: 'test-user',
    isPublic: true
  };

  beforeEach(() => {
    vi.clearAllMocks();
    storage = TemplateStorage.getInstance();
  });

  describe('Template Creation', () => {
    it('creates a template with required fields', async () => {
      const template = await storage.createTemplate(mockTemplate);

      expect(template).toMatchObject({
        ...mockTemplate,
        id: expect.any(String),
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
        usageCount: 0
      });
    });

    it('generates unique IDs for each template', async () => {
      const template1 = await storage.createTemplate(mockTemplate);
      const template2 = await storage.createTemplate(mockTemplate);

      expect(template1.id).not.toBe(template2.id);
    });
  });

  describe('Template Retrieval', () => {
    let createdTemplate: Template;

    beforeEach(async () => {
      createdTemplate = await storage.createTemplate(mockTemplate);
    });

    it('retrieves a template by ID', async () => {
      const template = await storage.getTemplate(createdTemplate.id);
      expect(template).toEqual(createdTemplate);
    });

    it('throws error when template not found', async () => {
      await expect(storage.getTemplate('non-existent-id')).rejects.toThrow();
    });
  });

  describe('Template Update', () => {
    let createdTemplate: Template;

    beforeEach(async () => {
      createdTemplate = await storage.createTemplate(mockTemplate);
    });

    it('updates template fields', async () => {
      const updates = {
        name: 'Updated Name',
        description: 'Updated description'
      };

      const updatedTemplate = await storage.updateTemplate(createdTemplate.id, updates);

      expect(updatedTemplate).toMatchObject({
        ...createdTemplate,
        ...updates,
        updatedAt: expect.any(Date)
      });
      expect(updatedTemplate.updatedAt > createdTemplate.updatedAt).toBe(true);
    });

    it('throws error when updating non-existent template', async () => {
      await expect(storage.updateTemplate('non-existent-id', { name: 'New Name' })).rejects.toThrow();
    });
  });

  describe('Template Deletion', () => {
    let createdTemplate: Template;

    beforeEach(async () => {
      createdTemplate = await storage.createTemplate(mockTemplate);
    });

    it('deletes a template', async () => {
      await storage.deleteTemplate(createdTemplate.id);
      await expect(storage.getTemplate(createdTemplate.id)).rejects.toThrow();
    });

    it('throws error when deleting non-existent template', async () => {
      await expect(storage.deleteTemplate('non-existent-id')).rejects.toThrow();
    });
  });

  describe('Template Search', () => {
    beforeEach(async () => {
      await storage.createTemplate({
        ...mockTemplate,
        name: 'React Template',
        category: 'frontend',
        tags: ['react', 'javascript']
      });

      await storage.createTemplate({
        ...mockTemplate,
        name: 'Vue Template',
        category: 'frontend',
        tags: ['vue', 'javascript']
      });

      await storage.createTemplate({
        ...mockTemplate,
        name: 'Django Template',
        category: 'backend',
        tags: ['python', 'django']
      });
    });

    it('filters by category', async () => {
      const templates = await storage.findTemplates({ category: 'frontend' });
      expect(templates).toHaveLength(2);
      expect(templates.every(t => t.category === 'frontend')).toBe(true);
    });

    it('filters by tags', async () => {
      const templates = await storage.findTemplates({ tags: ['javascript'] });
      expect(templates).toHaveLength(2);
      expect(templates.every(t => t.tags.includes('javascript'))).toBe(true);
    });

    it('filters by search term', async () => {
      const templates = await storage.findTemplates({ search: 'react' });
      expect(templates).toHaveLength(1);
      expect(templates[0].name).toBe('React Template');
    });

    it('combines multiple filters', async () => {
      const templates = await storage.findTemplates({
        category: 'frontend',
        tags: ['javascript'],
        search: 'react'
      });

      expect(templates).toHaveLength(1);
      expect(templates[0].name).toBe('React Template');
    });
  });

  describe('Usage Tracking', () => {
    let createdTemplate: Template;

    beforeEach(async () => {
      createdTemplate = await storage.createTemplate(mockTemplate);
    });

    it('increments usage count', async () => {
      await storage.incrementUsage(createdTemplate.id);
      const template = await storage.getTemplate(createdTemplate.id);
      expect(template.usageCount).toBe(1);
    });

    it('throws error when incrementing usage for non-existent template', async () => {
      await expect(storage.incrementUsage('non-existent-id')).rejects.toThrow();
    });
  });

  describe('Singleton Pattern', () => {
    it('returns the same instance', () => {
      const instance1 = TemplateStorage.getInstance();
      const instance2 = TemplateStorage.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('maintains state across instances', async () => {
      const instance1 = TemplateStorage.getInstance();
      const template = await instance1.createTemplate(mockTemplate);

      const instance2 = TemplateStorage.getInstance();
      const retrieved = await instance2.getTemplate(template.id);
      expect(retrieved).toEqual(template);
    });
  });
});
