import React from 'react';
import { TemplateStorage, Template, TemplateFilter } from '../../lib/templates/storage';

interface TemplateBrowserProps {
  onSelect?: (template: Template) => void;
  onEdit?: (template: Template) => void;
  onDelete?: (template: Template) => void;
  className?: string;
}

export const TemplateBrowser: React.FC<TemplateBrowserProps> = ({
  onSelect,
  onEdit,
  onDelete,
  className = ''
}) => {
  const [templates, setTemplates] = React.useState<Template[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string>('');
  const [filter, setFilter] = React.useState<TemplateFilter>({});
  const [selectedCategory, setSelectedCategory] = React.useState<string>('');
  const storage = TemplateStorage.getInstance();

  React.useEffect(() => {
    loadTemplates();
  }, [filter]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const results = await storage.findTemplates(filter);
      setTemplates(results);
      setError('');
    } catch (err) {
      setError('Failed to load templates');
      console.error('Error loading templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (searchTerm: string) => {
    setFilter(prev => ({ ...prev, search: searchTerm || undefined }));
  };

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    setFilter(prev => ({ ...prev, category: category || undefined }));
  };

  const handleDelete = async (template: Template) => {
    if (!window.confirm('Are you sure you want to delete this template?')) {
      return;
    }

    try {
      await storage.deleteTemplate(template.id);
      onDelete?.(template);
      await loadTemplates();
    } catch (err) {
      setError('Failed to delete template');
      console.error('Error deleting template:', err);
    }
  };

  const categories = React.useMemo(() => {
    const uniqueCategories = new Set(templates.map(t => t.category));
    return Array.from(uniqueCategories).sort();
  }, [templates]);

  if (loading && !templates.length) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${className}`}>
      <div className="flex items-center space-x-4 mb-4">
        <div className="flex-1">
          <input
            type="search"
            placeholder="Search templates..."
            className="w-full px-4 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            onChange={e => handleSearch(e.target.value)}
          />
        </div>
        <select
          value={selectedCategory}
          onChange={e => handleCategorySelect(e.target.value)}
          className="px-4 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Categories</option>
          {categories.map(category => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="bg-red-50 text-red-500 p-3 rounded-md mb-4">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map(template => (
          <div
            key={template.id}
            className="border rounded-lg p-4 hover:shadow-lg transition-shadow"
          >
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-lg font-medium">{template.name}</h3>
              <div className="flex items-center space-x-2">
                {onEdit && (
                  <button
                    onClick={() => onEdit(template)}
                    className="text-gray-500 hover:text-blue-500"
                  >
                    Edit
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => handleDelete(template)}
                    className="text-gray-500 hover:text-red-500"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
            <p className="text-gray-600 mb-2">{template.description}</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {template.tags.map(tag => (
                <span
                  key={tag}
                  className="px-2 py-1 text-xs bg-gray-100 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
            <div className="flex justify-between items-center text-sm text-gray-500">
              <span>Version {template.version}</span>
              <span>{template.usageCount} uses</span>
            </div>
            {onSelect && (
              <button
                onClick={() => onSelect(template)}
                className="mt-3 w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Use Template
              </button>
            )}
          </div>
        ))}
      </div>

      {!loading && !templates.length && (
        <div className="text-center text-gray-500 py-8">
          No templates found. Try adjusting your search or category filter.
        </div>
      )}
    </div>
  );
};
