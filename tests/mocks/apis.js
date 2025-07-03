// 外部API モック

const { mockChatGPTResponse, mockTwitterAPIResponse } = require('../fixtures/sampleData');

// OpenAI API モック
const mockOpenAI = {
    chat: {
        completions: {
            create: jest.fn()
        }
    }
};

// Axios モック
const mockAxios = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
    request: jest.fn(),
    defaults: {
        headers: {
            common: {}
        }
    }
};

// Fetch モック
const mockFetch = jest.fn();

// Discord Webhook モック
const mockDiscordWebhook = {
    send: jest.fn(),
    edit: jest.fn(),
    delete: jest.fn()
};

// モック関数のリセット
const resetAPIMocks = () => {
    mockOpenAI.chat.completions.create.mockReset();
    mockAxios.get.mockReset();
    mockAxios.post.mockReset();
    mockAxios.put.mockReset();
    mockAxios.delete.mockReset();
    mockAxios.patch.mockReset();
    mockFetch.mockReset();
    mockDiscordWebhook.send.mockReset();
};

// よく使うモック設定
const setupSuccessfulChatGPTMock = (customResponse = null) => {
    mockOpenAI.chat.completions.create.mockResolvedValue(
        customResponse || mockChatGPTResponse
    );
};

const setupSuccessfulTwitterAPIMock = (customResponse = null) => {
    mockAxios.get.mockResolvedValue({
        status: 200,
        data: customResponse || mockTwitterAPIResponse
    });
};

const setupSuccessfulDiscordMock = () => {
    mockAxios.post.mockResolvedValue({
        status: 200,
        data: { message: 'Discord message sent successfully' }
    });
    mockDiscordWebhook.send.mockResolvedValue({ id: 'webhook-message-id' });
};

const setupSuccessfulRailwayWorkerMock = () => {
    mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
            success: true,
            accepted: true,
            jobType: 'manual_analysis',
            requestId: 'test-request-id'
        })
    });
};

// エラー状況のモック
const setupChatGPTError = (error = new Error('OpenAI API error')) => {
    mockOpenAI.chat.completions.create.mockRejectedValue(error);
};

const setupTwitterAPIError = (status = 500, message = 'Twitter API error') => {
    mockAxios.get.mockRejectedValue({
        response: {
            status: status,
            data: { error: message }
        },
        message: message
    });
};

const setupDiscordError = (error = new Error('Discord webhook error')) => {
    mockAxios.post.mockRejectedValue(error);
    mockDiscordWebhook.send.mockRejectedValue(error);
};

const setupRailwayWorkerError = (status = 500) => {
    mockFetch.mockResolvedValue({
        ok: false,
        status: status,
        json: jest.fn().mockResolvedValue({
            success: false,
            error: 'Railway Worker error'
        })
    });
};

// レート制限エラー
const setupRateLimitError = (apiType = 'twitter') => {
    const rateLimitError = {
        response: {
            status: 429,
            data: { error: 'Rate limit exceeded' },
            headers: {
                'x-rate-limit-reset': Math.floor(Date.now() / 1000) + 3600
            }
        }
    };

    if (apiType === 'twitter') {
        mockAxios.get.mockRejectedValue(rateLimitError);
    } else if (apiType === 'openai') {
        mockOpenAI.chat.completions.create.mockRejectedValue(new Error('Rate limit exceeded'));
    }
};

// タイムアウトエラー
const setupTimeoutError = (apiType = 'all') => {
    const timeoutError = new Error('Request timeout');
    timeoutError.code = 'ETIMEDOUT';

    if (apiType === 'all' || apiType === 'twitter') {
        mockAxios.get.mockRejectedValue(timeoutError);
    }
    if (apiType === 'all' || apiType === 'openai') {
        mockOpenAI.chat.completions.create.mockRejectedValue(timeoutError);
    }
    if (apiType === 'all' || apiType === 'railway') {
        mockFetch.mockRejectedValue(timeoutError);
    }
};

// ネットワークエラー
const setupNetworkError = () => {
    const networkError = new Error('Network error');
    networkError.code = 'ENOTFOUND';

    mockAxios.get.mockRejectedValue(networkError);
    mockAxios.post.mockRejectedValue(networkError);
    mockOpenAI.chat.completions.create.mockRejectedValue(networkError);
    mockFetch.mockRejectedValue(networkError);
};

module.exports = {
    mockOpenAI,
    mockAxios,
    mockFetch,
    mockDiscordWebhook,
    resetAPIMocks,
    setupSuccessfulChatGPTMock,
    setupSuccessfulTwitterAPIMock,
    setupSuccessfulDiscordMock,
    setupSuccessfulRailwayWorkerMock,
    setupChatGPTError,
    setupTwitterAPIError,
    setupDiscordError,
    setupRailwayWorkerError,
    setupRateLimitError,
    setupTimeoutError,
    setupNetworkError
};