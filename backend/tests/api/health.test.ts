import request from 'supertest';
import app from '../../src/index';

// Note: These tests run against the actual Express app.
// For CI without a real DB, mock the Prisma client.

jest.mock('@prisma/client', () => {
  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    draw: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      upsert: jest.fn(),
    },
    prediction: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      upsert: jest.fn(),
    },
    strategyStats: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    chatMessage: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    },
    $disconnect: jest.fn(),
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

jest.mock('../../src/services/supabase', () => ({
  default: {
    from: jest.fn().mockReturnValue({
      upsert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: {}, error: null }) }),
      }),
    }),
  },
  supabaseAdmin: {},
}));

describe('Health Endpoint', () => {
  test('GET /health returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
  });
});

describe('Draws API', () => {
  test('GET /api/draws/latest returns data', async () => {
    const res = await request(app).get('/api/draws/latest');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('nextDrawDate');
  });

  test('GET /api/draws/history returns array', async () => {
    const res = await request(app).get('/api/draws/history?limit=10');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('Users API', () => {
  test('POST /api/users/register validates required fields', async () => {
    const res = await request(app).post('/api/users/register').send({
      name: '', email: 'invalid', dob: '1990-01-01', gender: 'X',
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

describe('Auth Middleware', () => {
  test('Protected routes return 401 without token', async () => {
    const res = await request(app).get('/api/users/profile');
    expect(res.status).toBe(401);
  });

  test('Protected routes return 401 with invalid token', async () => {
    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
  });
});
