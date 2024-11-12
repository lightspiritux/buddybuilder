import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TemplateEditor } from '../TemplateEditor';
import { TemplateStorage, Template } from '../../../lib/templates/storage';

// Mock template storage
vi.mock('../../../lib/templates/storage', () => ({
  TemplateStorage: {
    getInstance: vi.fn(() => ({
      createTemplate: vi.fn(async (template) => ({
        ...template,
        id: 'test-id',
        createdAt: new Date(),
        updatedAt: new Date(),
        usageCount: 0
      })),
      updateTemplate: vi.fn(async (id, updates) => ({
        ...updates,
        id,
        createdAt: new Date(),
        updatedAt: new Date(),
        usageCount: 0
      })),
      getTemplate: vi.fn(async () => ({
        id: 'test-id',
        name: 'Test Template',
        description: 'Test Description',
        content: 'Test Content',
        category: 'test',
        tags: ['test', 'example'],
        version: '1.0.0',
        author: 'test-user',
        isPublic: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        usageCount: 0
      }))
    }))
  }
}));

describe('TemplateEditor', () => {
  const mockOnSave = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Create Mode', () => {
    it('renders empty form in create mode', () => {
      render(<TemplateEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

      expect(screen.getByLabelText(/name/i)).toHaveValue('');
      expect(screen.getByLabelText(/description/i)).toHaveValue('');
      expect(screen.getByLabelText(/content/i)).toHaveValue('');
      expect(screen.getByLabelText(/category/i)).toHaveValue('');
      expect(screen.getByLabelText(/tags/i)).toHaveValue('');
      expect(screen.getByLabelText(/version/i)).toHaveValue('1.0.0');
      expect(screen.getByLabelText(/public/i)).toBeChecked();
    });

    it('submits new template successfully', async () => {
      render(<TemplateEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

      await userEvent.type(screen.getByLabelText(/name/i), 'New Template');
      await userEvent.type(screen.getByLabelText(/description/i), 'New Description');
      await userEvent.type(screen.getByLabelText(/content/i), 'New Content');
      await userEvent.type(screen.getByLabelText(/category/i), 'new');
      await userEvent.type(screen.getByLabelText(/tags/i), 'new, template');

      fireEvent.submit(screen.getByRole('form'));

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalled();
      });

      const storage = TemplateStorage.getInstance();
      expect(storage.createTemplate).toHaveBeenCalledWith(expect.objectContaining({
        name: 'New Template',
        description: 'New Description',
        content: 'New Content',
        category: 'new',
        tags: ['new', 'template']
      }));
    });

    it('validates required fields', async () => {
      render(<TemplateEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

      fireEvent.submit(screen.getByRole('form'));

      await waitFor(() => {
        expect(mockOnSave).not.toHaveBeenCalled();
      });

      expect(screen.getByLabelText(/name/i)).toBeInvalid();
      expect(screen.getByLabelText(/description/i)).toBeInvalid();
      expect(screen.getByLabelText(/content/i)).toBeInvalid();
      expect(screen.getByLabelText(/category/i)).toBeInvalid();
    });
  });

  describe('Edit Mode', () => {
    it('loads existing template data', async () => {
      render(<TemplateEditor templateId="test-id" onSave={mockOnSave} onCancel={mockOnCancel} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/name/i)).toHaveValue('Test Template');
        expect(screen.getByLabelText(/description/i)).toHaveValue('Test Description');
        expect(screen.getByLabelText(/content/i)).toHaveValue('Test Content');
        expect(screen.getByLabelText(/category/i)).toHaveValue('test');
        expect(screen.getByLabelText(/tags/i)).toHaveValue('test, example');
        expect(screen.getByLabelText(/version/i)).toHaveValue('1.0.0');
        expect(screen.getByLabelText(/public/i)).toBeChecked();
      });
    });

    it('updates template successfully', async () => {
      render(<TemplateEditor templateId="test-id" onSave={mockOnSave} onCancel={mockOnCancel} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/name/i)).toHaveValue('Test Template');
      });

      await userEvent.clear(screen.getByLabelText(/name/i));
      await userEvent.type(screen.getByLabelText(/name/i), 'Updated Template');

      fireEvent.submit(screen.getByRole('form'));

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalled();
      });

      const storage = TemplateStorage.getInstance();
      expect(storage.updateTemplate).toHaveBeenCalledWith('test-id', expect.objectContaining({
        name: 'Updated Template'
      }));
    });
  });

  describe('Error Handling', () => {
    it('displays error message on save failure', async () => {
      const storage = TemplateStorage.getInstance();
      vi.mocked(storage.createTemplate).mockRejectedValueOnce(new Error('Save failed'));

      render(<TemplateEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

      await userEvent.type(screen.getByLabelText(/name/i), 'New Template');
      await userEvent.type(screen.getByLabelText(/description/i), 'New Description');
      await userEvent.type(screen.getByLabelText(/content/i), 'New Content');
      await userEvent.type(screen.getByLabelText(/category/i), 'new');

      fireEvent.submit(screen.getByRole('form'));

      await waitFor(() => {
        expect(screen.getByText(/failed to save template/i)).toBeInTheDocument();
      });
    });

    it('displays error message on load failure', async () => {
      const storage = TemplateStorage.getInstance();
      vi.mocked(storage.getTemplate).mockRejectedValueOnce(new Error('Load failed'));

      render(<TemplateEditor templateId="test-id" onSave={mockOnSave} onCancel={mockOnCancel} />);

      await waitFor(() => {
        expect(screen.getByText(/failed to load template/i)).toBeInTheDocument();
      });
    });
  });

  describe('UI Interactions', () => {
    it('handles cancel button click', () => {
      render(<TemplateEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

      fireEvent.click(screen.getByText(/cancel/i));
      expect(mockOnCancel).toHaveBeenCalled();
    });

    it('disables submit button while saving', async () => {
      const storage = TemplateStorage.getInstance();
      let resolveCreate: (value: Template) => void = () => {};
      vi.mocked(storage.createTemplate).mockImplementationOnce(() => new Promise(resolve => {
        resolveCreate = resolve;
      }));

      render(<TemplateEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

      await userEvent.type(screen.getByLabelText(/name/i), 'New Template');
      await userEvent.type(screen.getByLabelText(/description/i), 'New Description');
      await userEvent.type(screen.getByLabelText(/content/i), 'New Content');
      await userEvent.type(screen.getByLabelText(/category/i), 'new');

      fireEvent.submit(screen.getByRole('form'));

      expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();

      resolveCreate({
        id: 'test-id',
        name: 'New Template',
        description: 'New Description',
        content: 'New Content',
        category: 'new',
        tags: [],
        version: '1.0.0',
        author: 'test-user',
        isPublic: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        usageCount: 0
      });
    });
  });
});
