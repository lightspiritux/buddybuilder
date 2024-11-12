import React from 'react';
import { TemplateStorage, Template } from '../../lib/templates/storage';

interface TemplateEditorProps {
  templateId?: string;
  onSave?: (template: Template) => void;
  onCancel?: () => void;
  className?: string;
}

export const TemplateEditor: React.FC<TemplateEditorProps> = ({
  templateId,
  onSave,
  onCancel,
  className = ''
}) => {
  const [template, setTemplate] = React.useState<Partial<Template>>({
    name: '',
    description: '',
    content: '',
    category: '',
    tags: [],
    version: '1.0.0',
    isPublic: true
  });
  const [error, setError] = React.useState<string>('');
  const [loading, setLoading] = React.useState(false);
  const storage = TemplateStorage.getInstance();

  React.useEffect(() => {
    if (templateId) {
      loadTemplate(templateId);
    }
  }, [templateId]);

  const loadTemplate = async (id: string) => {
    try {
      setLoading(true);
      const loadedTemplate = await storage.getTemplate(id);
      setTemplate(loadedTemplate);
      setError('');
    } catch (err) {
      setError('Failed to load template');
      console.error('Error loading template:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let savedTemplate: Template;

      if (templateId) {
        savedTemplate = await storage.updateTemplate(templateId, template);
      } else {
        savedTemplate = await storage.createTemplate(template as Omit<Template, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>);
      }

      onSave?.(savedTemplate);
    } catch (err) {
      setError('Failed to save template');
      console.error('Error saving template:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTagsChange = (value: string) => {
    const tags = value.split(',').map(tag => tag.trim()).filter(Boolean);
    setTemplate(prev => ({ ...prev, tags }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`space-y-4 ${className}`}>
      {error && (
        <div className="bg-red-50 text-red-500 p-3 rounded-md">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Name
          <input
            type="text"
            value={template.name}
            onChange={e => setTemplate(prev => ({ ...prev, name: e.target.value }))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            required
          />
        </label>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Description
          <textarea
            value={template.description}
            onChange={e => setTemplate(prev => ({ ...prev, description: e.target.value }))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            rows={3}
            required
          />
        </label>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Content
          <textarea
            value={template.content}
            onChange={e => setTemplate(prev => ({ ...prev, content: e.target.value }))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 font-mono"
            rows={10}
            required
          />
        </label>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Category
          <input
            type="text"
            value={template.category}
            onChange={e => setTemplate(prev => ({ ...prev, category: e.target.value }))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            required
          />
        </label>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Tags (comma-separated)
          <input
            type="text"
            value={template.tags?.join(', ')}
            onChange={e => handleTagsChange(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </label>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Version
          <input
            type="text"
            value={template.version}
            onChange={e => setTemplate(prev => ({ ...prev, version: e.target.value }))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            pattern="^\d+\.\d+\.\d+$"
            title="Version must be in format: x.y.z"
            required
          />
        </label>
      </div>

      <div className="space-y-2">
        <label className="flex items-center space-x-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            checked={template.isPublic}
            onChange={e => setTemplate(prev => ({ ...prev, isPublic: e.target.checked }))}
            className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
          />
          <span>Make this template public</span>
        </label>
      </div>

      <div className="flex justify-end space-x-3 pt-4">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          {loading ? 'Saving...' : templateId ? 'Update Template' : 'Create Template'}
        </button>
      </div>
    </form>
  );
};
