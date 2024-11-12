export enum OperationType {
  WORKER_TASK = 'worker_task',
  RESOURCE_CLEANUP = 'resource_cleanup',
  MODEL_INFERENCE = 'model_inference',
  DATA_PROCESSING = 'data_processing',
  CODE_COMPLETION = 'code_completion',
  CONTEXT_ANALYSIS = 'context_analysis',
  DEPENDENCY_ANALYSIS = 'dependency_analysis',
  CODE_GENERATION = 'code_generation',
  SYNTAX_VALIDATION = 'syntax_validation',
  TYPE_CHECKING = 'type_checking',
  DOCUMENTATION = 'documentation',
  TESTING = 'testing',
  DEBUGGING = 'debugging',
  PROFILING = 'profiling',
  BUILD = 'build',
  DEPLOYMENT = 'deployment'
}

interface Operation {
  component: string;
  operation: OperationType;
  startTime?: number;
  endTime?: number;
  metadata?: Record<string, unknown>;
}

interface OperationOptions {
  component: string;
  operation: OperationType;
  metadata?: Record<string, unknown>;
}

class PerformanceTracker {
  private static instance: PerformanceTracker;
  private operations: Map<string, Operation>;

  private constructor() {
    this.operations = new Map();
  }

  static getInstance(): PerformanceTracker {
    if (!PerformanceTracker.instance) {
      PerformanceTracker.instance = new PerformanceTracker();
    }
    return PerformanceTracker.instance;
  }

  startOperation(options: OperationOptions): string {
    const operationId = this.generateOperationId();
    const operation: Operation = {
      ...options,
      startTime: Date.now()
    };

    this.operations.set(operationId, operation);
    return operationId;
  }

  endOperation(operationId: string, options?: Partial<OperationOptions>): void {
    const operation = this.operations.get(operationId);
    if (!operation) {
      throw new Error(`Operation ${operationId} not found`);
    }

    operation.endTime = Date.now();
    if (options) {
      Object.assign(operation, options);
    }

    // Calculate and record operation duration
    const duration = operation.endTime - (operation.startTime || 0);

    // In a real implementation, this would:
    // 1. Send metrics to a monitoring system
    // 2. Store operation logs
    // 3. Update performance dashboards
    // 4. Trigger alerts if duration exceeds thresholds
    console.log(`Operation ${operationId} completed in ${duration}ms`, {
      component: operation.component,
      operation: operation.operation,
      duration,
      metadata: operation.metadata
    });

    // Cleanup completed operation
    this.operations.delete(operationId);
  }

  getOperation(operationId: string): Operation | undefined {
    return this.operations.get(operationId);
  }

  getActiveOperations(): Operation[] {
    return Array.from(this.operations.values()).filter(op => !op.endTime);
  }

  clearCompletedOperations(): void {
    for (const [id, operation] of this.operations.entries()) {
      if (operation.endTime) {
        this.operations.delete(id);
      }
    }
  }

  private generateOperationId(): string {
    return `op-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const performanceTracker = PerformanceTracker.getInstance();
