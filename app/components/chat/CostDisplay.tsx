import React from 'react';
import { TokenCounter } from '../../lib/cost/token-counter';

interface CostDisplayProps {
  model: string;
  inputText: string;
  outputText?: string;
  className?: string;
}

interface CostBreakdown {
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
}

export const CostDisplay: React.FC<CostDisplayProps> = ({
  model,
  inputText,
  outputText = '',
  className = ''
}) => {
  const [breakdown, setBreakdown] = React.useState<CostBreakdown | null>(null);
  const tokenCounter = TokenCounter.getInstance();

  React.useEffect(() => {
    try {
      const inputTokens = tokenCounter.countTokens(inputText);
      const outputTokens = tokenCounter.countTokens(outputText);
      const { cost } = tokenCounter.calculateCost(model, inputTokens, outputTokens);

      setBreakdown({
        inputTokens,
        outputTokens,
        totalCost: cost
      });
    } catch (error) {
      console.error('Error calculating cost:', error);
    }
  }, [model, inputText, outputText]);

  if (!breakdown) {
    return null;
  }

  const { inputTokens, outputTokens, totalCost } = breakdown;
  const totalTokens = inputTokens + outputTokens;
  const formattedCost = totalCost.toFixed(4);

  return (
    <div className={`flex flex-col text-sm text-gray-500 ${className}`}>
      <div className="flex items-center space-x-2">
        <span className="font-medium">Cost:</span>
        <span className="text-blue-600">${formattedCost}</span>
      </div>
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-1">
          <span>Input:</span>
          <span className="font-mono">{inputTokens}</span>
          <span className="text-xs">tokens</span>
        </div>
        <div className="flex items-center space-x-1">
          <span>Output:</span>
          <span className="font-mono">{outputTokens}</span>
          <span className="text-xs">tokens</span>
        </div>
        <div className="flex items-center space-x-1">
          <span>Total:</span>
          <span className="font-mono">{totalTokens}</span>
          <span className="text-xs">tokens</span>
        </div>
      </div>
      <div className="text-xs text-gray-400">
        Model: {model}
      </div>
    </div>
  );
};

interface SessionCostProps {
  messages: Array<{
    model: string;
    input: string;
    output?: string;
  }>;
  className?: string;
}

export const SessionCost: React.FC<SessionCostProps> = ({
  messages,
  className = ''
}) => {
  const [totalCost, setTotalCost] = React.useState<number>(0);
  const [totalTokens, setTotalTokens] = React.useState<number>(0);
  const tokenCounter = TokenCounter.getInstance();

  React.useEffect(() => {
    try {
      let cost = 0;
      let tokens = 0;

      messages.forEach(({ model, input, output = '' }) => {
        const inputTokens = tokenCounter.countTokens(input);
        const outputTokens = tokenCounter.countTokens(output);
        const result = tokenCounter.calculateCost(model, inputTokens, outputTokens);
        
        cost += result.cost;
        tokens += result.count;
      });

      setTotalCost(cost);
      setTotalTokens(tokens);
    } catch (error) {
      console.error('Error calculating session cost:', error);
    }
  }, [messages]);

  return (
    <div className={`flex flex-col bg-gray-50 rounded-lg p-4 ${className}`}>
      <h3 className="text-lg font-medium mb-2">Session Summary</h3>
      <div className="flex items-center space-x-4 mb-2">
        <div className="flex items-center space-x-2">
          <span className="font-medium">Total Cost:</span>
          <span className="text-blue-600">${totalCost.toFixed(4)}</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="font-medium">Total Tokens:</span>
          <span className="font-mono">{totalTokens}</span>
        </div>
      </div>
      <div className="text-sm text-gray-500">
        Messages: {messages.length}
      </div>
    </div>
  );
};
