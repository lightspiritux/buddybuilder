       import React, { useEffect, useState } from 'react';
import { ChatAnalytics as ChatAnalyticsService, UsagePattern } from '../../lib/analytics/chat-analytics';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
} from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

const ChatAnalytics: React.FC = () => {
  const [patterns, setPatterns] = useState<UsagePattern | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        const analytics = ChatAnalyticsService.getInstance();
        const data = await analytics.analyzeUsagePatterns();
        setPatterns(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    };

    loadAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-700 rounded-lg">
        <h3 className="font-semibold">Error Loading Analytics</h3>
        <p>{error}</p>
      </div>
    );
  }

  if (!patterns) {
    return null;
  }

  const timeOfDayData = {
    labels: ['Morning', 'Afternoon', 'Evening', 'Night'],
    datasets: [
      {
        label: 'Messages by Time of Day',
        data: [
          patterns.timeOfDay.morning,
          patterns.timeOfDay.afternoon,
          patterns.timeOfDay.evening,
          patterns.timeOfDay.night
        ],
        backgroundColor: [
          'rgba(255, 206, 86, 0.5)',
          'rgba(54, 162, 235, 0.5)',
          'rgba(153, 102, 255, 0.5)',
          'rgba(75, 192, 192, 0.5)'
        ],
        borderColor: [
          'rgba(255, 206, 86, 1)',
          'rgba(54, 162, 235, 1)',
          'rgba(153, 102, 255, 1)',
          'rgba(75, 192, 192, 1)'
        ],
        borderWidth: 1
      }
    ]
  };

  const dayOfWeekData = {
    labels: Object.keys(patterns.dayOfWeek),
    datasets: [
      {
        label: 'Messages by Day of Week',
        data: Object.values(patterns.dayOfWeek),
        backgroundColor: 'rgba(54, 162, 235, 0.5)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1
      }
    ]
  };

  const topicData = {
    labels: Object.keys(patterns.topicDistribution),
    datasets: [
      {
        data: Object.values(patterns.topicDistribution),
        backgroundColor: [
          'rgba(255, 99, 132, 0.5)',
          'rgba(54, 162, 235, 0.5)',
          'rgba(255, 206, 86, 0.5)',
          'rgba(75, 192, 192, 0.5)',
          'rgba(153, 102, 255, 0.5)'
        ],
        borderColor: [
          'rgba(255, 99, 132, 1)',
          'rgba(54, 162, 235, 1)',
          'rgba(255, 206, 86, 1)',
          'rgba(75, 192, 192, 1)',
          'rgba(153, 102, 255, 1)'
        ],
        borderWidth: 1
      }
    ]
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  };

  return (
    <div className="p-6 space-y-8">
      <h2 className="text-2xl font-bold mb-6">Chat Analytics</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Time of Day Distribution */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Message Distribution by Time of Day</h3>
          <Bar
            data={timeOfDayData}
            options={{
              responsive: true,
              plugins: {
                legend: {
                  position: 'top' as const
                }
              }
            }}
          />
        </div>

        {/* Day of Week Distribution */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Message Distribution by Day of Week</h3>
          <Bar
            data={dayOfWeekData}
            options={{
              responsive: true,
              plugins: {
                legend: {
                  position: 'top' as const
                }
              }
            }}
          />
        </div>

        {/* Topic Distribution */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Topic Distribution</h3>
          <Pie
            data={topicData}
            options={{
              responsive: true,
              plugins: {
                legend: {
                  position: 'right' as const
                }
              }
            }}
          />
        </div>

        {/* Message Length Statistics */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Message Length Statistics</h3>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium">User Messages</h4>
              <ul className="list-disc list-inside">
                <li>Average: {patterns.messageLength.user.average.toFixed(0)} characters</li>
                <li>Minimum: {patterns.messageLength.user.min} characters</li>
                <li>Maximum: {patterns.messageLength.user.max} characters</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium">Assistant Messages</h4>
              <ul className="list-disc list-inside">
                <li>Average: {patterns.messageLength.assistant.average.toFixed(0)} characters</li>
                <li>Minimum: {patterns.messageLength.assistant.min} characters</li>
                <li>Maximum: {patterns.messageLength.assistant.max} characters</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Response Time and Interaction Frequency */}
        <div className="bg-white p-6 rounded-lg shadow md:col-span-2">
          <h3 className="text-lg font-semibold mb-4">Interaction Metrics</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium">Average Response Time</h4>
              <p className="text-2xl font-bold text-blue-600">
                {formatDuration(patterns.averageResponseTime)}
              </p>
            </div>
            <div>
              <h4 className="font-medium">Interaction Frequency</h4>
              <ul className="list-disc list-inside">
                <li>Daily: {patterns.interactionFrequency.daily} chats</li>
                <li>Weekly: {patterns.interactionFrequency.weekly} chats</li>
                <li>Monthly: {patterns.interactionFrequency.monthly} chats</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatAnalytics;
