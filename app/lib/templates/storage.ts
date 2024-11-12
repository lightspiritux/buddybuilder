import { metricsCollector, MetricType, MetricCategory } from '../ml/code-understanding/telemetry/metrics-collector';
import { performanceTracker, OperationType } from '../ml/code-understanding/telemetry/performance-tracker';

export interface Template {
  id: string;
  name: string;
  description: string;
  content: string;
  category: string;
  tags: string[];
  version: string;
  createdAt: Date;
  updatedAt: Date;
  author: string;
  isPublic: boolean;
  usageCount: number;
}

export interface TemplateFilter {
  category?: string;
  tags?: string[];
  author?: string;
  isPublic?: boolean;
  search?: string;
}

export class TemplateStorage {
  private static instance: TemplateStorage;
  private templates: Map<string, Template>;

  private constructor() {
    this.templates = new Map();
    this.initializeMetrics();
  }

  static getInstance(): TemplateStorage {
    if (!TemplateStorage.instance) {
      TemplateStorage.instance = new TemplateStorage();
    }
    return TemplateStorage.instance;
  }

  async createTemplate(template: Omit<Template, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>): Promise<Template> {
    const operationId = performanceTracker.startOperation({
      component: 'TemplateStorage',
      operation: OperationType.RESOURCE_CLEANUP
    });

    try {
      const id = crypto.randomUUID();
      const now = new Date();
      
      const newTemplate: Template = {
        ...template,
        id,
        createdAt: now,
        updatedAt: now,
        usageCount: 0
      };

      this.templates.set(id, newTemplate);

      metricsCollector.record('template_created', 1, {
        category: MetricCategory.SYSTEM
      });

      return newTemplate;
    } catch (error) {
      metricsCollector.record('template_creation_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'TemplateStorage',
        operation: OperationType.RESOURCE_CLEANUP
      });
    }
  }

  async updateTemplate(id: string, updates: Partial<Template>): Promise<Template> {
    const operationId = performanceTracker.startOperation({
      component: 'TemplateStorage',
      operation: OperationType.RESOURCE_CLEANUP
    });

    try {
      const template = this.templates.get(id);
      if (!template) {
        throw new Error(`Template not found: ${id}`);
      }

      const updatedTemplate: Template = {
        ...template,
        ...updates,
        id,
        updatedAt: new Date()
      };

      this.templates.set(id, updatedTemplate);

      metricsCollector.record('template_updated', 1, {
        category: MetricCategory.SYSTEM
      });

      return updatedTemplate;
    } catch (error) {
      metricsCollector.record('template_update_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'TemplateStorage',
        operation: OperationType.RESOURCE_CLEANUP
      });
    }
  }

  async deleteTemplate(id: string): Promise<void> {
    const operationId = performanceTracker.startOperation({
      component: 'TemplateStorage',
      operation: OperationType.RESOURCE_CLEANUP
    });

    try {
      if (!this.templates.has(id)) {
        throw new Error(`Template not found: ${id}`);
      }

      this.templates.delete(id);

      metricsCollector.record('template_deleted', 1, {
        category: MetricCategory.SYSTEM
      });
    } catch (error) {
      metricsCollector.record('template_deletion_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'TemplateStorage',
        operation: OperationType.RESOURCE_CLEANUP
      });
    }
  }

  async getTemplate(id: string): Promise<Template> {
    const operationId = performanceTracker.startOperation({
      component: 'TemplateStorage',
      operation: OperationType.WORKER_TASK
    });

    try {
      const template = this.templates.get(id);
      if (!template) {
        throw new Error(`Template not found: ${id}`);
      }

      metricsCollector.record('template_retrieved', 1, {
        category: MetricCategory.SYSTEM
      });

      return template;
    } catch (error) {
      metricsCollector.record('template_retrieval_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'TemplateStorage',
        operation: OperationType.WORKER_TASK
      });
    }
  }

  async findTemplates(filter: TemplateFilter = {}): Promise<Template[]> {
    const operationId = performanceTracker.startOperation({
      component: 'TemplateStorage',
      operation: OperationType.WORKER_TASK
    });

    try {
      let templates = Array.from(this.templates.values());

      if (filter.category) {
        templates = templates.filter(t => t.category === filter.category);
      }

      if (filter.tags?.length) {
        templates = templates.filter(t => 
          filter.tags!.every(tag => t.tags.includes(tag))
        );
      }

      if (filter.author) {
        templates = templates.filter(t => t.author === filter.author);
      }

      if (filter.isPublic !== undefined) {
        templates = templates.filter(t => t.isPublic === filter.isPublic);
      }

      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        templates = templates.filter(t =>
          t.name.toLowerCase().includes(searchLower) ||
          t.description.toLowerCase().includes(searchLower) ||
          t.tags.some(tag => tag.toLowerCase().includes(searchLower))
        );
      }

      metricsCollector.record('templates_searched', 1, {
        category: MetricCategory.SYSTEM
      });

      return templates;
    } catch (error) {
      metricsCollector.record('templates_search_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'TemplateStorage',
        operation: OperationType.WORKER_TASK
      });
    }
  }

  async incrementUsage(id: string): Promise<void> {
    const operationId = performanceTracker.startOperation({
      component: 'TemplateStorage',
      operation: OperationType.WORKER_TASK
    });

    try {
      const template = await this.getTemplate(id);
      await this.updateTemplate(id, {
        usageCount: template.usageCount + 1
      });

      metricsCollector.record('template_usage_incremented', 1, {
        category: MetricCategory.SYSTEM
      });
    } catch (error) {
      metricsCollector.record('template_usage_increment_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'TemplateStorage',
        operation: OperationType.WORKER_TASK
      });
    }
  }

  private initializeMetrics(): void {
    metricsCollector.registerMetric({
      name: 'template_created',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of templates created'
    });

    metricsCollector.registerMetric({
      name: 'template_creation_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed template creations'
    });

    metricsCollector.registerMetric({
      name: 'template_updated',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of templates updated'
    });

    metricsCollector.registerMetric({
      name: 'template_update_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed template updates'
    });

    metricsCollector.registerMetric({
      name: 'template_deleted',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of templates deleted'
    });

    metricsCollector.registerMetric({
      name: 'template_deletion_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed template deletions'
    });

    metricsCollector.registerMetric({
      name: 'template_retrieved',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of templates retrieved'
    });

    metricsCollector.registerMetric({
      name: 'template_retrieval_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed template retrievals'
    });

    metricsCollector.registerMetric({
      name: 'templates_searched',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of template searches performed'
    });

    metricsCollector.registerMetric({
      name: 'templates_search_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed template searches'
    });

    metricsCollector.registerMetric({
      name: 'template_usage_incremented',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of template usage increments'
    });

    metricsCollector.registerMetric({
      name: 'template_usage_increment_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed template usage increments'
    });
  }
}
