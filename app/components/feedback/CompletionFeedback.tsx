import React, { useState, useEffect } from 'react';
import { completionLogger } from '~/lib/ml/code-understanding/learning/completion-logger';
import { feedbackProcessor } from '~/lib/ml/code-understanding/learning/feedback-processor';

interface CompletionFeedbackProps {
  suggestionId: string;
  suggestion: string;
  onFeedbackSubmit?: () => void;
  className?: string;
}

export function CompletionFeedback({
  suggestionId,
  suggestion,
  onFeedbackSubmit,
  className = ''
}: CompletionFeedbackProps) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'accept' | 'reject' | 'modify' | null>(null);
  const [modification, setModification] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Reset state when suggestion changes
    setFeedbackType(null);
    setModification('');
    setShowFeedback(false);
  }, [suggestionId]);

  const handleAccept = () => {
    setFeedbackType('accept');
    submitFeedback('accept');
  };

  const handleReject = () => {
    setFeedbackType('reject');
    setShowFeedback(true);
  };

  const handleModify = () => {
    setFeedbackType('modify');
    setShowFeedback(true);
    setModification(suggestion);
  };

  const submitFeedback = async (type: 'accept' | 'reject' | 'modify') => {
    if (submitting) return;

    setSubmitting(true);
    try {
      const startTime = performance.now();
      
      // Log the feedback
      completionLogger.logResponse(suggestionId, {
        type,
        timestamp: Date.now(),
        duration: performance.now() - startTime,
        ...(type === 'modify' && {
          modifications: {
            original: suggestion,
            modified: modification,
            editDistance: calculateEditDistance(suggestion, modification)
          }
        })
      });

      // Process feedback
      await feedbackProcessor.processFeedback();

      onFeedbackSubmit?.();
      setShowFeedback(false);
    } catch (error) {
      console.error('Error submitting feedback:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`completion-feedback ${className}`}>
      <div className="flex gap-2 items-center">
        <button
          onClick={handleAccept}
          disabled={submitting}
          className={`p-1 rounded ${
            feedbackType === 'accept'
              ? 'bg-green-500 text-white'
              : 'bg-gray-100 hover:bg-gray-200'
          }`}
          title="Accept suggestion"
        >
          <span className="i-ph:check-circle text-lg" />
        </button>
        <button
          onClick={handleReject}
          disabled={submitting}
          className={`p-1 rounded ${
            feedbackType === 'reject'
              ? 'bg-red-500 text-white'
              : 'bg-gray-100 hover:bg-gray-200'
          }`}
          title="Reject suggestion"
        >
          <span className="i-ph:x-circle text-lg" />
        </button>
        <button
          onClick={handleModify}
          disabled={submitting}
          className={`p-1 rounded ${
            feedbackType === 'modify'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 hover:bg-gray-200'
          }`}
          title="Modify suggestion"
        >
          <span className="i-ph:pencil-simple text-lg" />
        </button>
      </div>

      {showFeedback && (
        <div className="mt-2 p-4 bg-white rounded shadow-lg">
          {feedbackType === 'reject' && (
            <div className="space-y-2">
              <h3 className="font-medium">Why reject this suggestion?</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => submitFeedback('reject')}
                  className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-sm"
                >
                  Not relevant
                </button>
                <button
                  onClick={() => submitFeedback('reject')}
                  className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-sm"
                >
                  Incorrect
                </button>
                <button
                  onClick={() => submitFeedback('reject')}
                  className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-sm"
                >
                  Not helpful
                </button>
              </div>
            </div>
          )}

          {feedbackType === 'modify' && (
            <div className="space-y-2">
              <h3 className="font-medium">Modify suggestion:</h3>
              <textarea
                value={modification}
                onChange={(e) => setModification(e.target.value)}
                className="w-full h-24 p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={submitting}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowFeedback(false)}
                  className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  onClick={() => submitFeedback('modify')}
                  className="px-3 py-1 rounded bg-blue-500 hover:bg-blue-600 text-white"
                  disabled={submitting || modification === suggestion}
                >
                  Submit
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Calculate Levenshtein distance between two strings
 */
function calculateEditDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1)
    .fill(0)
    .map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) {
    dp[i][0] = i;
  }
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j - 1] + 1, // substitution
          dp[i - 1][j] + 1,     // deletion
          dp[i][j - 1] + 1      // insertion
        );
      }
    }
  }

  return dp[m][n];
}
