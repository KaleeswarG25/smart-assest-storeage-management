import { afterEach, describe, expect, it, vi } from 'vitest';

describe('reportApi', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses the configured API base URL for CSV downloads', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test');
    const { reportApi } = await import('../api/reportApi');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Authentication required.' })
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(reportApi.downloadCsv('asset_inventory')).rejects.toThrow(
      'Authentication required.'
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/reports/asset_inventory/csv',
      expect.objectContaining({ credentials: 'include' })
    );
  });
});
