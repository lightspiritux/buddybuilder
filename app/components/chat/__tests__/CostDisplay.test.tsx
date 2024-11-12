import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CostDisplay, SessionCost } from '../CostDisplay';
import { TokenCounter } from '../../../lib/cost/token-counter';

// Mock TokenCounter
vi.mock('../../../lib/cost/token-counter', () => ({
  TokenCounter: {
    getInstance: () => ({
      countTokens: vi.fn((text) => text.split(' ').length),
      calculateCost: vi.fn((model, input, output) => ({
        count: input + output,
        cost: (input + output) * 0.001
      }))
    })
  }
}));

describe('CostDisplay', () => {
  const defaultProps = {
    model: 'gpt-4',
    inputText: 'Hello world',
    outputText: 'Hello there, world'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders cost information correctly', () => {
    render(<CostDisplay {...defaultProps} />);

    // Input has 2 tokens, output has 3 tokens
    expect(screen.getByText('$0.0050')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // Input tokens
    expect(screen.getByText('3')).toBeInTheDocument(); // Output tokens
    expect(screen.getByText('5')).toBeInTheDocument(); // Total tokens
  });

  it('handles missing output text', () => {
    const propsWithoutOutput = {
      model: 'gpt-4',
      inputText: 'Hello world'
    };

    render(<CostDisplay {...propsWithoutOutput} />);
    expect(screen.getByText('$0.0020')).toBeInTheDocument(); // Only input cost
  });

  it('displays model information', () => {
    render(<CostDisplay {...defaultProps} />);
    expect(screen.getByText(/gpt-4/)).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <CostDisplay {...defaultProps} className="custom-class" />
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });
});

describe('SessionCost', () => {
  const defaultMessages = [
    {
      model: 'gpt-4',
      input: 'Hello world',
      output: 'Hello there'
    },
    {
      model: 'gpt-4',
      input: 'How are you',
      output: 'I am fine'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders session summary correctly', () => {
    render(<SessionCost messages={defaultMessages} />);

    // Total tokens: (2+2) + (3+3) = 10 tokens
    // Cost: 10 * 0.001 = 0.01
    expect(screen.getByText('$0.0100')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument(); // Total tokens
    expect(screen.getByText('Messages: 2')).toBeInTheDocument();
  });

  it('handles empty message list', () => {
    render(<SessionCost messages={[]} />);
    expect(screen.getByText('$0.0000')).toBeInTheDocument();
    expect(screen.getByText('Messages: 0')).toBeInTheDocument();
  });

  it('handles messages without output', () => {
    const messagesWithoutOutput = [
      {
        model: 'gpt-4',
        input: 'Hello world'
      }
    ];

    render(<SessionCost messages={messagesWithoutOutput} />);
    expect(screen.getByText('$0.0020')).toBeInTheDocument(); // Only input cost
  });

  it('applies custom className', () => {
    const { container } = render(
      <SessionCost messages={defaultMessages} className="custom-class" />
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });
});

// Test error handling
describe('CostDisplay Error Handling', () => {
  const errorTestProps = {
    model: 'gpt-4',
    inputText: 'Hello world',
    outputText: 'Hello there, world'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('handles token counting errors gracefully', () => {
    vi.mocked(TokenCounter.getInstance).mockReturnValue({
      countTokens: vi.fn(() => {
        throw new Error('Token counting failed');
      }),
      calculateCost: vi.fn()
    } as any);

    const { container } = render(<CostDisplay {...errorTestProps} />);
    expect(container.firstChild).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  it('handles cost calculation errors gracefully', () => {
    vi.mocked(TokenCounter.getInstance).mockReturnValue({
      countTokens: vi.fn(() => 1),
      calculateCost: vi.fn(() => {
        throw new Error('Cost calculation failed');
      })
    } as any);

    const { container } = render(<CostDisplay {...errorTestProps} />);
    expect(container.firstChild).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });
});
