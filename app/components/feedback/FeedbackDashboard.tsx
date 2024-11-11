import React, { useState, useEffect } from 'react';
import { completionLogger } from '~/lib/ml/code-understanding/learning/completion-logger';
import { feedbackProcessor } from '~/lib/ml/code-understanding/learning/feedback-processor';
import type { CompletionStats, PatternStats } from '~/lib/ml/code-understanding/learning/completion-logger';

interface FeedbackDashboardProps {
  className?: string;
}

export function FeedbackDashboard({ className = '' }: FeedbackDashboardProps) {
  const [stats, setStats] = useState<CompletionStats | null>(null);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'patterns' | 'insights'>('overview');

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      const currentStats = completionLogger.getStats();
      setStats(currentStats);

      const currentAnalysis = await feedbackProcessor.processFeedback();
      setAnalysis(currentAnalysis);
    } catch (error) {
      console.error('Error loading feedback stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin i-svg-spinners:180-ring-with-bg w-12 h-12" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center p-8 text-gray-500">
        No feedback data available yet.
      </div>
    );
  }

  return (
    <div className={`feedback-dashboard ${className}`}>
      {/* Tab Navigation */}
      <div className="flex gap-4 mb-6 border-b">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 -mb-px ${
            activeTab === 'overview'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-600'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('patterns')}
          className={`px-4 py-2 -mb-px ${
            activeTab === 'patterns'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-600'
          }`}
        >
          Patterns
        </button>
        <button
          onClick={() => setActiveTab('insights')}
          className={`px-4 py-2 -mb-px ${
            activeTab === 'insights'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-600'
          }`}
        >
          Insights
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <StatCard
            title="Total Suggestions"
            value={stats.totalSuggestions}
            icon="i-ph:lightbulb"
          />
          <StatCard
            title="Acceptance Rate"
            value={`${((stats.acceptedSuggestions / stats.totalSuggestions) * 100).toFixed(1)}%`}
            icon="i-ph:check-circle"
            trend={stats.acceptedSuggestions > stats.rejectedSuggestions ? 'up' : 'down'}
          />
          <StatCard
            title="Average Response Time"
            value={`${(stats.averageAcceptanceTime / 1000).toFixed(2)}s`}
            icon="i-ph:clock"
          />
        </div>
      )}

      {/* Patterns Tab */}
      {activeTab === 'patterns' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium mb-4">Top Performing Patterns</h3>
            <div className="space-y-4">
              {analysis?.patterns.topPatterns.slice(0, 5).map((pattern: any, index: number) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded"
                >
                  <div className="flex-1">
                    <div className="font-medium">{pattern.pattern}</div>
                    <div className="text-sm text-gray-500">
                      {(pattern.acceptanceRate * 100).toFixed(1)}% acceptance rate
                    </div>
                  </div>
                  <div className="text-green-500">
                    <span className="i-ph:trend-up text-xl" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium mb-4">Patterns Needing Improvement</h3>
            <div className="space-y-4">
              {analysis?.patterns.problematicPatterns.slice(0, 5).map((pattern: any, index: number) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded"
                >
                  <div className="flex-1">
                    <div className="font-medium">{pattern.pattern}</div>
                    <div className="text-sm text-gray-500">
                      Issues: {pattern.issues.join(', ')}
                    </div>
                  </div>
                  <div className="text-red-500">
                    <span className="i-ph:trend-down text-xl" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Insights Tab */}
      {activeTab === 'insights' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium mb-4">Performance Insights</h3>
            <div className="space-y-4">
              <InsightCard
                title="Suggestion Quality"
                value={(analysis?.performance.suggestionQuality * 100).toFixed(1)}
                description="Overall quality score based on acceptance and modification rates"
                type={analysis?.performance.suggestionQuality > 0.7 ? 'positive' : 'neutral'}
              />
              <InsightCard
                title="Context Relevance"
                value={(analysis?.performance.contextRelevance * 100).toFixed(1)}
                description="How well suggestions match the current context"
                type={analysis?.performance.contextRelevance > 0.7 ? 'positive' : 'neutral'}
              />
              <InsightCard
                title="Response Time"
                value={`${(stats.averageAcceptanceTime / 1000).toFixed(2)}s`}
                description="Average time to accept a suggestion"
                type={stats.averageAcceptanceTime < 2000 ? 'positive' : 'neutral'}
              />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium mb-4">Recommendations</h3>
            <div className="space-y-4">
              {analysis?.rules.suggestedAdjustments.map((adjustment: any, index: number) => (
                <div key={index} className="p-3 bg-gray-50 rounded">
                  <div className="font-medium">{adjustment.ruleId}</div>
                  <div className="text-sm text-gray-500">
                    Suggested changes: {adjustment.adjustments.join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: string;
  trend?: 'up' | 'down';
}

function StatCard({ title, value, icon, trend }: StatCardProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-2">
        <span className={`${icon} text-2xl text-gray-600`} />
        {trend && (
          <span
            className={`${
              trend === 'up' ? 'text-green-500' : 'text-red-500'
            } text-sm font-medium`}
          >
            <span className={trend === 'up' ? 'i-ph:trend-up' : 'i-ph:trend-down'} />
          </span>
        )}
      </div>
      <div className="text-2xl font-bold mb-1">{value}</div>
      <div className="text-gray-500 text-sm">{title}</div>
    </div>
  );
}

interface InsightCardProps {
  title: string;
  value: string;
  description: string;
  type: 'positive' | 'negative' | 'neutral';
}

function InsightCard({ title, value, description, type }: InsightCardProps) {
  const getTypeStyles = () => {
    switch (type) {
      case 'positive':
        return 'bg-green-50 text-green-700';
      case 'negative':
        return 'bg-red-50 text-red-700';
      default:
        return 'bg-gray-50 text-gray-700';
    }
  };

  return (
    <div className={`p-4 rounded-lg ${getTypeStyles()}`}>
      <div className="flex justify-between items-start mb-2">
        <div className="font-medium">{title}</div>
        <div className="text-lg font-bold">{value}%</div>
      </div>
      <div className="text-sm opacity-75">{description}</div>
    </div>
  );
}
