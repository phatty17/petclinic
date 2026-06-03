import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';

import {
  cleanDatabase,
  closeTestApp,
  createTestApp,
  ensureSchema,
  getDataSource,
  isDbAvailable,
} from './test-app';
import { savePet, savePetType, saveOwner } from './fixtures';
import { todayIso } from './fixtures';
import { Owner } from '../src/owners/owner.entity';
import { PetType } from '../src/pet-types/pet-type.entity';

/**
 * End-to-end tests for the owners endpoints.
 * Covers owner CRUD, last-name filter, nested pet read/update, and validation.
 */
describe('OwnerController (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let available = false;

  let ownerId: number;
  let petId: number;
  let petTypeId: number;
  let georgeOwner: Owner;
  let dogType: PetType;

  beforeAll(async () => {
    available = await isDbAvailable();
    if (!available) {
      return;
    }
    await ensureSchema();
    app = await createTestApp();
    ds = getDataSource();
  });

  afterAll(async () => {
    if (available) {
      await closeTestApp();
    }
  });

  beforeEach(async () => {
    if (!available) {
      return;
    }
    await cleanDatabase();
    const owner = await saveOwner(ds, { firstName: 'George', lastName: 'Franklin' });
    georgeOwner = owner;
    ownerId = owner.id;
    const type = await savePetType(ds, 'dog');
    dogType = type;
    petTypeId = type.id;
    const pet = await savePet(ds, owner, type, { name: 'Rosy', birthDate: todayIso() });
    petId = pet.id;
  });

  const http = () => request(app.getHttpServer());

  it('getByIdOk', async () => {
    if (!available) return;
    const res = await http().get(`/api/owners/${ownerId}`).expect(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.id).toBe(ownerId);
    expect(res.body.firstName).toBe('George');
    expect(res.body.lastName).toBe('Franklin');
  });

  it('getById_notFound', async () => {
    if (!available) return;
    await http().get('/api/owners/99999').expect(404);
  });

  it('count_returnsOwnerCount', async () => {
    if (!available) return;
    const res = await http().get('/api/owners/count').expect(200);
    expect(Number(res.text)).toBe(1);
  });

  it('getAll', async () => {
    if (!available) return;
    const res = await http().get('/api/owners').expect(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    const match = res.body.content.find((o: { id: number }) => o.id === ownerId);
    expect(match).toMatchObject({ id: ownerId, firstName: 'George', lastName: 'Franklin' });
  });

  // GET /api/owners?q= — case-insensitive 'contains' over the visible table
  // content: "first last" name, address, city, telephone, and pet names.
  // Each positive test saves a decoy owner that must NOT match, so the
  // assertions fail against the old return-everything behaviour.
  const saveDecoyOwner = () =>
    saveOwner(ds, {
      firstName: 'Zara',
      lastName: 'Quibble',
      address: 'Decoy Lane 1',
      city: 'Nowhere',
      telephone: '0000000000',
    });

  const ids = (body: { content: { id: number }[] }) => body.content.map((o) => o.id);

  it('search_byLastNameFragment_caseInsensitive', async () => {
    if (!available) return;
    await saveDecoyOwner();
    const res = await http().get('/api/owners').query({ q: 'rANKl' }).expect(200);
    expect(ids(res.body)).toEqual([ownerId]);
  });

  it('search_byFirstNameFragment', async () => {
    if (!available) return;
    await saveDecoyOwner();
    const res = await http().get('/api/owners').query({ q: 'eorg' }).expect(200);
    expect(ids(res.body)).toEqual([ownerId]);
  });

  it('search_byConcatenatedVisibleName', async () => {
    if (!available) return;
    await saveDecoyOwner();
    const res = await http().get('/api/owners').query({ q: 'george fra' }).expect(200);
    expect(ids(res.body)).toEqual([ownerId]);
  });

  it('search_reversedNameOrder_doesNotMatch', async () => {
    if (!available) return;
    const res = await http().get('/api/owners').query({ q: 'franklin geo' }).expect(200);
    expect(res.body.content).toEqual([]);
  });

  it('search_byAddressFragment', async () => {
    if (!available) return;
    await saveDecoyOwner();
    const res = await http().get('/api/owners').query({ q: 'aker st' }).expect(200);
    expect(ids(res.body)).toEqual([ownerId]);
  });

  it('search_byCityFragment', async () => {
    if (!available) return;
    await saveDecoyOwner();
    const res = await http().get('/api/owners').query({ q: 'ONDO' }).expect(200);
    expect(ids(res.body)).toEqual([ownerId]);
  });

  it('search_byTelephoneFragment', async () => {
    if (!available) return;
    await saveDecoyOwner();
    const res = await http().get('/api/owners').query({ q: '345678' }).expect(200);
    expect(ids(res.body)).toEqual([ownerId]);
  });

  it('search_byPetName_returnsOwnerWithAllPets', async () => {
    if (!available) return;
    await saveDecoyOwner();
    await savePet(ds, georgeOwner, dogType, { name: 'Max' });
    const res = await http().get('/api/owners').query({ q: 'osy' }).expect(200);
    expect(ids(res.body)).toEqual([ownerId]);
    const petNames = res.body.content[0].pets.map((p: { name: string }) => p.name).sort();
    expect(petNames).toEqual(['Max', 'Rosy']);
  });

  it('search_treatsLikeWildcardsLiterally', async () => {
    if (!available) return;
    const discount = await saveOwner(ds, { lastName: 'Wild', address: '50% Discount Rd' });
    const res = await http().get('/api/owners').query({ q: '50%' }).expect(200);
    expect(ids(res.body)).toEqual([discount.id]);

    const underscore = await http().get('/api/owners').query({ q: '_' }).expect(200);
    expect(underscore.body.content).toEqual([]);
  });

  it('search_noMatch_returnsEmpty', async () => {
    if (!available) return;
    const res = await http().get('/api/owners').query({ q: 'zzz-no-such' }).expect(200);
    expect(res.body.content).toEqual([]);
  });

  it('search_emptyQ_returnsAllOwners', async () => {
    if (!available) return;
    const decoy = await saveDecoyOwner();
    const res = await http().get('/api/owners').query({ q: '' }).expect(200);
    expect(ids(res.body)).toEqual([ownerId, decoy.id]);
  });

  it('update_ok', async () => {
    if (!available) return;
    const existing = (await http().get(`/api/owners/${ownerId}`).expect(200)).body;
    existing.firstName = 'GeorgeI';
    await http().put(`/api/owners/${ownerId}`).send(existing).expect(200);

    const updated = (await http().get(`/api/owners/${ownerId}`).expect(200)).body;
    expect(updated.firstName).toBe('GeorgeI');
  });

  it('update_okNoBodyId', async () => {
    if (!available) return;
    const existing = (await http().get(`/api/owners/${ownerId}`).expect(200)).body;
    delete existing.id;
    existing.firstName = 'GeorgeII';
    await http().put(`/api/owners/${ownerId}`).send(existing).expect(200);

    const updated = (await http().get(`/api/owners/${ownerId}`).expect(200)).body;
    expect(updated.firstName).toBe('GeorgeII');
  });

  it('update_invalid', async () => {
    if (!available) return;
    const existing = (await http().get(`/api/owners/${ownerId}`).expect(200)).body;
    existing.firstName = ''; // invalid firstName (@Length min 1)
    await http().put(`/api/owners/${ownerId}`).send(existing).expect(400);
  });

  // deleteOwner loads the owner together with its pets (and their visits) and
  // removes them bottom-up before deleting the owner, so deleting an owner that
  // still has a pet cascades cleanly.
  it('delete_ok (cascades owner+pet)', async () => {
    if (!available) return;
    await http().delete(`/api/owners/${ownerId}`).expect(200);
    await http().get(`/api/owners/${ownerId}`).expect(404);
  });

  // Companion to delete_ok that DOES pass today: deleting an owner with no pets.
  it('delete_ok (owner without pets)', async () => {
    if (!available) return;
    const lonely = await saveOwner(ds, { lastName: 'NoPets' });
    await http().delete(`/api/owners/${lonely.id}`).expect(200);
    await http().get(`/api/owners/${lonely.id}`).expect(404);
  });

  it('delete_notFound', async () => {
    if (!available) return;
    await http().delete('/api/owners/9999').expect(404);
  });

  it('createPet_invalid (missing name)', async () => {
    if (!available) return;
    const newPet = {
      birthDate: todayIso(),
      type: { id: petTypeId, name: 'dog' },
      // missing name -> validation error
    };
    await http().post(`/api/owners/${ownerId}/pets`).send(newPet).expect(400);
  });

  it('createPet_ok (201 + Location)', async () => {
    if (!available) return;
    const newPet = {
      name: 'Thor',
      birthDate: '2020-01-15',
      type: { id: petTypeId, name: 'dog' },
    };
    const res = await http().post(`/api/owners/${ownerId}/pets`).send(newPet).expect(201);
    expect(res.headers['location']).toMatch(/^\/api\/pets\/\d+$/);
  });

  it('getOwnerPet_ok', async () => {
    if (!available) return;
    const res = await http().get(`/api/owners/${ownerId}/pets/${petId}`).expect(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.id).toBe(petId);
    expect(res.body.name).toBe('Rosy');
  });

  it('getOwnerPet_ownerNotFound', async () => {
    if (!available) return;
    await http().get(`/api/owners/99999/pets/${petId}`).expect(404);
  });

  it('getOwnerPet_petNotFound', async () => {
    if (!available) return;
    await http().get(`/api/owners/${ownerId}/pets/99999`).expect(404);
  });

  it('updateOwnerPet_ok', async () => {
    if (!available) return;
    const petDto = {
      id: petId,
      name: 'Rosy Updated',
      birthDate: '2020-01-15',
      type: { id: petTypeId, name: 'dog' },
    };
    await http().put(`/api/owners/${ownerId}/pets/${petId}`).send(petDto).expect(200);
  });

  it('updateOwnerPet_ownerNotFound (still updates the pet by id -> 200)', async () => {
    if (!available) return;
    const petDto = {
      name: 'Thor',
      birthDate: todayIso(),
      type: { id: petTypeId, name: 'dog' },
    };
    // The controller looks up the pet by petId, not the owner.
    await http().put(`/api/owners/99999/pets/${petId}`).send(petDto).expect(200);
  });

  it('updateOwnerPet_petNotFound', async () => {
    if (!available) return;
    const petDto = {
      name: 'Ghost',
      birthDate: '2020-01-01',
      type: { id: petTypeId, name: 'dog' },
    };
    await http().put(`/api/owners/${ownerId}/pets/99999`).send(petDto).expect(404);
  });
});
