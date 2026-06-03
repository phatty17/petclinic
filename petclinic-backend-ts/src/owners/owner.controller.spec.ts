import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';

import { OwnerController } from './owner.controller';
import { Owner } from './owner.entity';
import { Pet } from '../pets/pet.entity';
import { Visit } from '../visits/visit.entity';
import { PetType } from '../pet-types/pet-type.entity';
import { validationExceptionFactory } from '../common/all-exceptions.filter';

/**
 * Unit tests for OwnerController.listOwners pagination: the controller is
 * wired with mocked TypeORM repositories (no database), behind the same
 * global ValidationPipe configuration as main.ts so query-param validation
 * is exercised end-to-end through the HTTP layer.
 */
describe('OwnerController.listOwners (unit)', () => {
  let app: INestApplication;

  /** Chainable QueryBuilder stub; getMany/getCount overridable per test. */
  const queryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getCount: jest.fn().mockResolvedValue(0),
  };

  const ownerRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    count: jest.fn().mockResolvedValue(0),
  };

  const emptyRepository = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OwnerController],
      providers: [
        { provide: getRepositoryToken(Owner), useValue: ownerRepository },
        { provide: getRepositoryToken(Pet), useValue: emptyRepository },
        { provide: getRepositoryToken(Visit), useValue: emptyRepository },
        { provide: getRepositoryToken(PetType), useValue: emptyRepository },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mirror the global ValidationPipe wired in main.ts.
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        transformOptions: { enableImplicitConversion: false },
        exceptionFactory: validationExceptionFactory,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    queryBuilder.getMany.mockResolvedValue([]);
    queryBuilder.getCount.mockResolvedValue(0);
  });

  const http = () => request(app.getHttpServer());

  it('returns a Page envelope, not a flat array', async () => {
    const owner = new Owner();
    owner.id = 1;
    owner.firstName = 'George';
    owner.lastName = 'Franklin';
    queryBuilder.getMany.mockResolvedValue([owner]);
    queryBuilder.getCount.mockResolvedValue(1);

    const res = await http().get('/api/owners').expect(200);

    expect(Array.isArray(res.body)).toBe(false);
    expect(res.body).toMatchObject({
      totalElements: 1,
      totalPages: 1,
      number: 0,
      size: 10,
    });
    expect(res.body.content).toHaveLength(1);
    expect(res.body.content[0]).toMatchObject({ id: 1, firstName: 'George', lastName: 'Franklin' });
  });

  it('rejects size=0 with 400', async () => {
    await http().get('/api/owners').query({ size: 0 }).expect(400);
  });

  it('rejects size=101 with 400', async () => {
    await http().get('/api/owners').query({ size: 101 }).expect(400);
  });

  it('rejects page=-1 with 400', async () => {
    await http().get('/api/owners').query({ page: -1 }).expect(400);
  });

  it('applies the expanded sort chain to the content query', async () => {
    await http().get('/api/owners').query({ sort: 'lastName,desc' }).expect(200);

    expect(queryBuilder.orderBy).toHaveBeenCalledWith({
      'owner.lastName': 'DESC',
      'owner.firstName': 'DESC',
      'owner.id': 'ASC',
    });
  });

  it('rejects an unknown sort column with 400', async () => {
    await http().get('/api/owners').query({ sort: 'pets,asc' }).expect(400);
  });
});
