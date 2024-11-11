import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as tf from '@tensorflow/tfjs';
import { TFTransformerModel } from '../model/tf-model';
import { TEST_CONFIG, createMockTrainingData, assertModelBehavior, TestContext } from './setup';
import type { TransformerLayerConfig } from '../model/layers';

describe('TFTransformerModel', () => {
  let model: TFTransformerModel;
  let testContext: TestContext;
  const config: TransformerLayerConfig = TEST_CONFIG.small;

  beforeEach(() => {
    testContext = new TestContext();
    model = new TFTransformerModel(config);
  });

  afterEach(() => {
    model.dispose();
    testContext.cleanup();
  });

  describe('Initialization', () => {
    it('should initialize model with correct configuration', async () => {
      await model.initialize();
      expect(model).toBeDefined();
    });

    it('should create model with correct input/output shapes', async () => {
      await model.initialize();
      const { inputs, targets } = createMockTrainingData(1, config.maxSequenceLength, config.vocabSize);
      
      const result = await model.forward(inputs);
      expect(result).toBeDefined();
      expect(result.length).toBe(1);
      expect(result[0].length).toBe(config.vocabSize);
    });
  });

  describe('Training', () => {
    it('should train on mock data without errors', async () => {
      await model.initialize();
      const { inputs, targets } = createMockTrainingData(4, config.maxSequenceLength, config.vocabSize);
      
      const logs = await model.train(inputs, targets, 1);
      expect(logs).toBeDefined();
      expect(logs.loss).toBeDefined();
      expect(logs.accuracy).toBeDefined();
      expect(logs.loss.length).toBe(1);
      expect(logs.accuracy.length).toBe(1);
    });

    it('should improve loss during training', async () => {
      await model.initialize();
      const { inputs, targets } = createMockTrainingData(8, config.maxSequenceLength, config.vocabSize);
      
      const initialLogs = await model.train(inputs, targets, 1);
      const finalLogs = await model.train(inputs, targets, 2);
      
      expect(finalLogs.loss[finalLogs.loss.length - 1])
        .toBeLessThan(initialLogs.loss[0]);
    });
  });

  describe('Forward Pass', () => {
    it('should generate valid predictions', async () => {
      await model.initialize();
      const input = createMockTrainingData(1, config.maxSequenceLength, config.vocabSize).inputs;
      
      const output = await model.forward(input);
      expect(output).toBeDefined();
      expect(output[0]).toHaveLength(config.vocabSize);
      
      // Check if outputs are valid probabilities
      output[0].forEach(prob => {
        expect(prob).toBeGreaterThanOrEqual(0);
        expect(prob).toBeLessThanOrEqual(1);
      });
      
      // Check if probabilities sum to approximately 1
      const sum = output[0].reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 2);
    });

    it('should handle batch processing', async () => {
      await model.initialize();
      const batchSize = 4;
      const input = createMockTrainingData(batchSize, config.maxSequenceLength, config.vocabSize).inputs;
      
      const output = await model.forward(input);
      expect(output).toHaveLength(batchSize);
      output.forEach(prediction => {
        expect(prediction).toHaveLength(config.vocabSize);
      });
    });
  });

  describe('Model Save/Load', () => {
    it('should save and load model correctly', async () => {
      await model.initialize();
      const testPath = 'test-model';
      
      // Generate test prediction before saving
      const testInput = createMockTrainingData(1, config.maxSequenceLength, config.vocabSize).inputs;
      const predictionBefore = await model.forward(testInput);
      
      // Save model
      await model.saveModel(testPath);
      
      // Create new model instance
      const loadedModel = new TFTransformerModel(config);
      await loadedModel.loadModel(testPath);
      
      // Generate prediction with loaded model
      const predictionAfter = await loadedModel.forward(testInput);
      
      // Compare predictions
      expect(predictionAfter[0]).toHaveLength(predictionBefore[0].length);
      for (let i = 0; i < predictionBefore[0].length; i++) {
        expect(predictionAfter[0][i]).toBeCloseTo(predictionBefore[0][i], 5);
      }
      
      loadedModel.dispose();
    });

    it('should throw error when loading invalid model', async () => {
      await model.initialize();
      await expect(model.loadModel('invalid-path')).rejects.toThrow();
    });
  });

  describe('Resource Management', () => {
    it('should properly dispose resources', async () => {
      await model.initialize();
      const numTensorsBefore = tf.memory().numTensors;
      
      // Run some operations
      const { inputs, targets } = createMockTrainingData(4, config.maxSequenceLength, config.vocabSize);
      await model.train(inputs, targets, 1);
      
      // Dispose model
      model.dispose();
      
      // Check if tensors were cleaned up
      const numTensorsAfter = tf.memory().numTensors;
      expect(numTensorsAfter).toBeLessThanOrEqual(numTensorsBefore);
    });

    it('should handle multiple initializations', async () => {
      await model.initialize();
      await model.initialize(); // Second initialization should be ignored
      
      const { inputs, targets } = createMockTrainingData(2, config.maxSequenceLength, config.vocabSize);
      const logs = await model.train(inputs, targets, 1);
      
      expect(logs).toBeDefined();
      expect(logs.loss).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid input shapes', async () => {
      await model.initialize();
      const invalidInput = [[1, 2]]; // Too short sequence
      
      await expect(model.forward(invalidInput)).rejects.toThrow();
    });

    it('should handle training before initialization', async () => {
      const uninitializedModel = new TFTransformerModel(config);
      const { inputs, targets } = createMockTrainingData(2, config.maxSequenceLength, config.vocabSize);
      
      await expect(uninitializedModel.train(inputs, targets, 1)).rejects.toThrow();
    });

    it('should handle invalid training data', async () => {
      await model.initialize();
      const inputs = createMockTrainingData(2, config.maxSequenceLength, config.vocabSize).inputs;
      const invalidTargets = [[1]]; // Invalid target shape
      
      await expect(model.train(inputs, invalidTargets, 1)).rejects.toThrow();
    });
  });
});
