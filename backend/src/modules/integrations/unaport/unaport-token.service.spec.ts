import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { UnaportTokenService } from './unaport-token.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('UnaportTokenService', () => {
  let service: UnaportTokenService;
  let configService: ConfigService;

  const mockConfig = {
    UNAPORT_BASE_URL: 'https://common.sandbox.unaport.com/api/v1',
    UNAPORT_EMAIL: 'developer@unacores.com',
    UNAPORT_PASSWORD: 'test_password',
    UNAPORT_HTTP_TIMEOUT_MS: '15000',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const mockAxiosInstance = {
      post: jest.fn(),
    };
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnaportTokenService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => (mockConfig as any)[key]),
          },
        },
      ],
    }).compile();

    service = module.get<UnaportTokenService>(UnaportTokenService);
    configService = module.get<ConfigService>(ConfigService);
    service.clearCache();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should fetch tokens on initial login call', async () => {
    const mockResponse = {
      data: {
        access_token: 'mock_access_token',
        refresh_token: 'mock_refresh_token',
        expires_in: 600,
        refresh_expires_in: 1800,
      },
    };
    (service as any).httpClient.post.mockResolvedValue(mockResponse);

    const tokens = await service.getValidTokens();

    expect(tokens).toEqual({
      accessToken: 'mock_access_token',
      refreshToken: 'mock_refresh_token',
    });
    expect((service as any).httpClient.post).toHaveBeenCalledWith(
      'https://common.sandbox.unaport.com/api/v1/public/user/login',
      {
        emailId: 'developer@unacores.com',
        password: 'test_password',
      },
    );
  });

  it('should reuse cached tokens if still valid', async () => {
    const mockResponse = {
      data: {
        access_token: 'cached_access_token',
        refresh_token: 'cached_refresh_token',
        expires_in: 600,
        refresh_expires_in: 1800,
      },
    };
    (service as any).httpClient.post.mockResolvedValue(mockResponse);

    const firstCall = await service.getValidTokens();
    const secondCall = await service.getValidTokens();

    expect(firstCall).toEqual(secondCall);
    expect((service as any).httpClient.post).toHaveBeenCalledTimes(1);
  });

  it('should refresh tokens when access token is near expiry but refresh token is valid', async () => {
    // Manually set cached tokens as expiring soon
    (service as any).cachedTokens = {
      accessToken: 'old_access_token',
      refreshToken: 'valid_refresh_token',
      accessTokenExpiresAt: Date.now() + 1000, // Expiring in 1s (below 60s buffer)
      refreshTokenExpiresAt: Date.now() + 1000000, // Valid
    };

    const refreshResponse = {
      data: {
        access_token: 'new_access_token',
        refresh_token: 'new_refresh_token',
        expires_in: 600,
        refresh_expires_in: 1800,
      },
    };
    (service as any).httpClient.post.mockResolvedValue(refreshResponse);

    const result = await service.getValidTokens();

    expect(result.accessToken).toEqual('new_access_token');
    expect((service as any).httpClient.post).toHaveBeenCalledWith(
      'https://common.sandbox.unaport.com/api/v1/public/user/refreshToken',
      { refresh_token: 'valid_refresh_token' },
    );
  });

  it('should perform re-login if refresh token fails or is expired', async () => {
    (service as any).cachedTokens = {
      accessToken: 'old_access_token',
      refreshToken: 'expired_refresh_token',
      accessTokenExpiresAt: Date.now() - 1000,
      refreshTokenExpiresAt: Date.now() - 1000, // Expired
    };

    const loginResponse = {
      data: {
        access_token: 'relogin_access_token',
        refresh_token: 'relogin_refresh_token',
        expires_in: 600,
        refresh_expires_in: 1800,
      },
    };
    (service as any).httpClient.post.mockResolvedValue(loginResponse);

    const result = await service.getValidTokens();

    expect(result.accessToken).toEqual('relogin_access_token');
    expect((service as any).httpClient.post).toHaveBeenCalledWith(
      'https://common.sandbox.unaport.com/api/v1/public/user/login',
      expect.anything(),
    );
  });

  it('should handle simultaneous token requests using a single flight promise', async () => {
    const mockResponse = {
      data: {
        access_token: 'single_flight_access_token',
        refresh_token: 'single_flight_refresh_token',
        expires_in: 600,
        refresh_expires_in: 1800,
      },
    };
    (service as any).httpClient.post.mockImplementation(
      () => new Promise((res) => setTimeout(() => res(mockResponse), 50)),
    );

    const [res1, res2, res3] = await Promise.all([
      service.getValidTokens(),
      service.getValidTokens(),
      service.getValidTokens(),
    ]);

    expect(res1.accessToken).toBe('single_flight_access_token');
    expect(res2.accessToken).toBe('single_flight_access_token');
    expect(res3.accessToken).toBe('single_flight_access_token');
    expect((service as any).httpClient.post).toHaveBeenCalledTimes(1);
  });
});
