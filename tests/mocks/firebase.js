// Firebase モック

const mockFirestore = {
    collection: jest.fn(),
    doc: jest.fn(),
    addDoc: jest.fn(),
    getDoc: jest.fn(),
    getDocs: jest.fn(),
    updateDoc: jest.fn(),
    deleteDoc: jest.fn(),
    query: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn(),
    startAfter: jest.fn(),
    writeBatch: jest.fn(),
    Timestamp: {
        now: jest.fn(() => mockTimestamp()),
        fromDate: jest.fn((date) => ({
            toDate: () => date,
            seconds: Math.floor(date.getTime() / 1000),
            nanoseconds: 0
        }))
    }
};

const mockBatch = {
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    commit: jest.fn().mockResolvedValue()
};

const mockCollection = {
    add: jest.fn(),
    doc: jest.fn(() => ({
        set: jest.fn().mockResolvedValue(),
        update: jest.fn().mockResolvedValue(),
        get: jest.fn().mockResolvedValue(mockFirestoreDoc({})),
        delete: jest.fn().mockResolvedValue()
    }))
};

// Firebase Admin SDK モック（Railway Worker用）
const mockFirebaseAdmin = {
    initializeApp: jest.fn(),
    firestore: jest.fn(() => mockFirestore),
    credential: {
        cert: jest.fn()
    }
};

// Firebase Client SDK モック（フロントエンド用）
const mockFirebaseClient = {
    initializeApp: jest.fn(),
    getFirestore: jest.fn(() => mockFirestore),
    collection: jest.fn(() => mockCollection),
    doc: jest.fn(),
    addDoc: jest.fn().mockResolvedValue({ id: 'mock-doc-id' }),
    getDoc: jest.fn(),
    getDocs: jest.fn(),
    updateDoc: jest.fn().mockResolvedValue(),
    deleteDoc: jest.fn().mockResolvedValue(),
    query: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn(),
    writeBatch: jest.fn(() => mockBatch),
    onSnapshot: jest.fn()
};

// モック関数のリセット
const resetFirebaseMocks = () => {
    Object.values(mockFirestore).forEach(fn => {
        if (typeof fn === 'function' && fn.mockReset) {
            fn.mockReset();
        }
    });
    
    Object.values(mockFirebaseClient).forEach(fn => {
        if (typeof fn === 'function' && fn.mockReset) {
            fn.mockReset();
        }
    });
    
    Object.values(mockBatch).forEach(fn => {
        if (typeof fn === 'function' && fn.mockReset) {
            fn.mockReset();
        }
    });
};

// よく使うモック設定
const setupSuccessfulFirestoreMocks = (data = {}) => {
    mockFirebaseClient.getDocs.mockResolvedValue(
        mockFirestoreSnapshot([mockFirestoreDoc(data)])
    );
    mockFirebaseClient.getDoc.mockResolvedValue(mockFirestoreDoc(data));
    mockFirebaseClient.addDoc.mockResolvedValue({ id: 'new-doc-id' });
    mockFirebaseClient.updateDoc.mockResolvedValue();
    mockFirebaseClient.deleteDoc.mockResolvedValue();
};

const setupEmptyFirestoreMocks = () => {
    mockFirebaseClient.getDocs.mockResolvedValue(mockFirestoreSnapshot([]));
    mockFirebaseClient.getDoc.mockResolvedValue({
        exists: () => false,
        data: () => undefined
    });
};

const setupFirestoreError = (error = new Error('Firestore error')) => {
    mockFirebaseClient.getDocs.mockRejectedValue(error);
    mockFirebaseClient.getDoc.mockRejectedValue(error);
    mockFirebaseClient.addDoc.mockRejectedValue(error);
    mockFirebaseClient.updateDoc.mockRejectedValue(error);
    mockFirebaseClient.deleteDoc.mockRejectedValue(error);
};

module.exports = {
    mockFirestore,
    mockFirebaseAdmin,
    mockFirebaseClient,
    mockBatch,
    mockCollection,
    resetFirebaseMocks,
    setupSuccessfulFirestoreMocks,
    setupEmptyFirestoreMocks,
    setupFirestoreError
};