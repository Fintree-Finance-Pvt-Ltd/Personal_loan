import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { SigningIpService } from './signing-ip.service';

describe('SigningIpService', () => {
  let service: SigningIpService;
  let mockConfigService: Partial<ConfigService>;

  const createServiceWithConfig = (requirePublic = false, allowLoopback = true) => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'ELECTRONIC_SIGN_REQUIRE_PUBLIC_IP') return requirePublic;
        if (key === 'ELECTRONIC_SIGN_ALLOW_LOOPBACK_IP') return allowLoopback;
        if (key === 'ELECTRONIC_SIGN_SHOW_ENVIRONMENT_LABEL') return !requirePublic;
        return undefined;
      }),
    };

    return new SigningIpService(mockConfigService as ConfigService);
  };

  beforeEach(() => {
    service = createServiceWithConfig(false, true);
  });

  describe('normalizeIp', () => {
    it('should normalize IPv4-mapped IPv6 address', () => {
      expect(service.normalizeIp('::ffff:59.184.156.184')).toBe('59.184.156.184');
    });

    it('should convert IPv6 loopback ::1 to 127.0.0.1', () => {
      expect(service.normalizeIp('::1')).toBe('127.0.0.1');
    });

    it('should strip brackets from IPv6 address', () => {
      expect(service.normalizeIp('[2401:4900:abcd::1]')).toBe('2401:4900:abcd::1');
    });

    it('should return empty string for invalid IP strings', () => {
      expect(service.normalizeIp('invalid.ip.string')).toBe('');
      expect(service.normalizeIp('')).toBe('');
      expect(service.normalizeIp(null)).toBe('');
    });
  });

  describe('IP Classification', () => {
    it('should identify loopback IPs', () => {
      expect(service.isLoopbackIp('127.0.0.1')).toBe(true);
      expect(service.isLoopbackIp('127.0.0.5')).toBe(true);
      expect(service.isLoopbackIp('::1')).toBe(true);
      expect(service.isLoopbackIp('59.184.156.184')).toBe(false);
    });

    it('should identify private IPv4 and IPv6 addresses', () => {
      expect(service.isPrivateIp('10.0.0.1')).toBe(true);
      expect(service.isPrivateIp('172.16.5.10')).toBe(true);
      expect(service.isPrivateIp('192.168.1.100')).toBe(true);
      expect(service.isPrivateIp('169.254.1.1')).toBe(true);
      expect(service.isPrivateIp('fe80::1')).toBe(true);
      expect(service.isPrivateIp('fc00::1')).toBe(true);

      expect(service.isPrivateIp('59.184.156.184')).toBe(false);
      expect(service.isPrivateIp('1.1.1.1')).toBe(false);
    });

    it('should identify public IPs correctly', () => {
      expect(service.isPublicIp('59.184.156.184')).toBe(true);
      expect(service.isPublicIp('2401:4900:abcd::1')).toBe(true);
      expect(service.isPublicIp('127.0.0.1')).toBe(false);
      expect(service.isPublicIp('10.0.0.1')).toBe(false);
    });
  });

  describe('Local Development Capture', () => {
    it('should allow 127.0.0.1 in local development mode', () => {
      const localService = createServiceWithConfig(false, true);
      const req = {
        ip: '127.0.0.1',
        headers: {},
        socket: { remoteAddress: '127.0.0.1' },
      };

      const evidence = localService.capture(req);
      expect(evidence.clientIp).toBe('127.0.0.1');
      expect(evidence.environment).toBe('LOCAL');
      expect(evidence.isLoopback).toBe(true);
    });

    it('should normalize ::1 to 127.0.0.1 in local development mode', () => {
      const localService = createServiceWithConfig(false, true);
      const req = {
        ip: '::1',
        headers: {},
        socket: { remoteAddress: '::1' },
      };

      const evidence = localService.capture(req);
      expect(evidence.clientIp).toBe('127.0.0.1');
      expect(evidence.isLoopback).toBe(true);
    });
  });

  describe('UAT / Production Public IP Enforcement', () => {
    it('should throw ServiceUnavailableException when loopback IP is used in UAT/Prod', () => {
      const uatService = createServiceWithConfig(true, false);
      const req = {
        ip: '127.0.0.1',
        headers: {},
        socket: { remoteAddress: '127.0.0.1' },
      };

      expect(() => uatService.capture(req)).toThrow(ServiceUnavailableException);
    });

    it('should throw ServiceUnavailableException when private IP is used in UAT/Prod', () => {
      const uatService = createServiceWithConfig(true, false);
      const req = {
        ip: '192.168.1.50',
        headers: {},
        socket: { remoteAddress: '127.0.0.1' },
      };

      expect(() => uatService.capture(req)).toThrow(ServiceUnavailableException);
    });

    it('should accept valid public IPv4 address in UAT/Prod', () => {
      const uatService = createServiceWithConfig(true, false);
      const req = {
        ip: '59.184.156.184',
        headers: { 'x-forwarded-for': '59.184.156.184' },
        socket: { remoteAddress: '127.0.0.1' },
      };

      const evidence = uatService.capture(req);
      expect(evidence.clientIp).toBe('59.184.156.184');
      expect(evidence.isPublic).toBe(true);
    });

    it('should accept valid public IPv6 address in UAT/Prod', () => {
      const uatService = createServiceWithConfig(true, false);
      const req = {
        ip: '2401:4900:abcd::1',
        headers: { 'x-forwarded-for': '2401:4900:abcd::1' },
        socket: { remoteAddress: '::1' },
      };

      const evidence = uatService.capture(req);
      expect(evidence.clientIp).toBe('2401:4900:abcd::1');
      expect(evidence.isPublic).toBe(true);
    });
  });
});
