import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ChatAnalytics from '../ChatAnalytics';
import { ChatAnalytics as ChatAnalyticsService } from '../../../lib/analytics/chat-analytics';

// Mock the service
vi.mock('../../../lib/analytics/chat-analytics', () => ({
  ChatAnalytics: {
    getInstance: vi.fn(() => ({
      analyzeUsagePatterns: vi.fn()
    }))
  }
}));

// Mock chart.js to avoid canvas rendering issues in tests
vi.mock('chart.js', () => ({
  Chart: {
    register: vi.fn()
  },
  CategoryScale: class {},
  LinearScale: class {},
  BarElement: class {},
  Title: class {},
  Tooltip: class {},
  Legend: class {},
  ArcElement: class {}
}));

// Mock react-chartjs-2 components
vi.mock('react-chartjs-2', () => ({
  Bar: () => <div data-testid="bar-chart">Bar Chart</div>,
  Pie: () => <div data-testid="pie-chart">Pie Chart</div>
}));

describe('ChatAnalytics Component', () => {
  const mockAnalytics = ChatAnalyticsService.getInstance();
  const mockPatterns = {
    timeOfDay: {
      morning: 5,
      afternoon: 8,
      evening: 3,
      night: 2
    },
    dayOfWeek: {
      Monday: 4,
      Tuesday: 5,
      Wednesday: 3,
      Thursday: 6,
      Friday: 4,
      Saturday: 2,
      Sunday: 1
    },
    topicDistribution: {
      development: 10,
      deployment: 5,
      debugging: 3
    },
    averageResponseTime: 60000, // 1 minute
    messageLength: {
      user: {
        average: 50,
        min: 10,
        max: 200
      },
      assistant: {
        average: 150,
        min: 30,
        max: 500
      }
    },
    interactionFrequency: {
      daily: 15,
      weekly: 85,
      monthly: 320
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    vi.mocked(mockAnalytics.analyzeUsagePatterns).mockImplementation(
      () => new Promise(() => {})
    );

    render(<ChatAnalytics />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders analytics data when loaded', async () => {
    vi.mocked(mockAnalytics.analyzeUsagePatterns).mockResolvedValue(mockPatterns);

    render(<ChatAnalytics />);

    await waitFor(() => {
      expect(screen.getByText('Chat Analytics')).toBeInTheDocument();
    });

    // Check for chart components
    expect(screen.getAllByTestId('bar-chart')).toHaveLength(2); // Time of day and day of week
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument(); // Topic distribution

    // Check for message length statistics
    expect(screen.getByText('Message Length Statistics')).toBeInTheDocument();
    expect(screen.getByText('50 characters')).toBeInTheDocument(); // User average
    expect(screen.getByText('150 characters')).toBeInTheDocument(); // Assistant average

    // Check for interaction metrics
    expect(screen.getByText('Interaction Metrics')).toBeInTheDocument();
    expect(screen.getByText('1m 0s')).toBeInTheDocument(); // Average response time
    expect(screen.getByText('15 chats')).toBeInTheDocument(); // Daily interactions
  });

  it('renders error state when analytics fails to load', async () => {
    const errorMessage = 'Failed to load analytics data';
    vi.mocked(mockAnalytics.analyzeUsagePatterns).mockRejectedValue(
      new Error(errorMessage)
    );

    render(<ChatAnalytics />);

    await waitFor(() => {
      expect(screen.getByText('Error Loading Analytics')).toBeInTheDocument();
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  it('formats duration correctly', async () => {
    vi.mocked(mockAnalytics.analyzeUsagePatterns).mockResolvedValue({
      ...mockPatterns,
      averageResponseTime: 125000 // 2m 5s
    });

    render(<ChatAnalytics />);

    await waitFor(() => {
      expect(screen.getByText('2m 5s')).toBeInTheDocument();
    });
  });

  it('handles empty data gracefully', async () => {
    const emptyPatterns = {
      timeOfDay: { morning: 0, afternoon: 0, evening: 0, night: 0 },
      dayOfWeek: {
        Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0,
        Friday: 0, Saturday: 0, Sunday: 0
      },
      topicDistribution: {},
      averageResponseTime: 0,
      messageLength: {
        user: { average: 0, min: 0, max: 0 },
        assistant: { average: 0, min: 0, max: 0 }
      },
      interactionFrequency: {
        daily: 0,
        weekly: 0,
        monthly: 0
      }
    };

    vi.mocked(mockAnalytics.analyzeUsagePatterns).mockResolvedValue(emptyPatterns);

    render(<ChatAnalytics />);

    await waitFor(() => {
      expect(screen.getByText('Chat Analytics')).toBeInTheDocument();
      expect(screen.getByText('0 characters')).toBeInTheDocument(); // User average
      expect(screen.getByText('0m 0s')).toBeInTheDocument(); // Average response time
    });
  });

  it('calls analytics service on mount', () => {
    render(<ChatAnalytics />);
    expect(mockAnalytics.analyzeUsagePatterns).toHaveBeenCalledTimes(1);
  });

  it('updates charts when data changes', async () => {
    const { rerender } = render(<ChatAnalytics />);

    // Initial data
    vi.mocked(mockAnalytics.analyzeUsagePatterns).mockResolvedValue(mockPatterns);

    await waitFor(() => {
      expect(screen.getByText('15 chats')).toBeInTheDocument();
    });

    // Updated data
    const updatedPatterns = {
      ...mockPatterns,
      interactionFrequency: {
        daily: 20,
        weekly: 90,
        monthly: 350
      }
    };

    vi.mocked(mockAnalytics.analyzeUsagePatterns).mockResolvedValue(updatedPatterns);

    rerender(<ChatAnalytics />);

    await waitFor(() => {
      expect(screen.getByText('20 chats')).toBeInTheDocument();
    });
  });
});
