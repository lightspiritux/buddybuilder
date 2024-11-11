import * as tf from '@tensorflow/tfjs';
import { vi, expect, afterEach } from 'vitest';

/**
 * Test Setup for ML Components
 * 
 * This file configures the test environment for ML components:
 * 1. TensorFlow.js configuration
 * 2. Mock implementations
 * 3. Test utilities
 */

// Configure TensorFlow.js for testing
tf.setBackend('cpu');
tf.env().set('DEBUG', false);
tf.env().set('WEBGL_CPU_FORWARD', true);

// Mock browser APIs that TensorFlow.js might use
global.fetch = vi.fn();

// Create minimal WebGL2RenderingContext mock
class MockWebGL2RenderingContext {
  static readonly READ_BUFFER = 3074;
  static readonly UNPACK_ROW_LENGTH = 3314;
  static readonly UNPACK_SKIP_ROWS = 3315;
  static readonly UNPACK_SKIP_PIXELS = 3316;
  static readonly PACK_ROW_LENGTH = 3330;
  static readonly PACK_SKIP_ROWS = 3331;
  static readonly PACK_SKIP_PIXELS = 3332;
  static readonly TEXTURE_BINDING_3D = 32879;
  static readonly UNPACK_SKIP_IMAGES = 32877;
  static readonly UNPACK_IMAGE_HEIGHT = 32878;
  static readonly MAX_3D_TEXTURE_SIZE = 32883;
  static readonly MAX_ELEMENTS_VERTICES = 33000;
  static readonly MAX_ELEMENTS_INDICES = 33001;
  // Add other required WebGL2 constants as needed
}

global.WebGL2RenderingContext = MockWebGL2RenderingContext as any;

// Test utilities for tensor operations
export function createRandomTensor(shape: number[]): tf.Tensor {
  return tf.randomNormal(shape);
}

export function tensorToArray<T extends number[] | number[][]>(tensor: tf.Tensor): T {
  return tensor.arraySync() as T;
}

export function compareTensors(a: tf.Tensor, b: tf.Tensor, epsilon = 1e-5): boolean {
  const diff = tf.sub(a, b);
  const maxDiff = tf.max(tf.abs(diff)).dataSync()[0];
  diff.dispose();
  return maxDiff < epsilon;
}

// Mock training data generator
export function createMockTrainingData(
  numSamples: number,
  sequenceLength: number,
  vocabSize: number
): { inputs: number[][]; targets: number[][] } {
  const inputs: number[][] = [];
  const targets: number[][] = [];

  for (let i = 0; i < numSamples; i++) {
    const input = Array.from(
      { length: sequenceLength },
      () => Math.floor(Math.random() * vocabSize)
    );
    const target = Array.from(
      { length: sequenceLength },
      () => Math.floor(Math.random() * vocabSize)
    );
    inputs.push(input);
    targets.push(target);
  }

  return { inputs, targets };
}

// Test configuration presets
export const TEST_CONFIG = {
  small: {
    modelSize: 64,
    numHeads: 2,
    feedForwardSize: 128,
    dropoutRate: 0.1,
    vocabSize: 1000,
    maxSequenceLength: 32,
    numLayers: 2,
    batchSize: 4,
    learningRate: 0.001,
    labelSmoothing: 0.1,
    warmupSteps: 100
  },
  medium: {
    modelSize: 128,
    numHeads: 4,
    feedForwardSize: 256,
    dropoutRate: 0.1,
    vocabSize: 5000,
    maxSequenceLength: 64,
    numLayers: 3,
    batchSize: 8,
    learningRate: 0.001,
    labelSmoothing: 0.1,
    warmupSteps: 200
  }
};

// Memory management utilities
export function disposeTensors(...tensors: tf.Tensor[]): void {
  tensors.forEach(t => t.dispose());
}

// Test context manager
export class TestContext {
  private tensors: Set<tf.Tensor>;

  constructor() {
    this.tensors = new Set();
  }

  trackTensor(tensor: tf.Tensor): tf.Tensor {
    this.tensors.add(tensor);
    return tensor;
  }

  cleanup(): void {
    this.tensors.forEach(t => t.dispose());
    this.tensors.clear();
  }
}

// Mock model metrics
export interface MockMetrics {
  loss: number;
  accuracy: number;
  perplexity: number;
}

export function createMockMetrics(): MockMetrics {
  return {
    loss: Math.random(),
    accuracy: Math.random(),
    perplexity: Math.exp(Math.random() * 2)
  };
}

// Test assertions for model behavior
export function assertModelBehavior(
  output: tf.Tensor,
  expectedShape: number[],
  validationFn?: (values: number[][]) => boolean
): void {
  // Check shape
  const shape = output.shape;
  expect(shape).toEqual(expectedShape);

  // Check values if validation function provided
  if (validationFn) {
    const values = output.arraySync() as number[][];
    expect(validationFn(values)).toBe(true);
  }
}

// Mock attention patterns
export function createMockAttentionPattern(
  batchSize: number,
  numHeads: number,
  seqLength: number
): tf.Tensor {
  return tf.tidy(() => {
    const shape = [batchSize, numHeads, seqLength, seqLength];
    const pattern = tf.randomUniform(shape);
    return tf.softmax(pattern, -1);
  });
}

// Test utilities for model evaluation
export interface EvaluationMetrics {
  loss: number;
  accuracy: number;
  perplexity: number;
  attentionCoverage: number;
}

export function evaluateModel(
  predictions: tf.Tensor,
  targets: tf.Tensor,
  attentionWeights?: tf.Tensor
): EvaluationMetrics {
  return tf.tidy(() => {
    const loss = tf.losses
      .softmaxCrossEntropy(targets, predictions)
      .arraySync() as number;

    const accuracy = tf.metrics
      .categoricalAccuracy(targets, predictions)
      .arraySync() as number;

    const perplexity = Math.exp(loss);

    let attentionCoverage = 0;
    if (attentionWeights) {
      // Calculate attention coverage as the average attention weight
      attentionCoverage = tf.mean(attentionWeights).arraySync() as number;
    }

    return {
      loss,
      accuracy,
      perplexity,
      attentionCoverage
    };
  });
}

// Cleanup utilities
afterEach(() => {
  // Clean up any remaining tensors
  tf.disposeVariables();
  tf.engine().endScope();
  tf.engine().startScope();
});
