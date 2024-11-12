import React, { useState, useEffect } from 'react';

interface APIKeyManagerProps {
  defaultValue?: string;
  onChange?: (value: string) => void;
}

const APIKeyManager: React.FC<APIKeyManagerProps> = ({ defaultValue = '', onChange }) => {
  const [apiKey, setApiKey] = useState(defaultValue);
  const [isEditing, setIsEditing] = useState(!defaultValue);

  useEffect(() => {
    // Load API key from localStorage on mount
    const storedKey = localStorage.getItem('openai_api_key');
    if (storedKey) {
      setApiKey(storedKey);
      setIsEditing(false);
      onChange?.(storedKey);
    }
  }, [onChange]);

  const handleSave = () => {
    if (apiKey) {
      localStorage.setItem('openai_api_key', apiKey);
      setIsEditing(false);
      onChange?.(apiKey);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    }
  };

  return (
    <div className="flex items-center gap-2">
      {isEditing ? (
        <>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Enter your OpenAI API key"
            className="flex-1 px-3 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          <button
            onClick={handleSave}
            className="px-3 py-1 text-sm text-white bg-blue-500 rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Save
          </button>
        </>
      ) : (
        <>
          <span className="flex-1 text-sm text-gray-600">API Key: ••••••••••••••••</span>
          <button
            onClick={handleEdit}
            className="px-3 py-1 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Edit
          </button>
        </>
      )}
    </div>
  );
};

export default APIKeyManager;
