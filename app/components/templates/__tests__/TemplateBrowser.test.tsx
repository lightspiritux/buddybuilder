import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TemplateBrowser } from '../TemplateBrowser';
import { TemplateStorage, Template } from '../../../lib/templates/storage';

const mockTemplates: Template[] = [
  {
    id: '1',
    name: 'React Component',
    description: 'Basic React component template',
    content: 'export const Component = () => {}',
    category: 'frontend',
    tags: ['react', 'typescript'],
    version: '1.0.0',
    author: 'test-user',
    isPublic: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    usageCount: 5
  },
  {
    id: '2',
    name: 'Express Route',
    description: 'Express.js route template',
    content: 'router.get("/", (req, res) => {})',
    category: 'backend',
    tags: ['express', 'nodejs'],
    version: '1.0.0',
    author: 'test-user',
    isPublic: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    usageCount: 3
  }
];

// Mock template storage
vi.mock('../../../lib/templates/storage', () => ({
  TemplateStorage: {
    getInstance: vi.fn(() => ({
      findTemplates: vi.fn(async (filter) => {
        let templates = [...mockTemplates];
        
        if (filter.category) {
          templates = templates.filter(t => t.category === filter.category);
        }
        
        if (filter.search) {
          const searchLower = filter.search.toLowerCase();
          templates = templates.filter(t =>
            t.name.toLowerCase().includes(searchLower) ||
            t.description.toLowerCase().includes(searchLower) ||
            t.tags.some(tag => tag.toLowerCase().includes(searchLower))
          );
        }
        
        return templates;
      }),
      deleteTemplate: vi.fn(async (id) => {
        if (!mockTemplates.find(t => t.id === id)) {
          throw new Error('Template not found');
        }
      })
    }))
  }
}));

describe('TemplateBrowser', () => {
  const mockOnSelect = vi.fn();
  const mockOnEdit = vi.fn();
  const mockOnDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn(() => true);
  });

  it('renders templates correctly', async () => {
    render(
      <TemplateBrowser
        onSelect={mockOnSelect}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('React Component')).toBeInTheDocument();
      expect(screen.getByText('Express Route')).toBeInTheDocument();
    });

    expect(screen.getByText('react')).toBeInTheDocument();
    expect(screen.getByText('typescript')).toBeInTheDocument();
    expect(screen.getByText('express')).toBeInTheDocument();
    expect(screen.getByText('nodejs')).toBeInTheDocument();
  });

  describe('Filtering and Searching', () => {
    it('filters by category', async () => {
      render(<TemplateBrowser onSelect={mockOnSelect} />);

      await waitFor(() => {
        expect(screen.getByText('React Component')).toBeInTheDocument();
      });

      const categorySelect = screen.getByRole('combobox');
      fireEvent.change(categorySelect, { target: { value: 'frontend' } });

      await waitFor(() => {
        expect(screen.getByText('React Component')).toBeInTheDocument();
        expect(screen.queryByText('Express Route')).not.toBeInTheDocument();
      });
    });

    it('searches templates', async () => {
      render(<TemplateBrowser onSelect={mockOnSelect} />);

      await waitFor(() => {
        expect(screen.getByText('React Component')).toBeInTheDocument();
      });

      const searchInput = screen.getByRole('searchbox');
      await userEvent.type(searchInput, 'express');

      await waitFor(() => {
        expect(screen.queryByText('React Component')).not.toBeInTheDocument();
        expect(screen.getByText('Express Route')).toBeInTheDocument();
      });
    });
  });

  describe('Template Actions', () => {
    it('handles template selection', async () => {
      render(<TemplateBrowser onSelect={mockOnSelect} />);

      await waitFor(() => {
        expect(screen.getByText('React Component')).toBeInTheDocument();
      });

      const useButton = screen.getAllByText('Use Template')[0];
      fireEvent.click(useButton);

      expect(mockOnSelect).toHaveBeenCalledWith(mockTemplates[0]);
    });

    it('handles template editing', async () => {
      render(<TemplateBrowser onEdit={mockOnEdit} />);

      await waitFor(() => {
        expect(screen.getByText('React Component')).toBeInTheDocument();
      });

      const editButton = screen.getAllByText('Edit')[0];
      fireEvent.click(editButton);

      expect(mockOnEdit).toHaveBeenCalledWith(mockTemplates[0]);
    });

    it('handles template deletion with confirmation', async () => {
      render(<TemplateBrowser onDelete={mockOnDelete} />);

      await waitFor(() => {
        expect(screen.getByText('React Component')).toBeInTheDocument();
      });

      const deleteButton = screen.getAllByText('Delete')[0];
      fireEvent.click(deleteButton);

      expect(window.confirm).toHaveBeenCalled();
      expect(mockOnDelete).toHaveBeenCalledWith(mockTemplates[0]);
    });

    it('cancels template deletion when not confirmed', async () => {
      window.confirm = vi.fn(() => false);

      render(<TemplateBrowser onDelete={mockOnDelete} />);

      await waitFor(() => {
        expect(screen.getByText('React Component')).toBeInTheDocument();
      });

      const deleteButton = screen.getAllByText('Delete')[0];
      fireEvent.click(deleteButton);

      expect(window.confirm).toHaveBeenCalled();
      expect(mockOnDelete).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('displays error message when loading fails', async () => {
      const storage = TemplateStorage.getInstance();
      vi.mocked(storage.findTemplates).mockRejectedValueOnce(new Error('Failed to load'));

      render(<TemplateBrowser />);

      await waitFor(() => {
        expect(screen.getByText(/failed to load templates/i)).toBeInTheDocument();
      });
    });

    it('displays error message when deletion fails', async () => {
      const storage = TemplateStorage.getInstance();
      vi.mocked(storage.deleteTemplate).mockRejectedValueOnce(new Error('Failed to delete'));

      render(<TemplateBrowser onDelete={mockOnDelete} />);

      await waitFor(() => {
        expect(screen.getByText('React Component')).toBeInTheDocument();
      });

      const deleteButton = screen.getAllByText('Delete')[0];
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText(/failed to delete template/i)).toBeInTheDocument();
      });
    });
  });

  describe('Empty States', () => {
    it('displays message when no templates match filters', async () => {
      const storage = TemplateStorage.getInstance();
      vi.mocked(storage.findTemplates).mockResolvedValueOnce([]);

      render(<TemplateBrowser />);

      await waitFor(() => {
        expect(screen.getByText(/no templates found/i)).toBeInTheDocument();
      });
    });
  });
});
