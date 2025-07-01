const AnalysisTemplateManager = require('../railway-worker/workers/AnalysisTemplateManager');
const { Timestamp } = require('firebase/firestore');

// Mock Firestore
const mockDb = {
    collection: jest.fn(),
    doc: jest.fn()
};

const mockAddDoc = jest.fn();
const mockGetDoc = jest.fn();
const mockGetDocs = jest.fn();
const mockUpdateDoc = jest.fn();
const mockDeleteDoc = jest.fn();

// Mock Firebase imports
jest.mock('firebase/firestore', () => ({
    getFirestore: jest.fn(),
    collection: (db, name) => ({ db, name }),
    addDoc: (...args) => mockAddDoc(...args),
    getDoc: (...args) => mockGetDoc(...args),
    getDocs: (...args) => mockGetDocs(...args),
    updateDoc: (...args) => mockUpdateDoc(...args),
    deleteDoc: (...args) => mockDeleteDoc(...args),
    doc: (db, collection, id) => ({ db, collection, id }),
    query: jest.fn((collection, ...conditions) => ({ collection, conditions })),
    where: jest.fn((field, op, value) => ({ field, op, value })),
    Timestamp: {
        now: jest.fn(() => new Date().toISOString()),
        fromDate: jest.fn(date => date.toISOString())
    }
}));

describe('AnalysisTemplateManager', () => {
    let manager;

    beforeEach(() => {
        manager = new AnalysisTemplateManager(mockDb);
        jest.clearAllMocks();
    });

    describe('create', () => {
        it('should create a template with all required fields', async () => {
            const templateData = {
                name: 'Test Template',
                category: 'sentiment',
                description: 'Test description',
                prompt: 'Analyze {{tweets}}',
                maxTokens: 2000,
                temperature: 0.7,
                active: true
            };

            mockAddDoc.mockResolvedValue({ id: 'template-123' });

            const result = await manager.create(templateData);

            expect(mockAddDoc).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'analysis_templates' }),
                expect.objectContaining({
                    ...templateData,
                    createdAt: expect.any(String),
                    updatedAt: expect.any(String),
                    usage: {
                        totalRuns: 0,
                        lastUsed: null
                    }
                })
            );
            expect(result.id).toBe('template-123');
        });
    });

    describe('get', () => {
        it('should retrieve a template by ID', async () => {
            const mockTemplate = {
                name: 'Test Template',
                category: 'sentiment',
                active: true
            };

            mockGetDoc.mockResolvedValue({
                exists: () => true,
                id: 'template-123',
                data: () => mockTemplate
            });

            const result = await manager.get('template-123');

            expect(result).toEqual({
                id: 'template-123',
                ...mockTemplate
            });
        });

        it('should throw error if template not found', async () => {
            mockGetDoc.mockResolvedValue({
                exists: () => false
            });

            await expect(manager.get('non-existent')).rejects.toThrow('Template not found: non-existent');
        });
    });

    describe('list', () => {
        it('should list all templates', async () => {
            const mockTemplates = [
                { id: 'template-1', data: () => ({ name: 'Template 1', category: 'sentiment' }) },
                { id: 'template-2', data: () => ({ name: 'Template 2', category: 'trend' }) }
            ];

            mockGetDocs.mockResolvedValue({
                docs: mockTemplates.map(t => ({
                    id: t.id,
                    data: t.data
                }))
            });

            const result = await manager.list();

            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                id: 'template-1',
                name: 'Template 1',
                category: 'sentiment'
            });
        });

        it('should filter templates by category', async () => {
            const mockTemplates = [
                { id: 'template-1', data: () => ({ name: 'Template 1', category: 'sentiment' }) }
            ];

            mockGetDocs.mockResolvedValue({
                docs: mockTemplates.map(t => ({
                    id: t.id,
                    data: t.data
                }))
            });

            const result = await manager.list({ category: 'sentiment' });

            expect(result).toHaveLength(1);
            expect(result[0].category).toBe('sentiment');
        });
    });

    describe('update', () => {
        it('should update a template', async () => {
            const updates = {
                name: 'Updated Template',
                active: false
            };

            mockUpdateDoc.mockResolvedValue();
            mockGetDoc.mockResolvedValue({
                exists: () => true,
                id: 'template-123',
                data: () => ({ ...updates, updatedAt: new Date().toISOString() })
            });

            const result = await manager.update('template-123', updates);

            expect(mockUpdateDoc).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'template-123' }),
                expect.objectContaining({
                    ...updates,
                    updatedAt: expect.any(String)
                })
            );
            expect(result.name).toBe('Updated Template');
        });
    });

    describe('delete', () => {
        it('should delete a template', async () => {
            mockDeleteDoc.mockResolvedValue();

            const result = await manager.delete('template-123');

            expect(mockDeleteDoc).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'template-123' })
            );
            expect(result).toEqual({ success: true, templateId: 'template-123' });
        });
    });

    describe('validateTemplate', () => {
        it('should validate a valid template', () => {
            const validTemplate = {
                name: 'Valid Template',
                category: 'sentiment',
                prompt: 'Analyze these tweets: {{tweets}}',
                maxTokens: 2000,
                temperature: 0.7
            };

            const errors = manager.validateTemplate(validTemplate);
            expect(errors).toHaveLength(0);
        });

        it('should return errors for invalid template', () => {
            const invalidTemplate = {
                name: '',
                category: 'invalid',
                prompt: 'No placeholder',
                maxTokens: 5000,
                temperature: 2
            };

            const errors = manager.validateTemplate(invalidTemplate);
            expect(errors).toContain('Template name is required');
            expect(errors).toContain('Valid category is required (sentiment, trend, summary, custom)');
            expect(errors).toContain('Prompt must include {{tweets}} placeholder');
            expect(errors).toContain('maxTokens must be between 100 and 4000');
            expect(errors).toContain('temperature must be between 0 and 1');
        });
    });

    describe('incrementUsage', () => {
        it('should increment usage count', async () => {
            mockGetDoc.mockResolvedValue({
                exists: () => true,
                id: 'template-123',
                data: () => ({
                    name: 'Test Template',
                    usage: { totalRuns: 5, lastUsed: null }
                })
            });

            mockUpdateDoc.mockResolvedValue();

            await manager.incrementUsage('template-123');

            expect(mockUpdateDoc).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'template-123' }),
                expect.objectContaining({
                    usage: {
                        totalRuns: 6,
                        lastUsed: expect.any(String)
                    },
                    updatedAt: expect.any(String)
                })
            );
        });
    });

    describe('createDefaultTemplates', () => {
        it('should create all default templates', async () => {
            mockAddDoc.mockResolvedValue({ id: 'new-template' });

            const results = await manager.createDefaultTemplates();

            expect(results).toHaveLength(3);
            expect(results.every(r => r.success)).toBe(true);
            expect(mockAddDoc).toHaveBeenCalledTimes(3);
        });

        it('should handle errors when creating default templates', async () => {
            mockAddDoc
                .mockResolvedValueOnce({ id: 'template-1' })
                .mockRejectedValueOnce(new Error('Creation failed'))
                .mockResolvedValueOnce({ id: 'template-3' });

            const results = await manager.createDefaultTemplates();

            expect(results).toHaveLength(3);
            expect(results[0].success).toBe(true);
            expect(results[1].success).toBe(false);
            expect(results[1].error).toBe('Creation failed');
            expect(results[2].success).toBe(true);
        });
    });
});